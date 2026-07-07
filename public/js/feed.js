// ----- feed: fetch paginado + scroll infinito + filtro por hashtag -----

import { api } from './api.js';
import { el, toast } from './utils.js';
import { renderPost } from './render.js';

export function createFeed({ container, sentinel, buildPostOpts }) {
  let cursor = null;
  let tag = null;
  let loading = false;
  let done = false;

  const empty = el('p', { class: 'feed-empty', text: 'todavía no hay nada por aquí…' });

  async function loadMore() {
    if (loading || done) return;
    loading = true;
    const params = new URLSearchParams({ limit: '20' });
    if (cursor) params.set('cursor', cursor);
    if (tag) params.set('tag', tag);
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

  // Reinicia con un tag (o null = todos) y recarga desde cero.
  function setTag(next) {
    tag = next || null;
    cursor = null;
    done = false;
    container.replaceChildren();
    loadMore();
  }

  function start(initialTag) {
    tag = initialTag || null;
    if (sentinel && 'IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore();
      }, { rootMargin: '400px' });
      io.observe(sentinel);
    }
    loadMore();
  }

  return { start, setTag, get tag() { return tag; } };
}
