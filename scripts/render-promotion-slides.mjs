import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const OUTPUT_ROOT = process.env.VOCA_PROMOTION_PAGES_DIR || 'C:\\tmp\\voca-promotion-pages';
const PDF_OUTPUT_ROOT = process.env.VOCA_PROMOTION_PDF_DIR || path.resolve(REPO_ROOT, 'docs/promotion');
const DECK_FILES = [
  'docs/promotion/core-promotion-detailed.html',
  'docs/promotion/teacher-quick-guide-detailed.html',
  'docs/promotion/student-quick-guide-detailed.html',
  'docs/promotion/integrated-manual-detailed.html',
];
const DECK_FILTER = (process.env.VOCA_PROMOTION_DECK_FILTER || '').trim();
const WIDTH = 1280;
const HEIGHT = 720;
const OUTPUT_SCALE = Math.max(1, Number(process.env.VOCA_PROMOTION_SCALE || 1));
const CDP_TIMEOUT_MS = 30_000;
const HIDE_ANNOTATIONS = process.env.VOCA_PROMOTION_HIDE_ANNOTATIONS === '1';

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
      // Continue through well-known Chromium locations.
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
      // Chrome creates this file asynchronously.
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

async function waitForAssets(client) {
  const deadline = Date.now() + CDP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await evaluate(client, 'document.readyState === "complete" && document.querySelectorAll(".slide").length > 0')) break;
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
          setTimeout(finish, 10000);
        });
      }));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return true;
    })()
  `);
}

async function prepareDeck(client) {
  return evaluate(client, `
    (() => {
      const previous = document.getElementById('__voca_slide_capture_style');
      if (previous) previous.remove();
      const style = document.createElement('style');
      style.id = '__voca_slide_capture_style';
      style.textContent = ${JSON.stringify(`
        @page { size: 1280px 720px !important; margin: 0 !important; }
        html, body {
          display: block !important;
          width: 1280px !important;
          min-width: 1280px !important;
          max-width: 1280px !important;
          height: 720px !important;
          min-height: 720px !important;
          max-height: 720px !important;
          margin: 0 !important;
          padding: 0 !important;
          gap: 0 !important;
          overflow: hidden !important;
          background: #02030a !important;
        }
        body > .slide {
          display: none !important;
          position: absolute !important;
          inset: 0 auto auto 0 !important;
          width: 1280px !important;
          height: 720px !important;
          margin: 0 !important;
          transform: none !important;
          transform-origin: top left !important;
          box-shadow: none !important;
          page-break-after: auto !important;
          break-after: auto !important;
        }
        body > .slide.__voca_capture_active { display: block !important; }
        ${HIDE_ANNOTATIONS ? '.focus-region, .screen-canvas > .pin { visibility: hidden !important; }' : ''}
      `)};
      document.head.appendChild(style);
      const slides = [...document.querySelectorAll('body > .slide')];
      slides.forEach((slide) => slide.classList.remove('__voca_capture_active'));
      return {
        title: document.title,
        slideCount: slides.length,
        brokenImages: [...document.images]
          .filter((image) => image.naturalWidth === 0)
          .map((image) => ({ src: image.currentSrc || image.src, alt: image.alt || '' })),
      };
    })()
  `);
}

async function activateSlide(client, index) {
  return evaluate(client, `
    (async () => {
      const slides = [...document.querySelectorAll('body > .slide')];
      slides.forEach((slide, slideIndex) => {
        slide.classList.toggle('__voca_capture_active', slideIndex === ${index});
        slide.style.counterReset = slideIndex === ${index} ? 'slide ${index}' : '';
      });
      const slide = slides[${index}];
      if (!slide) throw new Error('Slide ${index + 1} was not found.');
      window.scrollTo(0, 0);
      if (document.fonts?.ready) await document.fonts.ready;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const rect = slide.getBoundingClientRect();
      return {
        index: ${index + 1},
        title: slide.querySelector('h1, h2')?.innerText.trim() || '',
        classes: [...slide.classList].filter((name) => name !== '__voca_capture_active'),
        innerTextLength: slide.innerText.trim().length,
        imageCount: slide.querySelectorAll('img').length,
        brokenImageCount: [...slide.querySelectorAll('img')].filter((image) => image.naturalWidth === 0).length,
        footerCount: slide.querySelectorAll('.footer').length,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        scrollWidth: slide.scrollWidth,
        scrollHeight: slide.scrollHeight,
        annotations: [...slide.querySelectorAll('.screen-canvas .focus-region > .pin, .screen-canvas > .pin')]
          .map((pin) => {
            const pinRect = pin.getBoundingClientRect();
            const slideRect = slide.getBoundingClientRect();
            return {
              text: pin.textContent.trim(),
              x: Math.round((pinRect.left + pinRect.width / 2 - slideRect.left) * 100) / 100,
              y: Math.round((pinRect.top + pinRect.height / 2 - slideRect.top) * 100) / 100,
            };
          }),
      };
    })()
  `);
}

async function renderDeck(endpoint, relativeFile) {
  const sourceFile = path.resolve(REPO_ROOT, relativeFile);
  await fs.access(sourceFile);
  const deckName = path.basename(relativeFile, '.html');
  const outputDir = path.join(OUTPUT_ROOT, deckName);
  await fs.mkdir(outputDir, { recursive: true });

  const target = await createTarget(endpoint);
  const client = new CdpClient(target.webSocketDebuggerUrl);
  try {
    await client.ready;
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: WIDTH,
      height: HEIGHT,
      deviceScaleFactor: OUTPUT_SCALE,
      mobile: false,
      screenWidth: WIDTH,
      screenHeight: HEIGHT,
    });
    await client.send('Emulation.setEmulatedMedia', { media: 'print' });
    const loaded = client.once('Page.loadEventFired');
    const navigation = await client.send('Page.navigate', { url: pathToFileURL(sourceFile).href });
    if (navigation.errorText) throw new Error(`${relativeFile}: ${navigation.errorText}`);
    await loaded;
    await waitForAssets(client);
    const deckInfo = await prepareDeck(client);

    const pages = [];
    for (let index = 0; index < deckInfo.slideCount; index += 1) {
      const page = await activateSlide(client, index);
      const fileName = `${String(index + 1).padStart(3, '0')}.png`;
      const screenshot = await client.send('Page.captureScreenshot', {
        format: 'png',
        fromSurface: true,
        captureBeyondViewport: false,
        clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT, scale: 1 },
      });
      const outputFile = path.join(outputDir, fileName);
      await fs.writeFile(outputFile, Buffer.from(screenshot.data, 'base64'));
      const stat = await fs.stat(outputFile);
      pages.push({ ...page, file: fileName, bytes: stat.size });
      process.stderr.write(`${deckName} ${index + 1}/${deckInfo.slideCount}\r`);
    }
    process.stderr.write(`${deckName}: ${deckInfo.slideCount} pages${' '.repeat(24)}\n`);

    await evaluate(client, `
      (() => {
        document.getElementById('__voca_slide_capture_style')?.remove();
        document.querySelectorAll('body > .slide').forEach((slide) => {
          slide.classList.remove('__voca_capture_active');
        });
        return true;
      })()
    `);
    await client.send('Emulation.setEmulatedMedia', { media: 'print' });
    const pdf = await client.send('Page.printToPDF', {
      landscape: true,
      printBackground: true,
      preferCSSPageSize: true,
      marginTop: 0,
      marginBottom: 0,
      marginLeft: 0,
      marginRight: 0,
    }, 120000);
    await fs.mkdir(PDF_OUTPUT_ROOT, { recursive: true });
    const pdfFile = path.join(PDF_OUTPUT_ROOT, `${deckName}.pdf`);
    await fs.writeFile(pdfFile, Buffer.from(pdf.data, 'base64'));

    const manifest = {
      deck: deckName,
      title: deckInfo.title,
      source: relativeFile.replaceAll('\\', '/'),
      sourceUrl: pathToFileURL(sourceFile).href,
      outputDir,
      width: WIDTH,
      height: HEIGHT,
      outputScale: OUTPUT_SCALE,
      media: 'print',
      pageCount: deckInfo.slideCount,
      brokenImages: deckInfo.brokenImages,
      pdfFile,
      pages,
    };
    await fs.writeFile(path.join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    return manifest;
  } finally {
    try {
      await client.send('Page.close', {}, 2000);
    } catch {
      // Target may already be closed.
    }
    client.close();
  }
}

async function main() {
  const chromeExecutable = await findChromeExecutable();
  const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), 'voca-promotion-render-'));
  await fs.mkdir(OUTPUT_ROOT, { recursive: true });
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
    '--hide-scrollbars',
    `--window-size=${WIDTH},${HEIGHT}`,
    'about:blank',
  ], { stdio: 'ignore', windowsHide: true });

  let browserClient;
  try {
    const { endpoint, browserWebSocketUrl } = await waitForDevToolsPort(profileDir, chromeProcess);
    browserClient = new CdpClient(browserWebSocketUrl);
    await browserClient.ready;
    const manifests = [];
    const deckFiles = DECK_FILTER
      ? DECK_FILES.filter((deckFile) => path.basename(deckFile, '.html') === DECK_FILTER)
      : DECK_FILES;
    if (!deckFiles.length) throw new Error(`No promotion deck matched VOCA_PROMOTION_DECK_FILTER=${DECK_FILTER}`);
    for (const deckFile of deckFiles) manifests.push(await renderDeck(endpoint, deckFile));
    const summary = {
      generatedAt: new Date().toISOString(),
      chromeExecutable,
      outputRoot: OUTPUT_ROOT,
      width: WIDTH,
      height: HEIGHT,
      media: 'print',
      deckCount: manifests.length,
      totalPageCount: manifests.reduce((sum, manifest) => sum + manifest.pageCount, 0),
      decks: manifests.map((manifest) => ({
        deck: manifest.deck,
        source: manifest.source,
        outputDir: manifest.outputDir,
        pageCount: manifest.pageCount,
        brokenImageCount: manifest.brokenImages.length,
      })),
    };
    await fs.writeFile(path.join(OUTPUT_ROOT, 'manifest.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } finally {
    if (browserClient) {
      try {
        await browserClient.send('Browser.close', {}, 2000);
      } catch {
        // The process kill below is the final fallback.
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
