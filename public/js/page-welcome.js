// ----- entry de la home (welcome) -----

import { api } from './api.js';
import { $, el, toast, isHexColor } from './utils.js';
import { checkAuth, isAuthed } from './auth.js';
import { createFeed } from './feed.js';
import { tintHashtag } from './render.js';
import { JORDI_COLORS } from './state.js';

const listEl = $('#hashtagList');
const feedEl = $('#feed');
const sentinel = $('#sentinel');

// Opciones de edición por post (sólo logueada).
function buildPostOpts() {
  if (!isAuthed()) return {};
  return {
    onEdit: (post) => { location.href = `/escribir?edit=${post.id}`; },
    onDelete: async (post) => {
      if (!confirm('¿borrar esta publicación?')) return;
      const { ok } = await api(`/api/posts/${post.id}`, { method: 'DELETE' });
      if (!ok) { toast('no se pudo borrar', 'error'); return; }
      document.querySelector(`.post[data-id="${post.id}"]`)?.remove();
      toast('borrado');
    },
  };
}

const feed = createFeed({ container: feedEl, sentinel, buildPostOpts });

// Marca visualmente el filtro activo en la lista.
function markActive(tag) {
  for (const b of listEl.querySelectorAll('.hashtag-filter')) {
    b.classList.toggle('active', (b.dataset.tag || '') === (tag || ''));
  }
}

// Tiñe el fondo de la home con el color de la jordi si el tag activo coincide
// con el nombre de una (#jordi, #jordy, …); si no, lo restaura. El color sólo
// se aplica vía style tras revalidar el hex.
function tintPage(tag) {
  const color = tag ? JORDI_COLORS[String(tag).toLowerCase()] : null;
  if (isHexColor(color)) {
    document.body.classList.add('tag-tinted');
    document.body.style.backgroundColor = color;
  } else {
    document.body.classList.remove('tag-tinted');
    document.body.style.removeProperty('background-color');
  }
}

function applyTag(tag) {
  feed.setFilter({ tag });
  markActive(tag);
  tintPage(tag);
  const url = tag ? `/?tag=${encodeURIComponent(tag)}` : '/';
  history.replaceState(null, '', url);
}

// Filtra el feed por una ubicación (al tocar el "lugar" de un post). Limpia el
// filtro por hashtag y el tinte (la ubicación no lleva color de jordi).
function applyLocation(loc) {
  feed.setFilter({ location: loc });
  markActive(null);
  tintPage(null);
  const url = loc ? `/?ubicacion=${encodeURIComponent(loc)}` : '/';
  history.replaceState(null, '', url);
}

// Carga las jordis para saber qué tags llevan color (nombre → color).
async function loadJordiColors() {
  const { ok, data } = await api('/api/jordis');
  if (!ok || !Array.isArray(data)) return;
  for (const j of data) {
    if (j?.nombre && isHexColor(j.color)) JORDI_COLORS[String(j.nombre).toLowerCase()] = j.color;
  }
}

async function loadHashtags() {
  const { ok, data } = await api('/api/hashtags');
  listEl.replaceChildren();
  // "todo" para quitar el filtro.
  const liAll = el('li');
  const bAll = el('button', { class: 'hashtag-filter', text: 'todo', attrs: { type: 'button', 'data-tag': '' } });
  bAll.addEventListener('click', () => applyTag(null));
  liAll.appendChild(bAll);
  listEl.appendChild(liAll);
  if (!ok || !Array.isArray(data)) return;
  // Primero los hashtags normales; los de jordi (con color) van pegados abajo.
  const isJordi = (t) => !!JORDI_COLORS[String(t).toLowerCase()];
  const ordered = [
    ...data.filter((h) => !isJordi(h.tag)),
    ...data.filter((h) => isJordi(h.tag)),
  ];
  let firstJordi = true;
  for (const { tag, count } of ordered) {
    const li = el('li');
    // Un pequeño respiro visual antes del primer tag de jordi (grupo de abajo).
    if (isJordi(tag) && firstJordi) { li.classList.add('jordi-group-start'); firstJordi = false; }
    const b = el('button', { class: 'hashtag-filter', attrs: { type: 'button', 'data-tag': tag } });
    b.appendChild(document.createTextNode(`#${tag} `));
    b.appendChild(el('span', { class: 'count', text: String(count) }));
    tintHashtag(b, tag);
    b.addEventListener('click', () => applyTag(tag));
    li.appendChild(b);
    listEl.appendChild(li);
  }
}

// Clicks en #hashtags o en la ubicación dentro de los posts → filtran sin recargar.
feedEl.addEventListener('click', (e) => {
  const a = e.target.closest('a.hashtag');
  if (a) {
    e.preventDefault();
    applyTag(a.dataset.tag);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  const loc = e.target.closest('.post-lugar');
  if (loc) {
    applyLocation(loc.dataset.loc);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
});

(async function init() {
  await checkAuth();
  await loadJordiColors();
  await loadHashtags();
  const params = new URLSearchParams(location.search);
  const tag = params.get('tag');
  const loc = params.get('ubicacion');
  feed.start({ tag, location: loc });
  markActive(loc ? null : tag);
  tintPage(loc ? null : tag);
})();
