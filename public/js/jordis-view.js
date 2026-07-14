// ----- página "las jordis": círculos de color + activación -----
//
// Cada jordi es un círculo con su nombre dentro (blanco desactivada, negro
// activada). Al activar una: el fondo toma su color, su círculo se pone en
// blanco, su SUBTÍTULO ocupa el titular de la página y su texto aparece bajo
// los círculos. Sin ninguna activa, el titular queda vacío.

import { api } from './api.js';
import { $, el, isHexColor } from './utils.js';
import { checkAuth } from './auth.js';

const wrap = $('#jordisSquares');
const heroEl = $('#jordiHero');
const contentEl = $('#jordiContent');

// Jordi activa en este momento (o null).
let activeId = null;

// Re-dispara el fade de entrada de un nodo (quita la clase, fuerza reflow y la
// vuelve a poner para que reinicie en cada activación).
function playEnter(node, cls) {
  node.classList.remove(cls);
  void node.offsetWidth;
  node.classList.add(cls);
}

function deactivate() {
  activeId = null;
  document.body.classList.remove('jordi-activa');
  document.body.style.removeProperty('background-color');
  for (const c of wrap.querySelectorAll('.jordi-card')) c.classList.remove('is-active');
  heroEl.textContent = '';
  contentEl.hidden = true;
  contentEl.replaceChildren();
}

function activate(j, card) {
  // Toggle: volver a pulsar la activa la desactiva.
  if (activeId === j.id) { deactivate(); return; }
  activeId = j.id;
  document.body.classList.add('jordi-activa');
  // El color sólo se aplica vía style tras revalidar el hex (nunca como HTML).
  if (isHexColor(j.color)) document.body.style.backgroundColor = j.color;
  for (const c of wrap.querySelectorAll('.jordi-card')) c.classList.remove('is-active');
  card.classList.add('is-active');
  // El subtítulo pasa al titular. SIN fallback al nombre: el nombre ya vive
  // dentro del círculo y quedaría repetido; sin subtítulo no se muestra nada.
  heroEl.textContent = j.subtitulo || '';
  playEnter(heroEl, 'jordi-content-enter');
  contentEl.replaceChildren();
  contentEl.appendChild(el('div', {
    class: 'jordi-content-texto',
    text: j.texto || 'todavía no hay contenido…',
  }));
  contentEl.hidden = false;
  playEnter(contentEl, 'jordi-content-enter');
}

function renderJordi(j) {
  const card = el('div', { class: 'jordi-card' });
  // El nombre vive DENTRO del círculo (el propio botón).
  const square = el('button', { class: 'jordi-square', text: j.nombre, attrs: { type: 'button' } });
  // El color sólo se aplica vía style tras revalidar el hex (nunca como HTML).
  if (isHexColor(j.color)) square.style.backgroundColor = j.color;
  square.addEventListener('click', () => activate(j, card));
  card.appendChild(square);
  return card;
}

(async function init() {
  checkAuth();
  const { ok, data } = await api('/api/jordis');
  wrap.replaceChildren();
  if (!ok || !Array.isArray(data) || data.length === 0) {
    wrap.appendChild(el('p', { class: 'feed-empty', text: 'todavía no hay jordis…' }));
    return;
  }
  for (const j of data) wrap.appendChild(renderJordi(j));
})();
