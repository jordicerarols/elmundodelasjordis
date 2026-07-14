import { describe, it, expect } from "vitest";
import { buildVideoArgs, shouldKeepOriginalVideo } from "../public/js/compressor-video.js";

// Preset mínimo para no depender de los valores del PRESET real.
const preset = {
  label: "720p",
  maxBox: 1280,
  crf: 10,
  videoBitrate: "2000k",
  audioBitrate: "128k",
  cpuUsed: 4,
};

describe("buildVideoArgs", () => {
  it("sin trim ni crop: -i input … -vf scale output", () => {
    const args = buildVideoArgs({ input: "in.mp4", output: "out.webm", preset });
    expect(args[0]).toBe("-i");
    expect(args[1]).toBe("in.mp4");
    expect(args[args.length - 1]).toBe("out.webm");
    expect(args).not.toContain("-ss");
    const vf = args[args.indexOf("-vf") + 1];
    expect(vf).toMatch(/^scale=/);
    expect(vf).not.toContain("crop=");
  });

  it("con trim: -ss/-t DESPUÉS de -i (output-seeking)", () => {
    const args = buildVideoArgs({
      input: "in.mp4", output: "out.webm", preset,
      trim: { start: 2.5, duration: 4 },
    });
    const iIdx = args.indexOf("-i");
    const ssIdx = args.indexOf("-ss");
    expect(ssIdx).toBeGreaterThan(iIdx);
    expect(args[ssIdx + 1]).toBe("2.5");
    expect(args[args.indexOf("-t") + 1]).toBe("4");
  });

  it("trim de duración 0 se ignora", () => {
    const args = buildVideoArgs({
      input: "in.mp4", output: "out.webm", preset,
      trim: { start: 1, duration: 0 },
    });
    expect(args).not.toContain("-ss");
  });

  it("con crop: crop ANTES de scale y redondeado a par (libvpx)", () => {
    const args = buildVideoArgs({
      input: "in.mp4", output: "out.webm", preset,
      crop: { x: 11, y: 7, w: 301, h: 201 }, srcW: 1920, srcH: 1080,
    });
    const vf = args[args.indexOf("-vf") + 1];
    // 301→300, 201→200, 11→10, 7→6 (floor a par)
    expect(vf).toMatch(/^crop=300:200:10:6,scale=/);
  });
});

describe("shouldKeepOriginalVideo", () => {
  const base = { fileType: "video/mp4", fileSize: 1000, encodedSize: 2000, sizeLimit: 5000, edited: false };

  it("mantiene el original si es web-safe, más pequeño y sin editar", () => {
    expect(shouldKeepOriginalVideo(base)).toBe(true);
  });

  it("nunca con edición (el output ya no es el original)", () => {
    expect(shouldKeepOriginalVideo({ ...base, edited: true })).toBe(false);
  });

  it("nunca con .mov/quicktime (suele ser HEVC, no reproduce en Chrome/Firefox)", () => {
    expect(shouldKeepOriginalVideo({ ...base, fileType: "video/quicktime" })).toBe(false);
  });

  it("nunca si el original excede el límite de subida", () => {
    expect(shouldKeepOriginalVideo({ ...base, fileSize: 9000 })).toBe(false);
  });

  it("sizeLimit falsy (aún sin cargar) no bloquea", () => {
    expect(shouldKeepOriginalVideo({ ...base, sizeLimit: 0 })).toBe(true);
  });

  it("nunca si el reencode quedó más pequeño", () => {
    expect(shouldKeepOriginalVideo({ ...base, encodedSize: 500 })).toBe(false);
  });
});
