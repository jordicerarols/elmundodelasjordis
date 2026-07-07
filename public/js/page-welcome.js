// ----- entry de la home (welcome) -----

import { api } from './api.js';
import { $, el, toast } from './utils.js';
import { checkAuth, isAuthed } from './auth.js';
import { createFeed } from './feed.js';

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

function applyTag(tag) {
  feed.setTag(tag);
  markActive(tag);
  const url = tag ? `/?tag=${encodeURIComponent(tag)}` : '/';
  history.replaceState(null, '', url);
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
  for (const { tag, count } of data) {
    const li = el('li');
    const b = el('button', { class: 'hashtag-filter', attrs: { type: 'button', 'data-tag': tag } });
    b.appendChild(document.createTextNode(`#${tag} `));
    b.appendChild(el('span', { class: 'count', text: `(${count})` }));
    b.addEventListener('click', () => applyTag(tag));
    li.appendChild(b);
    listEl.appendChild(li);
  }
}

// Clicks en #hashtags dentro de los posts → filtran sin recargar.
feedEl.addEventListener('click', (e) => {
  const a = e.target.closest('a.hashtag');
  if (!a) return;
  e.preventDefault();
  applyTag(a.dataset.tag);
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

(async function init() {
  await checkAuth();
  await loadHashtags();
  const tag = new URLSearchParams(location.search).get('tag');
  feed.start(tag);
  markActive(tag);
})();
