import { Hono } from "hono";
import type { Context, Next } from "hono";
import {
  isAuthed,
  requireAuth,
  setAuthCookie,
  clearAuthCookie,
  timingSafeEqual,
} from "./auth";
import {
  attachMedia,
  createJordi,
  createPost,
  deleteJordi,
  deletePost,
  exportAll,
  getPost,
  listHashtags,
  listJordis,
  listPosts,
  reorderJordis,
  replaceMedia,
  updateJordi,
  updatePost,
} from "./db";
import { extractHashtags, parseHashtagsField, setHashtags } from "./hashtags";
import { buildMediaKey, classifyContentType, maxBytesFor } from "./media";

// ---------- config ----------

// Parsea un :id de ruta a entero positivo estricto. null si no es válido.
function parseId(raw: string | undefined): number | null {
  if (!raw || !/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

// Topes de longitud de campos de texto (defensa; el input ya limita en cliente).
const TITULO_MAX_LEN = 200;
const TEXT_MAX_LEN = 4000;
const LOCATION_MAX_LEN = 120;
const JORDI_NOMBRE_MAX_LEN = 80;
const JORDI_SUBTITULO_MAX_LEN = 120;
const JORDI_TEXTO_MAX_LEN = 4000;

// Color hex #rrggbb. Se valida server-side y el cliente sólo lo aplica vía
// style.backgroundColor tras revalidar (nunca se inyecta como HTML).
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

// Binding de rate limiting nativo (wrangler.toml [[unsafe.bindings]]).
interface RateLimit {
  limit(opts: { key: string }): Promise<{ success: boolean }>;
}

type Bindings = {
  DB: D1Database;
  STORAGE: R2Bucket;
  ASSETS: Fetcher;
  PASSWORD: string;
  AUTH_SECRET: string;
  WRITE_LIMITER: RateLimit;
};

const app = new Hono<{ Bindings: Bindings }>();

app.onError((err, c) => {
  console.error("worker error:", err?.message, err?.stack);
  return c.json({ error: "internal" }, 500);
});

// Cross-origin isolation (COOP/COEP) en TODA respuesta. Habilita
// SharedArrayBuffer (que ffmpeg.wasm multi-thread necesita para comprimir vídeo
// en cliente) desde el primer byte. Los medios de R2 van por /r2/* (same-origin)
// y las fuentes son self-hosted (public/fonts), así que require-corp no rompe
// ninguna subrequest. Las respuestas de ASSETS.fetch traen headers inmutables →
// si .set() lanza, reconstruimos la Response.
app.use("*", async (c, next) => {
  await next();
  try {
    c.res.headers.set("Cross-Origin-Opener-Policy", "same-origin");
    c.res.headers.set("Cross-Origin-Embedder-Policy", "require-corp");
  } catch {
    const headers = new Headers(c.res.headers);
    headers.set("Cross-Origin-Opener-Policy", "same-origin");
    headers.set("Cross-Origin-Embedder-Policy", "require-corp");
    c.res = new Response(c.res.body, {
      status: c.res.status,
      statusText: c.res.statusText,
      headers,
    });
  }
});

// CSRF: las escrituras exigen un header custom que un form HTML no puede poner,
// así un POST cross-site (aunque venga de un subdominio same-site vía fetch sin
// permiso CORS) no puede llegar a estos endpoints.
function requireCsrf() {
  return async (c: Context, next: Next) => {
    if (c.req.header("x-jordis-csrf") !== "1") {
      return c.json({ error: "csrf" }, 403);
    }
    await next();
  };
}

// Rate limit por IP (binding nativo). Fail-open a propósito (no bloqueamos por
// un fallo del limitador) pero logueado.
function rateLimit(pick: (env: Bindings) => RateLimit) {
  return async (c: Context<{ Bindings: Bindings }>, next: Next) => {
    try {
      const ip = c.req.header("cf-connecting-ip") || "local";
      const { success } = await pick(c.env).limit({ key: ip });
      if (!success) {
        return c.json({ error: "demasiadas peticiones, espera un momento" }, 429);
      }
    } catch (e) {
      console.error("rate limiter no disponible:", e);
    }
    await next();
  };
}

// ---------- auth ----------

// OJO: estos POST van a rutas /api/* a propósito. En producción, Cloudflare
// Assets intercepta los POST a rutas que coinciden con un archivo estático
// (/login ↔ public/login.html) y devuelve 405 ANTES de llegar al worker. Las
// rutas /api/* no tienen asset homónimo, así que el worker siempre las maneja.
// La PÁGINA de login se sigue sirviendo en GET /login (más abajo).
app.post("/api/login", async (c) => {
  const form = await c.req.parseBody();
  const pw = (form.password as string) || "";
  if (!c.env.PASSWORD || !timingSafeEqual(pw, c.env.PASSWORD)) {
    return c.redirect("/login?e=1");
  }
  await setAuthCookie(c, c.env.AUTH_SECRET);
  return c.redirect("/");
});

app.post("/api/logout", (c) => {
  clearAuthCookie(c);
  return c.redirect("/");
});

app.get("/api/me", async (c) => {
  return c.json({
    authed: await isAuthed(c),
    media: {
      image: maxBytesFor("image"),
      video: maxBytesFor("video"),
    },
  });
});

// ---------- API: reads (públicos) ----------

const POST_TYPES = new Set(["image", "video"]);
type PostType = "image" | "video";

app.get("/api/posts", async (c) => {
  const cursor = c.req.query("cursor") || undefined;
  const tag = c.req.query("tag") || undefined;
  const location = c.req.query("ubicacion") || undefined;
  const q = c.req.query("q") || undefined;
  const rawType = c.req.query("type");
  const type = rawType && POST_TYPES.has(rawType) ? (rawType as PostType) : undefined;
  const limitRaw = parseInt(c.req.query("limit") || "20");
  const limit = Number.isFinite(limitRaw) ? limitRaw : 20;
  const result = await listPosts(c.env.DB, { cursor, tag, location, q, type, limit });
  return c.json(result);
});

app.get("/api/posts/:id", async (c) => {
  const id = parseId(c.req.param("id"));
  if (id === null) return c.json({ error: "id invalido" }, 400);
  const post = await getPost(c.env.DB, id);
  if (!post) return c.json({ error: "no encontrado" }, 404);
  return c.json(post);
});

app.get("/api/hashtags", async (c) => {
  return c.json(await listHashtags(c.env.DB));
});

app.get("/api/jordis", async (c) => {
  return c.json(await listJordis(c.env.DB));
});

// ---------- API: posts (writes, gated) ----------

type MediaInput = {
  kind: "image" | "video";
  r2_key: string;
  thumb_key: string | null;
  width: number | null;
  height: number | null;
};

type PostBody = {
  titulo?: string | null;
  text?: string | null;
  location?: string | null;
  hashtags?: string | null;
  media?: Array<{
    kind: string;
    r2_key: string;
    thumb_key?: string | null;
    width?: number | null;
    height?: number | null;
  }>;
};

type PostValidation =
  | { ok: false; error: string; status: 400 }
  | {
      ok: true;
      titulo: string | null;
      text: string | null;
      location: string | null;
      tags: string[];
      media: MediaInput[];
    };

// Valida y sanea el body de un post. Los #tags salen del campo dedicado
// `hashtags` MÁS los embebidos en el título y en el cuerpo. Exportada para tests.
export function validatePostBody(body: PostBody): PostValidation {
  const titulo = (body.titulo ?? "").trim().slice(0, TITULO_MAX_LEN) || null;
  const text = (body.text ?? "").trim() || null;
  const location = (body.location ?? "").trim().slice(0, LOCATION_MAX_LEN) || null;
  const rawMedia = body.media ?? [];

  if (!titulo && !text && rawMedia.length === 0)
    return { ok: false, error: "post vacio", status: 400 };
  if (text && text.length > TEXT_MAX_LEN)
    return { ok: false, error: "texto demasiado largo", status: 400 };
  if (rawMedia.length > 12)
    return { ok: false, error: "demasiados adjuntos", status: 400 };

  const media: MediaInput[] = [];
  for (const m of rawMedia) {
    if (m.kind !== "image" && m.kind !== "video")
      return { ok: false, error: "kind de media invalido", status: 400 };
    if (typeof m.r2_key !== "string" || !m.r2_key)
      return { ok: false, error: "media sin r2_key", status: 400 };
    media.push({
      kind: m.kind,
      r2_key: m.r2_key,
      thumb_key: m.thumb_key ?? null,
      width: m.width ?? null,
      height: m.height ?? null,
    });
  }

  const tags = [
    ...new Set([
      ...parseHashtagsField(body.hashtags),
      ...extractHashtags(titulo),
      ...extractHashtags(text),
    ]),
  ];

  return { ok: true, titulo, text, location, tags, media };
}

app.post("/api/posts", requireAuth(), requireCsrf(), rateLimit((e) => e.WRITE_LIMITER), async (c) => {
  let body: PostBody;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "json invalido" }, 400);
  }
  const v = validatePostBody(body);
  if (!v.ok) return c.json({ error: v.error }, v.status);

  const post = await createPost(c.env.DB, v.titulo, v.text, v.location);
  await Promise.all([
    attachMedia(c.env.DB, post.id, v.media),
    setHashtags(c.env.DB, post.id, v.tags),
  ]);
  const full = await getPost(c.env.DB, post.id);
  return c.json(full, 201);
});

