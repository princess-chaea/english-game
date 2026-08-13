import fs from 'node:fs/promises';
import path from 'node:path';

const endpoint = process.env.CHROME_DEBUG_URL || 'http://127.0.0.1:9223';
const outputDir = path.resolve('docs/promotion/captures');
const serviceUrl = process.env.VOCA_CAPTURE_URL || 'https://english-game-sage.vercel.app/';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class CdpClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.sequence = 0;
    this.pending = new Map();
    this.events = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
        return;
      }
      const listeners = this.events.get(message.method) || [];
      listeners.splice(0).forEach((resolve) => resolve(message.params));
    });
  }

  async send(method, params = {}) {
    await this.ready;
    const id = ++this.sequence;
    const response = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
    this.socket.send(JSON.stringify({ id, method, params }));
    return response;
  }

  once(method, timeout = 20000) {
    return new Promise((resolve, reject) => {
      const listeners = this.events.get(method) || [];
      const timer = setTimeout(() => {
        const index = listeners.indexOf(onEvent);
        if (index >= 0) listeners.splice(index, 1);
        reject(new Error(`${method} timed out`));
      }, timeout);
      const onEvent = (params) => {
        clearTimeout(timer);
        resolve(params);
      };
      listeners.push(onEvent);
      this.events.set(method, listeners);
    });
  }

  close() {
    this.socket.close();
  }
}

async function findPage() {
  const pages = await fetch(`${endpoint}/json`).then((response) => response.json());
  const targetOrigin = new URL(serviceUrl).origin;
  const page = pages.find((candidate) => candidate.type === 'page' && candidate.url.startsWith(targetOrigin));
  if (!page) throw new Error(`Voca Hero page was not found at ${targetOrigin}.`);
  return page;
}

async function evaluate(client, expression) {
  return client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
}

async function capture(client, fileName) {
  const { data } = await client.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
  });
  await fs.writeFile(path.join(outputDir, fileName), Buffer.from(data, 'base64'));
}

async function isVisible(client, selector) {
  const { result } = await evaluate(client, `
    (() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    })()
  `);
  return Boolean(result?.value);
}

async function waitForVisible(client, selector, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await isVisible(client, selector)) return;
    await sleep(250);
  }
  throw new Error(`Visible element was not found: ${selector}`);
}

async function waitForHidden(client, selector, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (!(await isVisible(client, selector))) return;
    await sleep(250);
  }
  throw new Error(`Element remained visible: ${selector}`);
}

async function click(client, selector) {
  const { result } = await evaluate(client, `
    (() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element || element.disabled) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (style.getPropertyValue('display') === 'none' || style.visibility === 'hidden' || rect.width === 0 || rect.height === 0) return false;
      element.scrollIntoView({ block: 'center', inline: 'center' });
      element.click();
      return true;
    })()
  `);
  if (!result?.value) throw new Error(`Visible clickable element was not found: ${selector}`);
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true });
  const page = await findPage();
  const client = new CdpClient(page.webSocketDebuggerUrl);
  await client.ready;
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 1600,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });

  const loaded = client.once('Page.loadEventFired');
  await client.send('Page.navigate', { url: serviceUrl });
  await loaded;
  await sleep(7000);

  if (await isVisible(client, '#secureMigrationNotice')) {
    await click(client, '#secureMigrationNoticeDismiss');
    await waitForHidden(client, '#secureMigrationNotice');
  }

  await waitForVisible(client, '#secureWelcomeModal');
  await capture(client, 'student-welcome.png');

  await click(client, '#secureWelcomeStart');
  await waitForVisible(client, '#secureStudentModal');
  await capture(client, 'student-signup.png');

  await click(client, '#secureSignupBack');
  await waitForHidden(client, '#secureStudentModal');
  await waitForVisible(client, '#secureWelcomeTeacher');
  await click(client, '#secureWelcomeTeacher');
  await waitForVisible(client, '#secureTeacherLoginBox');
  await capture(client, 'teacher-login.png');

  client.close();
  return;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

