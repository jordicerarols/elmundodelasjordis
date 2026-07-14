// ----- geometría pura de la compresión de medios (sin DOM) -----
//
// Helpers matemáticos compartidos por compressor-image.js y
// compressor-video.js. Sin DOM ni ffmpeg: testeables en Node a pelo.
//
// (En twoitter, de donde viene este motor, aquí vivía también la geometría del
// editor de recorte/trim; esa UI no se portó a jordis y su matemática se retiró
// con ella — recuperarla es copiar de vuelta el archivo del repo original.)

export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

// Redondea un crop a dimensiones PARES (libvpx las exige) manteniéndolo dentro
// del frame. Floor a par en w/h (mín 2) y offset par en x/y.
export function roundEvenCrop(crop, srcW, srcH) {
  const evenFloor = (n) => Math.max(2, Math.floor(n / 2) * 2);
  const evenOffset = (n) => Math.max(0, Math.floor(n / 2) * 2);
  let w = evenFloor(crop.w);
  let h = evenFloor(crop.h);
  let x = evenOffset(clamp(crop.x, 0, srcW - w));
  let y = evenOffset(clamp(crop.y, 0, srcH - h));
  if (x + w > srcW) w = evenFloor(srcW - x);
  if (y + h > srcH) h = evenFloor(srcH - y);
  return { x, y, w, h };
}

// Escala las dimensiones de un recorte para que el lado largo no pase de maxDim
// (igual política que la imagen completa). Devuelve las dims del canvas destino.
export function cropAndScaleDims(sw, sh, maxDim) {
  let w = sw;
  let h = sh;
  if (sw > maxDim || sh > maxDim) {
    const r = sw > sh ? maxDim / sw : maxDim / sh;
    w = Math.round(sw * r);
    h = Math.round(sh * r);
  }
  return { w, h };
}
