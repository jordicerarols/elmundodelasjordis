// ----- render de una tarjeta de post -----
//
// SANITIZACIÓN: todo el texto de usuario (titulo, text, location, tags) se
// inserta con textContent / createTextNode. NUNCA se compone innerHTML con
// datos del post, así que un título como `<img onerror=…>` se muestra literal.

import { el } from './utils.js';

// Inserta el cuerpo de texto detectando #hashtags y convirtiéndolos en enlaces,
// sin construir HTML: alterna nodos de texto y <a> (data-tag) creados con
// textContent. Preserva saltos de línea con white-space:pre-wrap en el CSS.
function appendBodyWithHashtags(container, text) {
  const re = /#([\p{L}\p{N}_]+)/gu;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      container.appendChild(document.createTextNode(text.slice(last, m.index)));
    }
    const tag = m[1].toLowerCase();
    const a = el('a', {
      class: 'hashtag',
      text: `#${m[1]}`,
      attrs: { href: `/?tag=${encodeURIComponent(tag)}`, 'data-tag': tag },
    });
    container.appendChild(a);
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    container.appendChild(document.createTextNode(text.slice(last)));
  }
}

function renderMedia(media) {
  const wrap = el('div', { class: 'post-media' });
  for (const m of media) {
    if (m.kind === 'image') {
      const img = el('img', {
        class: 'post-img',
        attrs: { src: `/r2/${m.r2_key}`, loading: 'lazy', alt: '' },
      });
      wrap.appendChild(img);
    } else if (m.kind === 'video') {
      const v = el('video', {
        class: 'post-video',
        attrs: { src: `/r2/${m.r2_key}`, controls: '', preload: 'metadata', playsinline: '' },
      });
      if (m.thumb_key) v.setAttribute('poster', `/r2/${m.thumb_key}`);
      wrap.appendChild(v);
    }
  }
  return wrap;
}

// Devuelve el <article> de un post. `opts.onEdit` / `opts.onDelete` (si vienen,
// sólo logueada) añaden los controles de edición in situ.
export function renderPost(post, opts = {}) {
  const art = el('article', { class: 'post', attrs: { 'data-id': String(post.id) } });

  if (post.titulo) {
    art.appendChild(el('h2', { class: 'post-titulo', text: post.titulo }));
  }
  if (post.text) {
    const body = el('div', { class: 'post-body' });
    appendBodyWithHashtags(body, post.text);
    art.appendChild(body);
  }
  if (post.media?.length) {
    art.appendChild(renderMedia(post.media));
  }

  const foot = el('footer', { class: 'post-foot' });
  if (post.location) {
    foot.appendChild(el('span', { class: 'post-lugar', text: post.location }));
  }
  // Hashtags del post (los del campo dedicado + los del cuerpo) como chips.
  if (post.hashtags?.length) {
    const tags = el('span', { class: 'post-tags' });
    for (const t of post.hashtags) {
      tags.appendChild(el('a', {
        class: 'hashtag',
        text: `#${t}`,
        attrs: { href: `/?tag=${encodeURIComponent(t)}`, 'data-tag': t },
      }));
    }
    foot.appendChild(tags);
  }

  if (opts.onEdit || opts.onDelete) {
    const controls = el('span', { class: 'post-controls', attrs: { 'data-authed-only': '' } });
    if (opts.onEdit) {
      const b = el('button', { class: 'linky', text: 'editar', attrs: { type: 'button' } });
      b.addEventListener('click', () => opts.onEdit(post));
      controls.appendChild(b);
    }
    if (opts.onDelete) {
      const b = el('button', { class: 'linky', text: 'borrar', attrs: { type: 'button' } });
      b.addEventListener('click', () => opts.onDelete(post));
      controls.appendChild(b);
    }
    foot.appendChild(controls);
  }

  if (foot.childNodes.length) art.appendChild(foot);
  return art;
}
