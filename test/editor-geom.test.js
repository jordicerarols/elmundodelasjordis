import { describe, it, expect } from "vitest";
import { clamp, roundEvenCrop, cropAndScaleDims } from "../public/js/editor-geom.js";

describe("clamp", () => {
  it("acota por ambos lados", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });
});

describe("roundEvenCrop", () => {
  it("floor a par en w/h y offset par en x/y", () => {
    expect(roundEvenCrop({ x: 11, y: 7, w: 301, h: 201 }, 1920, 1080)).toEqual({
      x: 10, y: 6, w: 300, h: 200,
    });
  });

  it("no se sale del frame aunque el crop llegue al borde", () => {
    const c = roundEvenCrop({ x: 1900, y: 1060, w: 100, h: 100 }, 1920, 1080);
    expect(c.x + c.w).toBeLessThanOrEqual(1920);
    expect(c.y + c.h).toBeLessThanOrEqual(1080);
    expect(c.w % 2).toBe(0);
    expect(c.h % 2).toBe(0);
  });

  it("mínimo 2px de lado", () => {
    const c = roundEvenCrop({ x: 0, y: 0, w: 1, h: 1 }, 100, 100);
    expect(c.w).toBe(2);
    expect(c.h).toBe(2);
  });
});

describe("cropAndScaleDims", () => {
  it("no toca dimensiones que ya caben", () => {
    expect(cropAndScaleDims(800, 600, 2000)).toEqual({ w: 800, h: 600 });
  });

  it("escala por el lado largo preservando proporción", () => {
    expect(cropAndScaleDims(4000, 2000, 2000)).toEqual({ w: 2000, h: 1000 });
    expect(cropAndScaleDims(2000, 4000, 2000)).toEqual({ w: 1000, h: 2000 });
  });
});
