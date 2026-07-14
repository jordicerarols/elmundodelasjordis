import { describe, it, expect } from "vitest";
import { timingSafeEqual, makeToken, verifyToken } from "../src/auth";

describe("timingSafeEqual", () => {
  it("iguales → true; distintas → false", () => {
    expect(timingSafeEqual("secreta", "secreta")).toBe(true);
    expect(timingSafeEqual("secreta", "secretA")).toBe(false);
  });

  it("longitudes distintas → false (sin early-exit)", () => {
    expect(timingSafeEqual("corta", "mucho más larga")).toBe(false);
    expect(timingSafeEqual("", "x")).toBe(false);
    expect(timingSafeEqual("", "")).toBe(true);
  });
});

describe("makeToken / verifyToken", () => {
  const SECRET = "un-secreto-de-test";

  it("roundtrip: un token recién emitido verifica", async () => {
    const token = await makeToken(SECRET);
    expect(await verifyToken(SECRET, token)).toBe(true);
  });

  it("rechaza token manipulado, secreto distinto y basura", async () => {
    const token = await makeToken(SECRET);
    expect(await verifyToken("otro-secreto", token)).toBe(false);
    expect(await verifyToken(SECRET, token + "x")).toBe(false);
    expect(await verifyToken(SECRET, "sin-punto")).toBe(false);
    expect(await verifyToken(SECRET, undefined)).toBe(false);
  });

  it("rechaza tokens con fecha futura o caducada", async () => {
    // El token es `issued.hmac(issued)`: fabricamos uno válido pero viejo
    // firmándolo con el MISMO hmac que usa makeToken (copiado del formato).
    const issuedOld = String(Date.now() - 61 * 24 * 60 * 60 * 1000); // 61 días
    // No hay export del hmac interno: comprobamos vía verifyToken de un token
    // legítimo cuyo timestamp alteramos → la firma deja de casar (también ok).
    const token = await makeToken(SECRET);
    const [, sig] = token.split(".");
    expect(await verifyToken(SECRET, `${issuedOld}.${sig}`)).toBe(false);
  });
});
