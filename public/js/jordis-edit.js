// ----- página "editar las jordis": CRUD -----

import { api } from './api.js';
import { $, el, toast, isHexColor } from './utils.js';
import { checkAuth } from './auth.js';

const rowsEl = $('#jordiRows');
const addBtn = $('#addJordi');

const DEFAULT_COLOR = '#7fd4ff';

// Construye una fila. `jordi` null = fila nueva (crear).
function buildRow(jordi) {
  const row = el('div', { class: 'jordi-row' });
  if (jordi) row.dataset.id = String(jordi.id);

  const nombre = el('input', { class: 'nombre-in', attrs: { type: 'text', placeholder: 'nombre', maxlength: '80' } });
  nombre.value = jordi?.nombre || '';

  const subtitulo = el('input', { class: 'subtitulo-in', attrs: { type: 'text', placeholder: 'subtítulo', maxlength: '120' } });
  subtitulo.value = jordi?.subtitulo || '';

  const color = el('input', { attrs: { type: 'color' } });
  color.value = isHexColor(jordi?.color) ? jordi.color : DEFAULT_COLOR;

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

  row.appendChild(nombre);
  row.appendChild(subtitulo);
  row.appendChild(color);
  row.appendChild(texto);
  row.appendChild(actions);
  return row;
}

addBtn.addEventListener('click', () => {
  rowsEl.appendChild(buildRow(null));
});

(async function init() {
  await checkAuth();
  const { ok, data } = await api('/api/jordis');
  rowsEl.replaceChildren();
  if (ok && Array.isArray(data)) {
    for (const j of data) rowsEl.appendChild(buildRow(j));
  }
})();
