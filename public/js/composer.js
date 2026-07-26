// ----- página "escribir": composer con fotos + vídeo -----
//
// Flujo de media: al elegir/soltar un archivo se comprime en cliente (imagen →
// WebP; vídeo → VP8/WebM vía ffmpeg.wasm) y se sube a R2 (/api/upload). Al
// enviar el post se mandan las claves r2 en el ORDEN de las miniaturas (las
// flechas ‹ › reordenan). En modo edición (?edit=<id>) los adjuntos existentes
// se cargan como miniaturas: se pueden quitar, añadir nuevos o reordenar; al
// guardar se manda el estado final y el server reemplaza.

import { api } from './api.js';
import { $, el, toast, uuid, mediaKindOf } from './utils.js';
import { checkAuth } from './auth.js';
import { MEDIA_LIMITS } from './state.js';
import { compressImage, compressVideo, generateVideoThumb, detectCapabilities } from './compressor.js';

const form = $('#composer');
const drop = $('#mediaDrop');
const fileInput = $('#mediaInput');
const previews = $('#mediaPreviews');
const submitBtn = $('#submitBtn');
const pageTitle = $('#pageTitle');

// id local → { file, kind, status, r2_key, thumb_key, width, height, node }
const pending = new Map();

const editId = new URLSearchParams(location.search).get('edit');

// ---------- subida de un blob a R2 ----------
async function uploadBlob(blob, folder) {
  const { ok, data } = await api('/api/upload', {
    method: 'POST',
    body: blob,
    headers: { 'x-content-type': blob.type, 'x-folder': folder },
  });
  if (!ok || !data?.key) throw new Error(data?.error || 'fallo al subir');
  return data.key;
}

// ---------- preview + estado ----------
function setStatus(id, text) {
  const item = pending.get(id);
  if (item?.node) item.node.querySelector('.status').textContent = text;
}

function addPreview(id, kind) {
  const node = el('div', { class: 'media-thumb', attrs: { 'data-id': id } });
  const media = kind === 'video' ? el('video', { attrs: { muted: '' } }) : el('img');
  node.appendChild(media);
  node.appendChild(el('div', { class: 'status', text: 'preparando…' }));
  const rm = el('button', { class: 'remove', text: '✕', attrs: { type: 'button', 'aria-label': 'quitar' } });
  rm.addEventListener('click', () => { pending.delete(id); node.remove(); });
  node.appendChild(rm);
  // Flechas de orden: mueven la miniatura; el orden del DOM es el que se envía.
  const back = el('button', { class: 'move move-back', text: '‹', attrs: { type: 'button', 'aria-label': 'mover antes' } });
  back.addEventListener('click', () => {
    const prev = node.previousElementSibling;
    if (prev) previews.insertBefore(node, prev);
  });
  const fwd = el('button', { class: 'move move-fwd', text: '›', attrs: { type: 'button', 'aria-label': 'mover después' } });
  fwd.addEventListener('click', () => {
    const next = node.nextElementSibling;
    if (next) previews.insertBefore(next, node);
  });
  node.appendChild(back);
  node.appendChild(fwd);
  previews.appendChild(node);
  return node;
}

// Media lista para enviar, en el orden visual de las miniaturas.
function orderedMedia() {
  return [...previews.children]
    .map((n) => pending.get(n.dataset.id))
    .filter((i) => i && i.status === 'ready' && i.r2_key)
    .map((i) => ({ kind: i.kind, r2_key: i.r2_key, thumb_key: i.thumb_key, width: i.width, height: i.height }));
}

