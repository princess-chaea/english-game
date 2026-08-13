import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const DECK_FILES = [
  'docs/promotion/teacher-quick-guide-detailed.html',
  'docs/promotion/student-quick-guide-detailed.html',
  'docs/promotion/integrated-manual-detailed.html',
];
const VIEWPORT = { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false };
const CDP_TIMEOUT_MS = 20_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class CdpClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.sequence = 0;
    this.pending = new Map();
    this.waiters = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });

    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(`${message.error.message} (${pending.method})`));
        else pending.resolve(message.result);
        return;
      }

      const listeners = this.waiters.get(message.method);
      if (!listeners?.length) return;
      const listener = listeners.shift();
      clearTimeout(listener.timer);
      listener.resolve(message.params);
    });

    this.socket.addEventListener('close', () => {
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error(`CDP socket closed while waiting for ${pending.method}`));
      }
      this.pending.clear();
    });
  }

  async send(method, params = {}, timeout = CDP_TIMEOUT_MS) {
    await this.ready;
    const id = ++this.sequence;
    const response = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out after ${timeout}ms`));
      }, timeout);
      this.pending.set(id, { resolve, reject, timer, method });
    });
    this.socket.send(JSON.stringify({ id, method, params }));
    return response;
  }

  once(method, timeout = CDP_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      const listener = {
        resolve,
        reject,
        timer: setTimeout(() => {
          const listeners = this.waiters.get(method) || [];
          const index = listeners.indexOf(listener);
          if (index >= 0) listeners.splice(index, 1);
          reject(new Error(`${method} timed out after ${timeout}ms`));
        }, timeout),
      };
      const listeners = this.waiters.get(method) || [];
      listeners.push(listener);
      this.waiters.set(method, listeners);
    });
  }

  close() {
    if (this.socket.readyState < WebSocket.CLOSING) this.socket.close();
  }
}

function parseArguments(argv) {
  const outputFlag = argv.findIndex((argument) => argument === '--output');
  const inlineOutput = argv.find((argument) => argument.startsWith('--output='));
  const output = inlineOutput?.slice('--output='.length)
    || (outputFlag >= 0 ? argv[outputFlag + 1] : undefined)
    || process.env.VOCA_DECK_REPORT;
  return { output: output ? path.resolve(output) : null };
}

async function findChromeExecutable() {
  const localAppData = process.env.LOCALAPPDATA || '';
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    localAppData && path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    localAppData && path.join(localAppData, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try the next well-known Chromium executable.
    }
  }
  throw new Error('Chrome/Edge executable not found. Set CHROME_PATH to a Chromium executable.');
}

async function waitForDevToolsPort(profileDir, chromeProcess) {
  const portFile = path.join(profileDir, 'DevToolsActivePort');
  const deadline = Date.now() + CDP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (chromeProcess.exitCode !== null) {
      throw new Error(`Headless Chrome exited before CDP started (code ${chromeProcess.exitCode}).`);
    }
    try {
      const [port, browserPath] = (await fs.readFile(portFile, 'utf8')).trim().split(/\r?\n/);
      if (port && browserPath) {
        return {
          endpoint: `http://127.0.0.1:${port}`,
          browserWebSocketUrl: `ws://127.0.0.1:${port}${browserPath}`,
        };
      }
    } catch {
      // Chrome creates DevToolsActivePort asynchronously.
    }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${portFile}`);
}

async function createTarget(endpoint) {
  const response = await fetch(`${endpoint}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' });
  if (!response.ok) throw new Error(`Could not create Chrome target: HTTP ${response.status}`);
  return response.json();
}

async function evaluate(client, expression) {
  const response = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (response.exceptionDetails) {
    const description = response.exceptionDetails.exception?.description
      || response.exceptionDetails.text
      || 'Runtime.evaluate failed';
    throw new Error(description);
  }
  return response.result?.value;
}

