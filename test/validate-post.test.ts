import { describe, it, expect } from "vitest";
import { validatePostBody } from "../src/index";

describe("validatePostBody", () => {
  it("post vacío → 400", () => {
    const v = validatePostBody({});
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error).toBe("post vacio");
  });

  it("junta los #tags del campo dedicado y los del cuerpo, sin duplicar", () => {
    const v = validatePostBody({ text: "hola #playa", hashtags: "#verano playa" });
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.tags.sort()).toEqual(["playa", "verano"]);
  });

  it("también recoge los #tags embebidos en el título", () => {
    const v = validatePostBody({ titulo: "Verano en la #playa", text: "sin tags" });
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.tags).toEqual(["playa"]);
  });

  it("trunca titulo/location a sus topes y convierte vacíos en null", () => {
    const v = validatePostBody({ titulo: "x".repeat(500), text: "hola", location: "  " });
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.titulo!.length).toBe(200);
      expect(v.location).toBeNull();
    }
  });

  it("rechaza media sin r2_key o con kind inválido", () => {
    expect(
      validatePostBody({ media: [{ kind: "image", r2_key: "" }] }).ok,
    ).toBe(false);
    expect(
      validatePostBody({ media: [{ kind: "audio", r2_key: "a" }] }).ok,
    ).toBe(false);
  });

  it("acepta un post sólo-media y rellena defaults", () => {
    const v = validatePostBody({ media: [{ kind: "image", r2_key: "images/a.webp" }] });
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.media[0]).toEqual({
        kind: "image", r2_key: "images/a.webp", thumb_key: null, width: null, height: null,
      });
      expect(v.titulo).toBeNull();
      expect(v.text).toBeNull();
    }
  });

  it("texto por encima del tope → 400", () => {
    const v = validatePostBody({ text: "x".repeat(4001) });
    expect(v.ok).toBe(false);
  });
});
