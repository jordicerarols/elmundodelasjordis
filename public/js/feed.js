// ----- feed: fetch paginado + scroll infinito + filtro por hashtag/ubicación -----

import { api } from './api.js';
import { el, toast } from './utils.js';
import { renderPost } from './render.js';

export function createFeed({ container, sentinel, buildPostOpts }) {
  let cursor = null;
  let tag = null;
  let location = null;
  let loading = false;
  let done = false;

  const empty = el('p', { class: 'feed-empty', text: 'todavía no hay nada por aquí…' });

  async function loadMore() {
    if (loading || done) return;
    loading = true;
    const params = new URLSearchParams({ limit: '20' });
    if (cursor) params.set('cursor', cursor);
    if (tag) params.set('tag', tag);
    if (location) params.set('ubicacion', location);
    const { ok, data } = await api(`/api/posts?${params}`);
    loading = false;
    if (!ok || !data) {
      toast('no se pudo cargar el feed', 'error');
      return;
    }
    for (const post of data.posts) {
      container.appendChild(renderPost(post, buildPostOpts ? buildPostOpts(post) : {}));
    }
    cursor = data.nextCursor;
    if (!cursor) done = true;
    if (container.childElementCount === 0) container.appendChild(empty);
    // Encadena si el sentinel sigue visible (viewport alto / pocas tarjetas).
    if (!done && sentinel && isInView(sentinel)) loadMore();
  }

  function isInView(node) {
    const r = node.getBoundingClientRect();
    return r.top < (window.innerHeight || 0) + 200;
  }

  // Re-dispara la animación de entrada del feed (fade + leve subida). Se quita y
  // se vuelve a poner la clase forzando un reflow para que reinicie cada filtro.
  function playEnter() {
    container.classList.remove('feed-enter');
    void container.offsetWidth;
    container.classList.add('feed-enter');
  }

  // Reinicia el feed con un filtro (tag y/o ubicación; nada = todos) y recarga
  // desde cero, con transición.
  function setFilter({ tag: nextTag = null, location: nextLoc = null } = {}) {
    tag = nextTag || null;
    location = nextLoc || null;
    cursor = null;
    done = false;
    container.replaceChildren();
    playEnter();
    loadMore();
  }

  function start(initial = {}) {
    tag = initial.tag || null;
    location = initial.location || null;
    if (sentinel && 'IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore();
      }, { rootMargin: '400px' });
      io.observe(sentinel);
    }
    playEnter();
    loadMore();
  }

  return {
    start,
    setFilter,
    get tag() { return tag; },
    get location() { return location; },
  };
}