app.patch("/api/posts/:id", requireAuth(), requireCsrf(), rateLimit((e) => e.WRITE_LIMITER), async (c) => {
  const id = parseId(c.req.param("id"));
  if (id === null) return c.json({ error: "id invalido" }, 400);
  let body: PostBody;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "json invalido" }, 400);
  }
  const existing = await getPost(c.env.DB, id);
  if (!existing) return c.json({ error: "no encontrado" }, 404);

  // Si el body trae `media`, es el estado final deseado (quitar/añadir/orden);
  // si no lo trae, los adjuntos existentes se conservan tal cual.
  const mediaProvided = Array.isArray(body.media);
  const v = validatePostBody(mediaProvided ? body : { ...body, media: existing.media });
  if (!v.ok) return c.json({ error: v.error }, v.status);

  const updated = await updatePost(c.env.DB, id, {
    titulo: v.titulo,
    text: v.text,
    location: v.location,
  });
  if (!updated) return c.json({ error: "no encontrado" }, 404);
  if (mediaProvided) await replaceMedia(c.env.DB, id, v.media);
  await setHashtags(c.env.DB, id, v.tags);
  const full = await getPost(c.env.DB, id);
  return c.json(full);
});

app.delete("/api/posts/:id", requireAuth(), requireCsrf(), async (c) => {
  const id = parseId(c.req.param("id"));
  if (id === null) return c.json({ error: "id invalido" }, 400);
  const ok = await deletePost(c.env.DB, id);
  if (!ok) return c.json({ error: "no encontrado" }, 404);
  return c.json({ ok: true });
});

