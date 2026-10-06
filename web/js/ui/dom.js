// Tiny DOM helpers: h('div.card.big', {onclick}, child, 'text', [more]).

export function h(sel, props, ...kids) {
  if (props == null || typeof props !== 'object' || props instanceof Node || Array.isArray(props)) {
    kids.unshift(props);
    props = {};
  }
  const [head, ...classes] = sel.split('.');
  const [tag, id] = head.split('#');
  const el = document.createElement(tag || 'div');
  if (id) el.id = id;
  if (classes.length) el.className = classes.join(' ');
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = [el.className, v].filter(Boolean).join(' ');
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, kids);
  return el;
}

function append(el, kids) {
  for (const k of kids) {
    if (k == null || k === false) continue;
    if (Array.isArray(k)) append(el, k);
    else el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

export function clear(el) {
  while (el.firstChild) el.firstChild.remove();
  return el;
}

/** Replaces el's children; null/false children are skipped. */
export function fill(el, ...kids) {
  clear(el);
  append(el, kids);
  return el;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Shows a short message at the bottom of the screen. */
export function toast(msg, kind = '') {
  let box = document.getElementById('toasts');
  if (!box) {
    box = h('div#toasts');
    document.body.append(box);
  }
  const t = h('div.toast', { class: kind }, msg);
  box.append(t);
  setTimeout(() => t.classList.add('out'), 2600);
  setTimeout(() => t.remove(), 3100);
}

/** Simple modal. Returns { el, close }. */
export function modal(content, { onClose, cls = '', dismissable = true } = {}) {
  const back = h('div.modal-back', { class: cls });
  const box = h('div.modal', content);
  back.append(box);
  const close = () => {
    back.remove();
    if (onClose) onClose();
  };
  if (dismissable) back.addEventListener('click', (e) => { if (e.target === back) close(); });
  document.body.append(back);
  return { el: box, back, close };
}

export function storage(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}

export function store(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
}