async function waitForDocument(client) {
  const deadline = Date.now() + CDP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const state = await evaluate(client, 'document.readyState');
    if (state === 'complete') break;
    await sleep(100);
  }

  await evaluate(client, `
    (async () => {
      if (document.fonts?.ready) await document.fonts.ready;
      await Promise.all([...document.images].map((image) => {
        if (image.complete) return Promise.resolve();
        return new Promise((resolve) => {
          const finish = () => resolve();
          image.addEventListener('load', finish, { once: true });
          image.addEventListener('error', finish, { once: true });
          setTimeout(finish, 5000);
        });
      }));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return true;
    })()
  `);
}

const AUDIT_EXPRESSION = String.raw`
  (() => {
    const slides = [...document.querySelectorAll('.slide')];
    const majorSelector = [
      '.slide-head', '.screen-layout', '.screen-stage', '.screen-canvas', '.callout-list',
      '.toc-grid', '.feature-grid', '.two-col', '.flow', '.tabs-map', '.promo-layout',
      '.info-box', '.feature-card', '.callout', '.tab-card', '.flow-step', '.wide-shot',
      '.mini-shot', '.promo-shot', '.kpi-row'
    ].join(',');
    const round = (value) => Math.round(value * 100) / 100;
    const metrics = (element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    });
    const selectorFor = (element) => {
      if (element.classList.contains('slide')) return '.slide';
      const className = [...element.classList].join('.');
      return className ? '.' + className : element.tagName.toLowerCase();
    };
    const overflowItems = [];

    slides.forEach((slide, slideIndex) => {
      const candidates = [slide, ...slide.querySelectorAll(majorSelector)];
      [...new Set(candidates)].forEach((element) => {
        const horizontalOverflow = element.scrollWidth > element.clientWidth + 1;
        const verticalOverflow = element.scrollHeight > element.clientHeight + 1;
        if (!horizontalOverflow && !verticalOverflow) return;
        overflowItems.push({
          slideIndex: slideIndex + 1,
          selector: selectorFor(element),
          horizontalOverflow,
          verticalOverflow,
          ...metrics(element),
          overflowX: getComputedStyle(element).overflowX,
          overflowY: getComputedStyle(element).overflowY,
        });
      });
    });

    const brokenImages = [...document.images]
      .filter((image) => image.naturalWidth === 0)
      .map((image) => ({
        slideIndex: slides.findIndex((slide) => slide.contains(image)) + 1 || null,
        src: image.currentSrc || image.src,
        alt: image.alt || '',
        complete: image.complete,
      }));

    const pins = [...document.querySelectorAll('.pin')].map((pin) => {
      const slideIndex = slides.findIndex((slide) => slide.contains(pin)) + 1;
      const stage = pin.closest('.screen-stage');
      const pinRect = pin.getBoundingClientRect();
      const stageRect = stage?.getBoundingClientRect();
      const outside = !stageRect
        || pinRect.left < stageRect.left - 1
        || pinRect.top < stageRect.top - 1
        || pinRect.right > stageRect.right + 1
        || pinRect.bottom > stageRect.bottom + 1;
      return {
        slideIndex,
        label: pin.textContent.trim(),
        outside,
        missingScreenStage: !stage,
        pinRect: {
          left: round(pinRect.left), top: round(pinRect.top),
          right: round(pinRect.right), bottom: round(pinRect.bottom),
        },
        stageRect: stageRect ? {
          left: round(stageRect.left), top: round(stageRect.top),
          right: round(stageRect.right), bottom: round(stageRect.bottom),
        } : null,
      };
    });

    const specialSlides = slides.flatMap((slide, slideIndex) => {
      const type = slide.classList.contains('cover')
        ? 'cover'
        : slide.classList.contains('section-divider') ? 'divider' : null;
      if (!type) return [];
      const logoSelector = type === 'cover' ? '.brand img' : '.chapter-brand img';
      const logo = slide.querySelector(logoSelector);
      return [{
        slideIndex: slideIndex + 1,
        type,
        logoSelector,
        logoPresent: Boolean(logo),
        logoLoaded: Boolean(logo && logo.naturalWidth > 0),
        logoSrc: logo?.currentSrc || logo?.src || null,
      }];
    });

    return {
      title: document.title,
      url: location.href,
      viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
      slideCount: slides.length,
      documentImageCount: document.images.length,
      brokenImages: { count: brokenImages.length, items: brokenImages },
      overflow: { count: overflowItems.length, items: overflowItems },
      pins: {
        count: pins.length,
        outsideCount: pins.filter((pin) => pin.outside).length,
        items: pins,
      },
      coverAndDividers: {
        count: specialSlides.length,
        missingLogoCount: specialSlides.filter((slide) => !slide.logoPresent || !slide.logoLoaded).length,
        items: specialSlides,
      },
      slides: slides.map((slide, slideIndex) => ({
        slideIndex: slideIndex + 1,
        classes: [...slide.classList],
        innerTextLength: slide.innerText.trim().length,
        footerCount: slide.querySelectorAll('.footer').length,
        imageCount: slide.querySelectorAll('img').length,
        pinCount: slide.querySelectorAll('.pin').length,
        clientWidth: slide.clientWidth,
        scrollWidth: slide.scrollWidth,
        clientHeight: slide.clientHeight,
        scrollHeight: slide.scrollHeight,
      })),
    };
  })()
`;

