import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SOURCE_ROOT = process.env.VOCA_PROMOTION_PAGES_DIR || 'C:\\tmp\\voca-promotion-pages';
const OUTPUT_ROOT = process.env.VOCA_PROMOTION_SHEETS_DIR || 'C:\\tmp\\voca-promotion-contact-sheets';
const WIDTH = 2000;
const HEIGHT = 1300;
const PAGES_PER_SHEET = 10;
const CDP_TIMEOUT_MS = 30_000;
const DECKS = [
  { name: 'core-promotion-detailed', label: '핵심 홍보자료' },
  { name: 'teacher-quick-guide-detailed', label: '교사 퀵가이드' },
  { name: 'student-quick-guide-detailed', label: '학생 퀵가이드' },
  { name: 'integrated-manual-detailed', label: '통합 매뉴얼' },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const htmlEscape = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

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
      // Continue through known Chromium locations.
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
      const [port] = (await fs.readFile(portFile, 'utf8')).trim().split(/\r?\n/);
      if (port) return `http://127.0.0.1:${port}`;
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
    throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
  }
  return response.result?.value;
}

function buildContactSheetHtml(deck, manifest, pages, sheetNumber, sheetCount) {
  const cards = pages.map((page) => {
    const absoluteImage = path.join(SOURCE_ROOT, deck.name, page.file);
    const pageNumber = String(page.index).padStart(3, '0');
    return `
      <article class="card">
        <div class="thumb"><img src="${htmlEscape(pathToFileURL(absoluteImage).href)}" alt="${htmlEscape(page.title)}"></div>
        <div class="meta">${htmlEscape(deck.label)} · ${pageNumber} / ${String(manifest.pageCount).padStart(3, '0')}</div>
        <h2>${htmlEscape(page.title || `페이지 ${page.index}`)}</h2>
      </article>`;
  }).join('');
  const emptyCards = Array.from({ length: PAGES_PER_SHEET - pages.length }, () => '<article class="card empty"></article>').join('');
  return `<!doctype html>
  <html lang="ko"><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}html,body{margin:0;width:${WIDTH}px;height:${HEIGHT}px;overflow:hidden;background:#03050c;color:#f8fafc;font-family:Arial,"Malgun Gothic",sans-serif}
    body{padding:32px 38px 36px;background:radial-gradient(circle at 90% 0,rgba(124,58,237,.22),transparent 30%),radial-gradient(circle at 0 100%,rgba(14,165,233,.13),transparent 35%),#03050c}
    header{height:92px;display:flex;align-items:center;justify-content:space-between;border:1px solid #273754;background:rgba(7,12,24,.92);padding:18px 24px}
    header h1{margin:0;font-size:31px;letter-spacing:-.03em}header p{margin:7px 0 0;color:#9fb0c7;font-size:15px}header strong{font-size:22px;color:#67e8f9}
    main{height:1110px;margin-top:20px;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr));gap:18px}
    .card{min-width:0;border:1px solid #32435c;background:linear-gradient(160deg,rgba(11,18,32,.98),rgba(8,6,21,.97));padding:14px;box-shadow:0 10px 25px rgba(0,0,0,.28);display:flex;flex-direction:column;justify-content:center}
    .card.empty{opacity:.2;border-style:dashed;background:rgba(8,12,22,.42)}
    .thumb{width:100%;aspect-ratio:16/9;border:1px solid #38597a;background:#000;overflow:hidden;box-shadow:0 0 18px rgba(14,165,233,.1)}
    .thumb img{display:block;width:100%;height:100%;object-fit:contain}
    .meta{margin-top:16px;color:#67e8f9;font-size:15px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    h2{margin:8px 0 0;min-height:53px;font-size:19px;line-height:1.38;letter-spacing:-.025em;color:#eef5ff;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}
  </style></head><body>
    <header><div><h1>${htmlEscape(deck.label)} · 전체 페이지 점검</h1><p>${htmlEscape(manifest.title || deck.name)} — 페이지 순서·구성·스크린샷 비주얼 QA</p></div><strong>SHEET ${String(sheetNumber).padStart(2, '0')} / ${String(sheetCount).padStart(2, '0')}</strong></header>
    <main>${cards}${emptyCards}</main>
  </body></html>`;
}