// ---------- API: jordis (writes, gated) ----------

type JordiBody = { nombre?: string; subtitulo?: string | null; color?: string; texto?: string | null };

function validateJordi(body: JordiBody):
  | { ok: false; error: string }
  | { ok: true; nombre: string; subtitulo: string | null; color: string; texto: string | null } {
  const nombre = String(body.nombre ?? "").trim().slice(0, JORDI_NOMBRE_MAX_LEN);
  if (!nombre) return { ok: false, error: "nombre vacio" };
  const subtitulo = String(body.subtitulo ?? "").trim().slice(0, JORDI_SUBTITULO_MAX_LEN) || null;
  const color = String(body.color ?? "").trim();
  if (!HEX_COLOR_RE.test(color)) return { ok: false, error: "color invalido (usa #rrggbb)" };
  const texto = String(body.texto ?? "").trim().slice(0, JORDI_TEXTO_MAX_LEN) || null;
  return { ok: true, nombre, subtitulo, color, texto };
}

app.post("/api/jordis", requireAuth(), requireCsrf(), rateLimit((e) => e.WRITE_LIMITER), async (c) => {
  let body: JordiBody;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "json invalido" }, 400);
  }
  const v = validateJordi(body);
  if (!v.ok) return c.json({ error: v.error }, 400);
  const jordi = await createJordi(c.env.DB, v.nombre, v.subtitulo, v.color, v.texto);
  return c.json(jordi, 201);
});

// Reordenar. IMPORTANTE: registrar esta ruta ANTES de /api/jordis/:id para que
// "order" no se interprete como un id.
app.patch("/api/jordis/order", requireAuth(), requireCsrf(), async (c) => {
  let body: { ids?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "json invalido" }, 400);
  }
  if (!Array.isArray(body.ids)) return c.json({ error: "ids invalido" }, 400);
  const ids: number[] = [];
  for (const raw of body.ids) {
    const n = Number(raw);
    if (!Number.isSafeInteger(n) || n <= 0) return c.json({ error: "id invalido" }, 400);
    ids.push(n);
  }
  await reorderJordis(c.env.DB, ids);
  return c.json({ ok: true, jordis: await listJordis(c.env.DB) });
});

