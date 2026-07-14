// ----- página "las jordis": círculos de color + activación -----
//
// Cada jordi es un círculo con su nombre dentro (blanco desactivada, negro
// activada). Al activar una: el fondo toma su color, su círculo se pone en
// blanco, su SUBTÍTULO sustituye al titular "las jordis" y su texto aparece
// bajo los círculos. Sin ninguna activa, el titular vuelve a "las jordis".

import { api } from './api.js';
import { $, el, isHexColor } from './utils.js';
import { checkAuth } from './auth.js';

const SITE_TITLE = 'las jordis';

const wrap = $('#jordisSquares');
const titleEl = $('#jordisTitle');
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
  titleEl.textContent = SITE_TITLE;
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
  // El subtítulo SUSTITUYE al titular en su mismo sitio. Sin fallback al
  // nombre (ya vive en el círculo): sin subtítulo se queda "las jordis".
  titleEl.textContent = j.subtitulo || SITE_TITLE;
  playEnter(titleEl, 'jordi-content-enter');
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
