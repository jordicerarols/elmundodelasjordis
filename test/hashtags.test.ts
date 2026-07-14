import { describe, it, expect } from "vitest";
import { extractHashtags, parseHashtagsField } from "../src/hashtags";

describe("extractHashtags", () => {
  it("extrae tags del cuerpo, en minúsculas y sin duplicados", () => {
    expect(extractHashtags("hola #Verano y #playa y otra vez #verano")).toEqual([
      "verano",
      "playa",
    ]);
  });

  it("acepta acentos, ñ y guión bajo (\\p{L}\\p{N}_)", () => {
    expect(extractHashtags("#emoción #año_nuevo #123")).toEqual([
      "emoción",
      "año_nuevo",
      "123",
    ]);
  });

  it("devuelve [] con texto vacío o null", () => {
    expect(extractHashtags("")).toEqual([]);
    expect(extractHashtags(null)).toEqual([]);
    expect(extractHashtags("sin tags")).toEqual([]);
  });
});

describe("parseHashtagsField", () => {
  it("acepta '#hola #mundo' y 'hola, mundo' por igual", () => {
    expect(parseHashtagsField("#hola #mundo")).toEqual(["hola", "mundo"]);
    expect(parseHashtagsField("hola, mundo")).toEqual(["hola", "mundo"]);
  });

  it("normaliza a minúsculas y deduplica", () => {
    expect(parseHashtagsField("#Playa playa PLAYA")).toEqual(["playa"]);
  });

  it("ignora tokens sin caracteres válidos", () => {
    expect(parseHashtagsField("### , !!")).toEqual([]);
    expect(parseHashtagsField(null)).toEqual([]);
  });
});
