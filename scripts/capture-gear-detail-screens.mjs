import fs from 'node:fs/promises';
import path from 'node:path';

const endpoint = process.env.CHROME_DEBUG_URL || 'http://127.0.0.1:9223';
const outputDir = path.resolve('docs/promotion/captures');
const pages = await fetch(`${endpoint}/json`).then((response) => response.json());
const page = pages.find((candidate) => candidate.type === 'page' && candidate.url.startsWith('https://english-game-sage.vercel.app/'));
if (!page) throw new Error('Voca Hero page was not found.');

const socket = new WebSocket(page.webSocketDebuggerUrl);
let sequence = 0;
const pending = new Map();
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const handler = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) handler.reject(new Error(message.error.message));
  else handler.resolve(message.result);
});
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence;
  pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => {
  const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text || 'Evaluation failed');
  return response.result.value;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const capture = async (fileName) => {
  const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await fs.writeFile(path.join(outputDir, fileName), Buffer.from(data, 'base64'));
};

await fs.mkdir(outputDir, { recursive: true });
await send('Page.enable');
await send('Page.bringToFront');
await send('Emulation.setDeviceMetricsOverride', { width: 1878, height: 1100, deviceScaleFactor: 1, mobile: false });
await evaluate(`typeof switchTab === 'function' && switchTab('gearTab'); true`);
await sleep(1000);
const blockers = await evaluate(`(() => {
  const visible = (element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0 && rect.width > 1 && rect.height > 1;
  };
  return [...document.querySelectorAll('[role="dialog"], dialog, [id*="Modal"], [id*="modal"], [id*="Overlay"], [id*="overlay"]')]
    .filter(visible)
    .map((element) => element.id || element.className);
})()`);
if (blockers.length) throw new Error(`팝업이 열려 있어 촬영을 중단했습니다: ${JSON.stringify(blockers)}`);

const sections = [
  ['potentialLabContainer', 'student-potential-actual.png'],
  ['accessoriesLabContainer', 'student-accessories-actual.png'],
];
for (const [sectionId, fileName] of sections) {
  const exists = await evaluate(`Boolean(document.getElementById(${JSON.stringify(sectionId)}))`);
  if (!exists) throw new Error(`${sectionId} is missing.`);
  await evaluate(`document.getElementById(${JSON.stringify(sectionId)}).scrollIntoView({ block: 'center', inline: 'nearest' }); true`);
  await sleep(500);
  await capture(fileName);
}
socket.close();
