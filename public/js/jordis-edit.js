// ----- página "editar las jordis": CRUD -----

import { api } from './api.js';
import { $, el, toast, isHexColor } from './utils.js';
import { checkAuth } from './auth.js';

const rowsEl = $('#jordiRows');
const addBtn = $('#addJordi');

const DEFAULT_COLOR = '#7fd4ff';

// Los 4 colores pastel del seed original (schema.sql, mantener en sync). Van a
// un <datalist> compartido: el picker nativo los ofrece como muestras fijas,
// así siempre se puede volver a un color original aunque se haya toqueteado.
const ORIGINAL_COLORS = ['#7fd4ff', '#f9a8d4', '#86efac', '#fde047'];
const PALETTE_ID = 'jordiPalette';

function ensurePalette() {
  if (document.getElementById(PALETTE_ID)) return;
  const list = el('datalist', { attrs: { id: PALETTE_ID } });
  for (const c of ORIGINAL_COLORS) list.appendChild(el('option', { attrs: { value: c } }));
  document.body.appendChild(list);
}

// Pastel aleatorio para jordis nuevas: tono al azar, saturación/luminosidad
// fijas en la misma familia que los originales (input[type=color] exige hex).
function randomPastel() {
  const h = Math.floor(Math.random() * 360);
  const s = 0.85, l = 0.75;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const hex = (v) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${hex(f(0))}${hex(f(8))}${hex(f(4))}`;
}

// Persiste el orden actual de las filas YA guardadas (las nuevas sin id sólo
// se mueven en el DOM; entran al orden cuando se crean).
async function saveOrder() {
  const ids = [...rowsEl.children].map((r) => Number(r.dataset.id)).filter(Boolean);
  if (ids.length < 2) return;
  const res = await api('/api/jordis/order', { method: 'PATCH', body: { ids } });
  if (!res.ok) toast('no se pudo guardar el orden', 'error');
}

// Construye una fila. `jordi` null = fila nueva (crear).
function buildRow(jordi) {
  const row = el('div', { class: 'jordi-row' });
  if (jordi) row.dataset.id = String(jordi.id);

  const nombre = el('input', { class: 'nombre-in', attrs: { type: 'text', placeholder: 'nombre', maxlength: '80' } });
  nombre.value = jordi?.nombre || '';

  const subtitulo = el('input', { class: 'subtitulo-in', attrs: { type: 'text', placeholder: 'subtítulo', maxlength: '120' } });
  subtitulo.value = jordi?.subtitulo || '';

  const color = el('input', { attrs: { type: 'color', list: PALETTE_ID } });
  color.value = isHexColor(jordi?.color) ? jordi.color : jordi ? DEFAULT_COLOR : randomPastel();

  // Muestras de los colores originales EN la página, además del datalist:
  // los navegadores viejos (Safari) ignoran el datalist y abren la rueda del
  // sistema directamente, así que las ofrecemos como botones siempre visibles.
  const colorWrap = el('span', { class: 'jordi-color-wrap' });
  colorWrap.appendChild(color);
  const swatches = el('span', { class: 'jordi-swatches' });
  for (const c of ORIGINAL_COLORS) {
    const sw = el('button', { class: 'jordi-swatch', attrs: { type: 'button', 'aria-label': `usar ${c}`, title: c } });
    sw.style.backgroundColor = c;
    sw.addEventListener('click', () => { color.value = c; });
    swatches.appendChild(sw);
  }
  colorWrap.appendChild(swatches);

  const texto = el('textarea', { class: 'texto-in', attrs: { placeholder: 'contenido', maxlength: '4000' } });
  texto.value = jordi?.texto || '';

  const actions = el('span', { class: 'del', style: '' });
  const saveBtn = el('button', { class: 'linky', text: jordi ? 'guardar' : 'crear', attrs: { type: 'button' } });
  actions.appendChild(saveBtn);

  saveBtn.addEventListener('click', async () => {
    const payload = { nombre: nombre.value.trim(), subtitulo: subtitulo.value.trim(), color: color.value, texto: texto.value };
    if (!payload.nombre) { toast('pon un nombre', 'error'); return; }
    saveBtn.disabled = true;
    const id = row.dataset.id;
    const res = id
      ? await api(`/api/jordis/${id}`, { method: 'PATCH', body: payload })
      : await api('/api/jordis', { method: 'POST', body: payload });
    saveBtn.disabled = false;
    if (!res.ok) { toast(res.data?.error || 'no se pudo guardar', 'error'); return; }
    if (!id && res.data?.id) {
      row.dataset.id = String(res.data.id);
      saveBtn.textContent = 'guardar';
      delBtn.hidden = false;
    }
    toast('guardado');
  });

  const delBtn = el('button', { class: 'linky', text: 'borrar', attrs: { type: 'button' } });
  delBtn.hidden = !jordi;
  delBtn.addEventListener('click', async () => {
    const id = row.dataset.id;
    if (!id) { row.remove(); return; }
    if (!confirm(`¿borrar "${nombre.value}"?`)) return;
    const { ok } = await api(`/api/jordis/${id}`, { method: 'DELETE' });
    if (!ok) { toast('no se pudo borrar', 'error'); return; }
    row.remove();
    toast('borrada');
  });
  actions.appendChild(delBtn);

  // Reordenar con flechas: mueve la fila en el DOM y persiste el orden
  // (el endpoint PATCH /api/jordis/order ya existía sin UI).
  const upBtn = el('button', { class: 'linky', text: '↑', attrs: { type: 'button', 'aria-label': 'subir' } });
  const downBtn = el('button', { class: 'linky', text: '↓', attrs: { type: 'button', 'aria-label': 'bajar' } });
  upBtn.addEventListener('click', () => {
    const prev = row.previousElementSibling;
    if (!prev) return;
    rowsEl.insertBefore(row, prev);
    saveOrder();
  });
  downBtn.addEventListener('click', () => {
    const next = row.nextElementSibling;
    if (!next) return;
    rowsEl.insertBefore(next, row);
    saveOrder();
  });
  actions.appendChild(upBtn);
  actions.appendChild(downBtn);

  row.appendChild(nombre);
  row.appendChild(subtitulo);
  row.appendChild(colorWrap);
  row.appendChild(texto);
  row.appendChild(actions);
  return row;
}

addBtn.addEventListener('click', () => {
  rowsEl.appendChild(buildRow(null));
});

(async function init() {
  ensurePalette();
  await checkAuth();
  const { ok, data } = await api('/api/jordis');
  rowsEl.replaceChildren();
  if (ok && Array.isArray(data)) {
    for (const j of data) rowsEl.appendChild(buildRow(j));
  }
})();
