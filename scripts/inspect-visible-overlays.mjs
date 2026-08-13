const endpoint = process.env.CHROME_DEBUG_URL || 'http://127.0.0.1:9223';
const pages = await fetch(`${endpoint}/json`).then((response) => response.json());
const page = pages.find((candidate) => candidate.type === 'page' && candidate.url.startsWith('https://english-game-sage.vercel.app/'));
if (!page) throw new Error('Voca Hero page was not found.');

const socket = new WebSocket(page.webSocketDebuggerUrl);
let sequence = 0;
const pending = new Map();
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  pending.get(message.id)(message.result);
  pending.delete(message.id);
});
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
const send = (method, params = {}) => new Promise((resolve) => {
  const id = ++sequence;
  pending.set(id, resolve);
  socket.send(JSON.stringify({ id, method, params }));
});

const result = await send('Runtime.evaluate', {
  expression: `(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0 && rect.width > 1 && rect.height > 1;
    };
    const overlays = [...document.querySelectorAll('[role="dialog"], dialog, [id*="Modal"], [id*="modal"], [id*="Overlay"], [id*="overlay"], .fixed, [class*="modal"], [class*="overlay"]')]
      .filter(visible)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const buttons = [...element.querySelectorAll('button, [role="button"]')]
          .filter(visible)
          .map((button) => ({ id: button.id, text: button.innerText.trim(), aria: button.getAttribute('aria-label'), className: button.className }));
        return {
          id: element.id,
          role: element.getAttribute('role'),
          className: element.className,
          text: element.innerText.trim().slice(0, 500),
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          zIndex: getComputedStyle(element).zIndex,
          buttons,
        };
      });
    return { url: location.href, overlays };
  })()`,
  returnByValue: true,
});
console.log(JSON.stringify(result.result.value, null, 2));
socket.close();
