// ----- compresión cliente: barril -----
//
// La compresión vive en dos módulos por tipo de medio, que tienen poco que
// ver entre sí (ffmpeg.wasm + SharedArrayBuffer para vídeo; canvas + encoder
// WebP wasm para imagen). Este archivo reexporta la API pública para que el
// resto del front (composer.js) importe desde un único sitio.
//
//   compressor-video.js → detectCapabilities, compressVideo, generateVideoThumb
//   compressor-image.js → compressImage

export {
  detectCapabilities,
  compressVideo,
  generateVideoThumb,
} from './compressor-video.js';
export { compressImage } from './compressor-image.js';