async function captureSheet(client, htmlFile, outputFile) {
  const loaded = client.once('Page.loadEventFired');
  const navigation = await client.send('Page.navigate', { url: pathToFileURL(htmlFile).href });
  if (navigation.errorText) throw new Error(navigation.errorText);
  await loaded;
  const deadline = Date.now() + CDP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const ready = await evaluate(client, `document.readyState === 'complete' && [...document.images].every((image) => image.complete)`);
    if (ready) break;
    await sleep(100);
  }
  const broken = await evaluate(client, `[...document.images].filter((image) => image.naturalWidth === 0).map((image) => image.src)`);
  if (broken.length) throw new Error(`Broken contact-sheet images: ${broken.join(', ')}`);
  await evaluate(client, `(async()=>{if(document.fonts?.ready)await document.fonts.ready;await new Promise((resolve)=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));return true})()`);
  const screenshot = await client.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
    clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT, scale: 1 },
  });
  await fs.writeFile(outputFile, Buffer.from(screenshot.data, 'base64'));
}

async function main() {
  const chromeExecutable = await findChromeExecutable();
  const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), 'voca-contact-sheet-chrome-'));
  const htmlDir = await fs.mkdtemp(path.join(os.tmpdir(), 'voca-contact-sheet-html-'));
  await fs.mkdir(OUTPUT_ROOT, { recursive: true });
  const chromeProcess = spawn(chromeExecutable, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profileDir}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--disable-background-networking', '--disable-component-update',
    '--allow-file-access-from-files', '--hide-scrollbars', `--window-size=${WIDTH},${HEIGHT}`, 'about:blank',
  ], { stdio: 'ignore', windowsHide: true });

  let client;
  try {
    const endpoint = await waitForDevToolsPort(profileDir, chromeProcess);
    const target = await createTarget(endpoint);
    client = new CdpClient(target.webSocketDebuggerUrl);
    await client.ready;
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false,
      screenWidth: WIDTH, screenHeight: HEIGHT,
    });

    const decks = [];
    for (const deck of DECKS) {
      const manifestFile = path.join(SOURCE_ROOT, deck.name, 'manifest.json');
      const manifest = JSON.parse(await fs.readFile(manifestFile, 'utf8'));
      const sheetCount = Math.ceil(manifest.pages.length / PAGES_PER_SHEET);
      const sheets = [];
      for (let sheetIndex = 0; sheetIndex < sheetCount; sheetIndex += 1) {
        const pages = manifest.pages.slice(sheetIndex * PAGES_PER_SHEET, (sheetIndex + 1) * PAGES_PER_SHEET);
        const sheetNumber = sheetIndex + 1;
        const htmlFile = path.join(htmlDir, `${deck.name}-${String(sheetNumber).padStart(2, '0')}.html`);
        const fileName = `${deck.name}-sheet-${String(sheetNumber).padStart(2, '0')}.png`;
        const outputFile = path.join(OUTPUT_ROOT, fileName);
        await fs.writeFile(htmlFile, buildContactSheetHtml(deck, manifest, pages, sheetNumber, sheetCount), 'utf8');
        await captureSheet(client, htmlFile, outputFile);
        const stat = await fs.stat(outputFile);
        sheets.push({ sheet: sheetNumber, file: fileName, pages: pages.map((page) => page.index), bytes: stat.size });
        process.stderr.write(`${deck.name}: sheet ${sheetNumber}/${sheetCount}\n`);
      }
      decks.push({ deck: deck.name, label: deck.label, pageCount: manifest.pages.length, sheetCount, sheets });
    }
    const summary = {
      generatedAt: new Date().toISOString(), sourceRoot: SOURCE_ROOT, outputRoot: OUTPUT_ROOT,
      width: WIDTH, height: HEIGHT, columns: 5, rows: 2, pagesPerSheet: PAGES_PER_SHEET,
      deckCount: decks.length, totalPageCount: decks.reduce((sum, deck) => sum + deck.pageCount, 0),
      totalSheetCount: decks.reduce((sum, deck) => sum + deck.sheetCount, 0), decks,
    };
    await fs.writeFile(path.join(OUTPUT_ROOT, 'manifest.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } finally {
    client?.close();
    if (chromeProcess.exitCode === null) chromeProcess.kill();
    await fs.rm(profileDir, { recursive: true, force: true }).catch(() => {});
    await fs.rm(htmlDir, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