async function handleFile(file) {
  const kind = mediaKindOf(file);
  if (!kind) { toast('sólo fotos o vídeo', 'error'); return; }
  const id = uuid();
  const node = addPreview(id, kind);
  const item = { file, kind, status: 'processing', r2_key: null, thumb_key: null, width: null, height: null, node };
  pending.set(id, item);

  // Vista previa local inmediata.
  const localUrl = URL.createObjectURL(file);
  const mediaEl = node.querySelector(kind === 'video' ? 'video' : 'img');
  mediaEl.src = localUrl;

  try {
    if (kind === 'image') {
      setStatus(id, 'comprimiendo…');
      const { blob, width, height } = await compressImage(file);
      item.width = width; item.height = height;
      setStatus(id, 'subiendo…');
      item.r2_key = await uploadBlob(blob, 'images');
    } else {
      const caps = detectCapabilities();
      if (!caps.ok) throw new Error(caps.reason);
      setStatus(id, 'comprimiendo vídeo…');
      const { blob, width, height } = await compressVideo(file, ({ percent }) => {
        if (percent != null) setStatus(id, `comprimiendo ${percent}%`);
      }, null, MEDIA_LIMITS.video);
      item.width = width; item.height = height;
      // Thumbnail (poster).
      try {
        const thumb = await generateVideoThumb(file);
        item.thumb_key = await uploadBlob(thumb.blob, 'thumbs');
      } catch (_) { /* poster opcional */ }
      setStatus(id, 'subiendo…');
      item.r2_key = await uploadBlob(blob, 'videos');
    }
    item.status = 'ready';
    setStatus(id, 'listo');
  } catch (err) {
    item.status = 'error';
    setStatus(id, `error: ${err.message || 'fallo'}`);
    toast(`fallo con un archivo: ${err.message || ''}`, 'error');
  }
}

// ---------- eventos de adjuntar ----------
drop.addEventListener('click', () => fileInput.click());
drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
fileInput.addEventListener('change', () => {
  for (const f of fileInput.files) handleFile(f);
  fileInput.value = '';
});
['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('dragover'); }));
['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('dragover'); }));
drop.addEventListener('drop', (e) => {
  for (const f of e.dataTransfer.files) handleFile(f);
});

// ---------- submit ----------
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const stillWorking = [...pending.values()].some((i) => i.status === 'processing');
  if (stillWorking) { toast('espera a que terminen los archivos', 'error'); return; }

  const body = {
    titulo: form.titulo.value,
    text: form.contenido.value,
    location: form.lugar.value,
    hashtags: form.hashtags.value,
  };

  submitBtn.disabled = true;
  submitBtn.textContent = editId ? 'guardando…' : 'subiendo…';

  // En edición, `media` es el estado final (quitar/añadir/orden): el server
  // reemplaza los adjuntos del post por esta lista.
  body.media = orderedMedia();
  const res = editId
    ? await api(`/api/posts/${editId}`, { method: 'PATCH', body })
    : await api('/api/posts', { method: 'POST', body });

  submitBtn.disabled = false;
  submitBtn.textContent = editId ? 'guardar' : 'subir';

  if (!res.ok) {
    toast(res.data?.error || 'no se pudo publicar', 'error');
    return;
  }
  location.href = '/';
});

// ---------- init (modo edición) ----------
(async function init() {
  await checkAuth();
  if (!editId) return;
  pageTitle.textContent = 'editar';
  submitBtn.textContent = 'guardar';
  const { ok, data } = await api(`/api/posts/${editId}`);
  if (!ok || !data) { toast('no se encontró la publicación', 'error'); return; }
  form.titulo.value = data.titulo || '';
  form.contenido.value = data.text || '';
  form.lugar.value = data.location || '';
  form.hashtags.value = (data.hashtags || []).map((t) => `#${t}`).join(' ');
  // Los adjuntos existentes entran como miniaturas ya "listas": mismas flechas
  // y ✕ que los nuevos. No se re-suben — sólo viajan sus claves al guardar.
  for (const m of data.media || []) {
    const id = uuid();
    const node = addPreview(id, m.kind);
    const mediaEl = node.querySelector(m.kind === 'video' ? 'video' : 'img');
    // #t=0.001 para que el vídeo enseñe su primer frame como miniatura.
    mediaEl.src = m.kind === 'video' ? `/r2/${m.r2_key}#t=0.001` : `/r2/${m.r2_key}`;
    pending.set(id, {
      file: null, kind: m.kind, status: 'ready',
      r2_key: m.r2_key, thumb_key: m.thumb_key ?? null,
      width: m.width ?? null, height: m.height ?? null, node,
    });
    setStatus(id, 'subido');
  }
})();