async function auditDeck(endpoint, relativeFile) {
  const absoluteFile = path.resolve(REPO_ROOT, relativeFile);
  await fs.access(absoluteFile);
  const target = await createTarget(endpoint);
  const client = new CdpClient(target.webSocketDebuggerUrl);

  try {
    await client.ready;
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Emulation.setDeviceMetricsOverride', VIEWPORT);
    const loaded = client.once('Page.loadEventFired');
    const navigation = await client.send('Page.navigate', { url: pathToFileURL(absoluteFile).href });
    if (navigation.errorText) throw new Error(`${relativeFile}: ${navigation.errorText}`);
    await loaded;
    await waitForDocument(client);
    return {
      file: relativeFile.replaceAll('\\', '/'),
      absoluteFile,
      ...(await evaluate(client, AUDIT_EXPRESSION)),
    };
  } finally {
    try {
      await client.send('Page.close', {}, 2000);
    } catch {
      // The target may already be gone during cleanup.
    }
    client.close();
  }
}

async function main() {
  const { output } = parseArguments(process.argv.slice(2));
  const chromeExecutable = await findChromeExecutable();
  const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), 'voca-deck-verify-'));
  const chromeProcess = spawn(chromeExecutable, [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-component-update',
    '--allow-file-access-from-files',
    `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
    'about:blank',
  ], { stdio: 'ignore', windowsHide: true });

  let browserClient;
  try {
    const { endpoint, browserWebSocketUrl } = await waitForDevToolsPort(profileDir, chromeProcess);
    browserClient = new CdpClient(browserWebSocketUrl);
    await browserClient.ready;

    const documents = [];
    for (const deckFile of DECK_FILES) documents.push(await auditDeck(endpoint, deckFile));

    const report = {
      generatedAt: new Date().toISOString(),
      engine: path.basename(chromeExecutable),
      viewport: VIEWPORT,
      documents,
      summary: {
        deckCount: documents.length,
        slideCount: documents.reduce((sum, deck) => sum + deck.slideCount, 0),
        brokenImageCount: documents.reduce((sum, deck) => sum + deck.brokenImages.count, 0),
        overflowCount: documents.reduce((sum, deck) => sum + deck.overflow.count, 0),
        outsidePinCount: documents.reduce((sum, deck) => sum + deck.pins.outsideCount, 0),
        missingLogoCount: documents.reduce((sum, deck) => sum + deck.coverAndDividers.missingLogoCount, 0),
        footerCount: documents.reduce(
          (sum, deck) => sum + deck.slides.reduce((deckSum, slide) => deckSum + slide.footerCount, 0),
          0,
        ),
      },
    };
    const json = `${JSON.stringify(report, null, 2)}\n`;
    if (output) {
      await fs.mkdir(path.dirname(output), { recursive: true });
      await fs.writeFile(output, json, 'utf8');
      process.stderr.write(`Promotion deck verification report: ${output}\n`);
    } else {
      process.stdout.write(json);
    }
  } finally {
    if (browserClient) {
      try {
        await browserClient.send('Browser.close', {}, 2000);
      } catch {
        // Chrome is also terminated below as a fallback.
      }
      browserClient.close();
    }
    if (chromeProcess.exitCode === null) chromeProcess.kill();
    await fs.rm(profileDir, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
