// ----- página "las jordis": círculos de color + activación -----
//
// Cada jordi es un círculo con su nombre dentro (blanco desactivada, negro
// activada). Al activar una: el fondo toma su color, su círculo se pone en
// blanco, su SUBTÍTULO sustituye al titular "las jordis" y su texto aparece
// bajo los círculos. Sin ninguna activa, el titular vuelve a "las jordis".

import { api } from './api.js';
import { $, el, isHexColor } from './utils.js';
import { checkAuth } from './auth.js';
import { appendTextWithHashtags } from './render.js';

const SITE_TITLE = 'las jordis';

const wrap = $('#jordisSquares');
const titleEl = $('#jordisTitle');
const contentEl = $('#jordiContent');

// Jordi activa en este momento (o null).
let activeId = null;

// Temporizador del fade de salida del contenido (ver deactivate). Timeout y no
// animationend: si se activa otra jordi a mitad de salida, la animación se
// cancela y animationend nunca llegaría (y un listener huérfano ocultaría el
// contenido al terminar el fade de ENTRADA, que vive en el mismo nodo).
let exitTimer = null;

const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)');

// Luminancia relativa (WCAG) de un color #rrggbb, 0 = negro, 1 = blanco.
function relLuminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

// Re-dispara el fade de entrada de un nodo (quita la clase, fuerza reflow y la
// vuelve a poner para que reinicie en cada activación).
function playEnter(node, cls) {
  node.classList.remove(cls);
  void node.offsetWidth;
  node.classList.add(cls);
}

function hideContentNow() {
  clearTimeout(exitTimer);
  exitTimer = null;
  contentEl.classList.remove('jordi-content-exit');
  contentEl.hidden = true;
  contentEl.replaceChildren();
}

function deactivate() {
  activeId = null;
  document.body.classList.remove('jordi-activa');
  document.body.style.removeProperty('background-color');
  for (const c of wrap.querySelectorAll('.jordi-card')) c.classList.remove('is-active');
  titleEl.textContent = SITE_TITLE;
  // El titular vuelve con el mismo fade que al activar (simetría).
  playEnter(titleEl, 'jordi-content-enter');
  // El contenido sale con fade y se oculta al terminar (260ms ≈ la animación).
  if (contentEl.hidden || REDUCED_MOTION.matches) {
    hideContentNow();
  } else {
    contentEl.classList.remove('jordi-content-enter');
    contentEl.classList.add('jordi-content-exit');
    clearTimeout(exitTimer);
    exitTimer = setTimeout(hideContentNow, 260);
  }
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
  // Si venimos de un fade de salida a medias, cancelarlo antes de re-entrar.
  clearTimeout(exitTimer);
  contentEl.classList.remove('jordi-content-exit');
  contentEl.replaceChildren();
  const texto = el('div', { class: 'jordi-content-texto' });
  // Los #tags del texto son enlaces a la home filtrada (/?tag=…). Aquí no hay
  // delegación de click: navegan de verdad, que es lo que queremos al salir de
  // esta página. Sin texto, un placeholder plano (no tiene tags que linkificar).
  if (j.texto) appendTextWithHashtags(texto, j.texto);
  else texto.textContent = 'todavía no hay contenido…';
  contentEl.appendChild(texto);
  contentEl.hidden = false;
  playEnter(contentEl, 'jordi-content-enter');
}

function renderJordi(j) {
  const card = el('div', { class: 'jordi-card' });
  // El nombre vive DENTRO del círculo (el propio botón).
  const square = el('button', { class: 'jordi-square', text: j.nombre, attrs: { type: 'button' } });
  // El color sólo se aplica vía style tras revalidar el hex (nunca como HTML).
  if (isHexColor(j.color)) {
    square.style.backgroundColor = j.color;
    // Pastel muy claro → nombre en tinta oscura, que el blanco no se lee.
    if (relLuminance(j.color.trim()) > 0.65) square.classList.add('jordi-square-tinta');
  }
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
  // OJO: aquí NO se rellena JORDI_COLORS (sí se hace en la home). El fondo de
  // esta página ES el color de la jordi activa, así que teñir un #tag con ese
  // mismo pastel lo vuelve ilegible. Los tags van en tinta normal y se leen.
  for (const j of data) wrap.appendChild(renderJordi(j));
})();
