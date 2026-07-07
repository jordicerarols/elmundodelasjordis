// ----- estado compartido entre módulos -----

// Header CSRF: todo POST/PATCH/DELETE lo lleva (lo añade api.js). El server
// (src/index.ts requireCsrf) exige exactamente este header con valor "1".
export const CSRF_HEADERS = { 'x-jordis-csrf': '1' };

// Topes de tamaño de upload (bytes) por tipo. Defaults sensatos; checkAuth()
// los sobreescribe con los del server (/api/me) → una sola fuente de verdad.
// Objeto mutable (no se reasigna el binding) para que los importadores vean
// los valores ya actualizados por live binding.
export const MEDIA_LIMITS = { image: 10485760, video: 52428800 };
