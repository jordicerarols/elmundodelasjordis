// ----- render de una tarjeta de post -----
//
// SANITIZACIÓN: todo el texto de usuario (titulo, text, location, tags) se
// inserta con textContent / createTextNode. NUNCA se compone innerHTML con
// datos del post, así que un título como `<img onerror=…>` se muestra literal.

import { el, isHexColor } from './utils.js';
import { JORDI_COLORS } from './state.js';

// Si el tag coincide con el nombre de una jordi, tiñe el enlace con su color.
// El color sólo se aplica vía style tras revalidar el hex (nunca como HTML).
export function tintHashtag(a, tag) {
  const color = JORDI_COLORS[String(tag).toLowerCase()];
  if (isHexColor(color)) {
    a.classList.add('hashtag-jordi');
    a.style.color = color;
  }
}

// Inserta texto detectando #hashtags y convirtiéndolos en enlaces, sin construir
// HTML: alterna nodos de texto y <a> (data-tag) creados con textContent.
// Preserva saltos de línea con white-space:pre-wrap en el CSS. Se usa para el
// cuerpo y el título de un post, y para el texto de una jordi (los #tags son
// clicables en los tres sitios).
export function appendTextWithHashtags(container, text) {
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
    tintHashtag(a, tag);
    container.appendChild(a);
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    container.appendChild(document.createTextNode(text.slice(last)));
  }
}

// "14 de julio de 2026, 18:32" — día mes año y hora, en local del visitante.
function formatFecha(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const fecha = d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  const hora = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  return `${fecha}, ${hora}`;
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

  // Cabecera: título a la izquierda; lugar + fecha arriba a la derecha.
  const head = el('header', { class: 'post-head' });
  if (post.titulo) {
    const h2 = el('h2', { class: 'post-titulo' });
    appendTextWithHashtags(h2, post.titulo);
    head.appendChild(h2);
  }
  const meta = el('span', { class: 'post-meta' });
  if (post.location) {
    // Botón: al tocarlo se filtra el feed por esa ubicación (delegado en la home).
    meta.appendChild(el('button', {
      class: 'post-lugar',
      text: post.location,
      attrs: { type: 'button', 'data-loc': post.location },
    }));
  }
  const fecha = formatFecha(post.created_at);
  if (fecha) {
    if (post.location) meta.appendChild(document.createTextNode(' · '));
    meta.appendChild(el('time', {
      class: 'post-fecha',
      text: fecha,
      attrs: { datetime: post.created_at },
    }));
  }
  if (meta.childNodes.length) head.appendChild(meta);
  if (head.childNodes.length) art.appendChild(head);

  if (post.text) {
    const body = el('div', { class: 'post-body' });
    appendTextWithHashtags(body, post.text);
    art.appendChild(body);
  }
  if (post.media?.length) {
    art.appendChild(renderMedia(post.media));
  }

  const foot = el('footer', { class: 'post-foot' });
  // Hashtags del post (los del campo dedicado + los del cuerpo) como chips.
  if (post.hashtags?.length) {
    const tags = el('span', { class: 'post-tags' });
    for (const t of post.hashtags) {
      const a = el('a', {
        class: 'hashtag',
        text: `#${t}`,
        attrs: { href: `/?tag=${encodeURIComponent(t)}`, 'data-tag': t },
      });
      tintHashtag(a, t);
      tags.appendChild(a);
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
