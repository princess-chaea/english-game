import fs from 'node:fs/promises';
import path from 'node:path';

const endpoint = process.env.CHROME_DEBUG_URL || 'http://127.0.0.1:9334';
const anonymizeCapture = process.env.ANONYMIZE_CAPTURE === '1';
const outputDir = path.resolve('docs/promotion/captures');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class CdpClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.sequence = 0;
    this.pending = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }

  async send(method, params = {}) {
    await this.ready;
    const id = ++this.sequence;
    const response = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
    this.socket.send(JSON.stringify({ id, method, params }));
    return response;
  }

  close() {
    this.socket.close();
  }
}

async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Evaluation failed');
  return result.result?.value;
}

async function capture(client, fileName) {
  const { data } = await client.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
  });
  await fs.writeFile(path.join(outputDir, fileName), Buffer.from(data, 'base64'));
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true });
  const pages = await fetch(`${endpoint}/json`).then((response) => response.json());
  const page = pages.find((candidate) => candidate.type === 'page' && candidate.url.startsWith('https://english-game-sage.vercel.app/'));
  if (!page) throw new Error('Logged Voca Hero page was not found.');
  const client = new CdpClient(page.webSocketDebuggerUrl);
  await client.ready;
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Page.bringToFront');
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 1878,
    height: 1100,
    deviceScaleFactor: 1,
    mobile: false,
  });

  const anonymize = `
    (() => {
      const replacements = new Map([
        ['채아공주', '별빛용사'],
        ['하주해적단', '별빛영웅단']
      ]);
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        for (const [from, to] of replacements) {
          if (node.nodeValue.includes(from)) node.nodeValue = node.nodeValue.split(from).join(to);
        }
      }
      return true;
    })()
  `;
  const visibleOverlays = await evaluate(client, `
    (() => {
      const visible = (element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none'
          && style.visibility !== 'hidden'
          && Number(style.opacity) !== 0
          && rect.width > 1
          && rect.height > 1;
      };
      return [...document.querySelectorAll('[role="dialog"], dialog, [id*="Modal"], [id*="modal"], [id*="Overlay"], [id*="overlay"]')]
        .filter(visible)
        .map((element) => element.id || element.getAttribute('role') || element.tagName.toLowerCase());
    })()
  `);
  if (visibleOverlays.length) {
    throw new Error(`Visible dialog/modal/overlay blocks capture: ${visibleOverlays.join(', ')}`);
  }
  if (anonymizeCapture) await evaluate(client, anonymize);

  const gameTabs = [
    ['quizTab', 'student-tab-quiz-actual.png'],
    ['gearTab', 'student-tab-gear-actual.png'],
    ['petTab', 'student-tab-pet-relic-actual.png'],
    ['skillTab', 'student-tab-skill-actual.png'],
    ['worldBossTab', 'student-tab-world-boss-actual.png'],
    ['hallOfFameTab', 'student-tab-hall-of-fame-actual.png'],
    ['statsTab', 'student-tab-hero-info-actual.png'],
  ];
  for (const [tabId, fileName] of gameTabs) {
    await evaluate(client, `typeof switchTab === 'function' && switchTab(${JSON.stringify(tabId)}); true`);
    await sleep(tabId === 'worldBossTab' || tabId === 'hallOfFameTab' ? 1800 : 850);
    if (anonymizeCapture) await evaluate(client, anonymize);
    await capture(client, fileName);
  }

  await evaluate(client, `document.getElementById('secureHeaderGuildOpen')?.click(); true`);
  await sleep(1800);
  const guildVisible = await evaluate(client, `
    (() => {
      const guild = document.getElementById('secureGuildModal');
      if (!guild) return false;
      const style = getComputedStyle(guild);
      const rect = guild.getBoundingClientRect();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity) !== 0
        && rect.width > 1
        && rect.height > 1;
    })()
  `);
  if (!guildVisible) throw new Error('Guild modal did not open after clicking the guild button.');
  const guildTabs = [    ['overview', 'student-guild-overview-actual.png'],
    ['members', 'student-guild-members-actual.png'],
    ['ranking', 'student-guild-ranking-actual.png'],
    ['shop', 'student-guild-shop-actual.png'],
    ['appearance', 'student-guild-appearance-actual.png'],
    ['effects', 'student-guild-effects-actual.png'],
  ];
  for (const [tabId, fileName] of guildTabs) {
    await evaluate(client, `document.querySelector('[data-secure-guild-tab="${tabId}"]')?.click(); true`);
    await sleep(tabId === 'ranking' ? 1500 : 850);
    if (anonymizeCapture) await evaluate(client, anonymize);
    await capture(client, fileName);
  }
  await evaluate(client, `document.getElementById('secureGuildClose')?.click(); true`);
  client.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
