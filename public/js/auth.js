// ----- auth check + visibilidad anon/authed -----

import { $$ } from './utils.js';
import { MEDIA_LIMITS } from './state.js';
import { api } from './api.js';

let IS_AUTHED = false;
export const isAuthed = () => IS_AUTHED;

export async function checkAuth() {
  const { ok, data } = await api('/api/me');
  IS_AUTHED = ok && !!data?.authed;
  if (data?.media) Object.assign(MEDIA_LIMITS, data.media);
  applyAuthVisibility();
  return IS_AUTHED;
}

// Elementos con [data-authed-only] sólo se ven logueada; [data-anon-only] sólo
// anónima. Se llama tras checkAuth().
export function applyAuthVisibility() {
  for (const node of $$('[data-authed-only]')) node.hidden = !IS_AUTHED;
  for (const node of $$('[data-anon-only]')) node.hidden = IS_AUTHED;
  document.body.classList.toggle('is-authed', IS_AUTHED);
  document.body.classList.toggle('is-anon', !IS_AUTHED);
}
