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

await evaluate(`typeof switchTab === 'function' && switchTab('gearTab'); true`);
await new Promise((resolve) => setTimeout(resolve, 1000));
const result = await evaluate(`(() => {
  const root = document.getElementById('gearTab');
  const visible = (element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 1 && rect.height > 1;
  };
  return {
    rootText: root?.innerText.slice(0, 5000),
    buttons: [...(root?.querySelectorAll('button, [role="button"], a, select') || [])].map((element) => ({
      tag: element.tagName,
      id: element.id,
      text: element.innerText?.trim() || element.getAttribute('aria-label') || '',
      className: element.className,
      visible: visible(element),
      disabled: Boolean(element.disabled),
      data: Object.fromEntries([...element.attributes].filter((attribute) => attribute.name.startsWith('data-')).map((attribute) => [attribute.name, attribute.value])),
    })),
    ids: [...(root?.querySelectorAll('[id]') || [])].map((element) => ({ id: element.id, tag: element.tagName, visible: visible(element), text: element.innerText?.trim().slice(0, 120) || '' })),
  };
})()`);
console.log(JSON.stringify(result, null, 2));
socket.close();
