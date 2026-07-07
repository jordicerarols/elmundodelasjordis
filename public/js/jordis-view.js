// ----- página "las jordis": cuadrados de color -----

import { api } from './api.js';
import { $, el, isHexColor } from './utils.js';
import { checkAuth } from './auth.js';

const wrap = $('#jordisSquares');

function renderJordi(j) {
  const card = el('div', { class: 'jordi-card' });
  const square = el('div', { class: 'jordi-square' });
  // El color sólo se aplica vía style tras revalidar el hex (nunca como HTML).
  if (isHexColor(j.color)) square.style.backgroundColor = j.color;
  card.appendChild(square);
  card.appendChild(el('div', { class: 'jordi-nombre', text: j.nombre }));
  if (j.texto) card.appendChild(el('div', { class: 'jordi-texto', text: j.texto }));
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
