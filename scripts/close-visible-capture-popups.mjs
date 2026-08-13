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

const expression = `(() => {
  const visible = (element) => {
    if (!element) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0 && rect.width > 1 && rect.height > 1;
  };
  const actions = [];
  const click = (element, reason) => {
    if (!visible(element)) return;
    element.click();
    actions.push(reason);
  };

  // UI 자체의 닫기/확인 동작만 사용한다. 보상 수령·구매·강화 등 상태 변경 버튼은 누르지 않는다.
  const secureGuild = document.getElementById('secureGuildModal');
  if (secureGuild?.style.display) {
    secureGuild.style.removeProperty('display');
    actions.push('캡처 자동화가 남긴 길드 창 인라인 display 제거');
  }
  click(document.getElementById('secureGuildClose'), '길드 창 닫기');

  const safeText = /^(닫기|확인|계속|나중에|다시 보지 않기)$/;
  const modalRoots = [...document.querySelectorAll('[role="dialog"], dialog, [id*="Modal"], [id*="modal"], [id*="Overlay"], [id*="overlay"]')]
    .filter(visible);
  for (const root of modalRoots) {
    const button = [...root.querySelectorAll('button, [role="button"]')]
      .find((candidate) => visible(candidate) && safeText.test(candidate.innerText.trim()));
    if (button) click(button, (root.id || '팝업') + ': ' + button.innerText.trim());
  }
  return actions;
})()`;
const result = await send('Runtime.evaluate', { expression, returnByValue: true });
console.log(JSON.stringify(result.result.value, null, 2));
socket.close();