app.patch("/api/jordis/:id", requireAuth(), requireCsrf(), rateLimit((e) => e.WRITE_LIMITER), async (c) => {
  const id = parseId(c.req.param("id"));
  if (id === null) return c.json({ error: "id invalido" }, 400);
  let body: JordiBody;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "json invalido" }, 400);
  }
  const v = validateJordi(body);
  if (!v.ok) return c.json({ error: v.error }, 400);
  const updated = await updateJordi(c.env.DB, id, {
    nombre: v.nombre,
    subtitulo: v.subtitulo,
    color: v.color,
    texto: v.texto,
  });
  if (!updated) return c.json({ error: "no encontrado" }, 404);
  return c.json(updated);
});

app.delete("/api/jordis/:id", requireAuth(), requireCsrf(), async (c) => {
  const id = parseId(c.req.param("id"));
  if (id === null) return c.json({ error: "id invalido" }, 400);
  const ok = await deleteJordi(c.env.DB, id);
  if (!ok) return c.json({ error: "no encontrado" }, 404);
  return c.json({ ok: true });
});

// ---------- API: upload ----------

app.post("/api/upload", requireAuth(), requireCsrf(), rateLimit((e) => e.WRITE_LIMITER), async (c) => {
  const ct = c.req.header("x-content-type") || c.req.header("content-type") || "";
  const folderHint = c.req.header("x-folder") as
    | "images"
    | "videos"
    | "thumbs"
    | undefined;
  const classified = classifyContentType(ct);
  if (!classified) return c.json({ error: "tipo no permitido" }, 400);

  const cap = maxBytesFor(classified.kind);
  const declared = parseInt(c.req.header("content-length") || "0");
  if (Number.isFinite(declared) && declared > cap) {
    return c.json({ error: "archivo demasiado grande" }, 413);
  }

  const body = await c.req.arrayBuffer();
  if (body.byteLength > cap) {
    return c.json({ error: "archivo demasiado grande" }, 413);
  }

  const folder: "images" | "videos" | "thumbs" =
    folderHint && ["images", "videos", "thumbs"].includes(folderHint)
      ? folderHint
      : classified.kind === "image"
        ? "images"
        : "videos";

  const key = buildMediaKey(folder, classified.ext);
  await c.env.STORAGE.put(key, body, {
    httpMetadata: { contentType: ct },
  });

  return c.json({ key, url: `/r2/${key}`, kind: classified.kind });
});

app.get("/api/export", requireAuth(), async (c) => {
  const dump = await exportAll(c.env.DB);
  return new Response(JSON.stringify(dump, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="jordis-export-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
});

// ---------- R2 serving (público) ----------

app.get("/r2/*", async (c) => {
  const key = c.req.path.replace(/^\/r2\//, "");
  const rangeHeader = c.req.header("range");
  const obj = await c.env.STORAGE.get(
    key,
    rangeHeader ? { range: c.req.raw.headers } : undefined,
  );
  if (!obj) return c.notFound();

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  headers.set("x-content-type-options", "nosniff");
  headers.set("accept-ranges", "bytes");

  if (rangeHeader && obj.range) {
    const r = obj.range as { offset?: number; length?: number; suffix?: number };
    const offset = r.suffix != null ? obj.size - r.suffix : r.offset ?? 0;
    const length = r.suffix != null ? r.suffix : r.length ?? obj.size - offset;
    headers.set("content-range", `bytes ${offset}-${offset + length - 1}/${obj.size}`);
    headers.set("content-length", String(length));
    return new Response(obj.body, { status: 206, headers });
  }

  headers.set("content-length", String(obj.size));
  return new Response(obj.body, { headers });
});

// ---------- HTML routes ----------

const htmlRoute = (file: string) => (c: Context<{ Bindings: Bindings }>) =>
  c.env.ASSETS.fetch(new Request(new URL(file, c.req.url)));

app.get("/", htmlRoute("/index.html"));
// GET /login sirve la página de entrada. Necesario porque el POST /login
// (formulario) registra la ruta y, sin este GET, un acceso por la URL limpia
// /login (Cloudflare Assets) devolvía 405. Sirve el asset login.html.
app.get("/login", htmlRoute("/login.html"));
app.get("/las-jordis", htmlRoute("/las-jordis.html"));
app.get("/escribir", requireAuth(), htmlRoute("/escribir.html"));
app.get("/editar", requireAuth(), htmlRoute("/editar.html"));

app.get("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
