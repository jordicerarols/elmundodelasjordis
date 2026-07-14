// ----- helpers genéricos: DOM, escape, toast, media -----

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// Crea un elemento con props y texto. `text` se asigna con textContent, así que
// NUNCA interpreta HTML — es el punto único de sanitización del render.
export function el(tag, { class: cls, text, attrs } = {}) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  if (attrs) for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

// Tipo de media de un File según su MIME ('image' | 'video' | null).
export function mediaKindOf(file) {
  const t = file?.type || '';
  return t.startsWith('image/') ? 'image' : t.startsWith('video/') ? 'video' : null;
}

// Color hex #rrggbb válido. Mismo criterio que el server (src/index.ts).
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
export const isHexColor = (c) => HEX_COLOR_RE.test(String(c ?? '').trim());

export function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

// Toast accesible (aria-live=polite).
export function toast(msg, type = 'info') {
  let host = document.getElementById('toastHost');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toastHost';
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    host.setAttribute('aria-atomic', 'true');
    document.body.appendChild(host);
  }
  const node = document.createElement('div');
  node.className = `toast toast-${type}`;
  node.textContent = msg;
  host.appendChild(node);
  setTimeout(() => node.classList.add('show'), 10);
  setTimeout(() => {
    node.classList.remove('show');
    setTimeout(() => node.remove(), 300);
  }, 3200);
}
