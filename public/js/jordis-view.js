// ----- página "las jordis": cuadrados de color + activación -----

import { api } from './api.js';
import { $, el, isHexColor } from './utils.js';
import { checkAuth } from './auth.js';

const wrap = $('#jordisSquares');
const contentEl = $('#jordiContent');

// Jordi activa en este momento (o null). Al activar una, el fondo de la página
// toma su color, su cuadrado se pone en blanco y se muestra su contenido.
let activeId = null;

function deactivate() {
  activeId = null;
  document.body.classList.remove('jordi-activa');
  document.body.style.removeProperty('background-color');
  for (const c of wrap.querySelectorAll('.jordi-card')) c.classList.remove('is-active');
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
  contentEl.replaceChildren();
  contentEl.appendChild(el('div', { class: 'jordi-content-nombre', text: j.nombre }));
  if (j.subtitulo) contentEl.appendChild(el('div', { class: 'jordi-content-subtitulo', text: j.subtitulo }));
  contentEl.appendChild(el('div', {
    class: 'jordi-content-texto',
    text: j.texto || 'todavía no hay contenido…',
  }));
  contentEl.hidden = false;
  // Re-dispara el fade de entrada al cambiar de una jordi a otra.
  contentEl.classList.remove('jordi-content-enter');
  void contentEl.offsetWidth;
  contentEl.classList.add('jordi-content-enter');
}

function renderJordi(j) {
  const card = el('div', { class: 'jordi-card' });
  const square = el('button', { class: 'jordi-square', attrs: { type: 'button', 'aria-label': j.nombre } });
  // El color sólo se aplica vía style tras revalidar el hex (nunca como HTML).
  if (isHexColor(j.color)) square.style.backgroundColor = j.color;
  square.addEventListener('click', () => activate(j, card));
  card.appendChild(square);
  card.appendChild(el('div', { class: 'jordi-nombre', text: j.nombre }));
  if (j.subtitulo) card.appendChild(el('div', { class: 'jordi-subtitulo', text: j.subtitulo }));
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
