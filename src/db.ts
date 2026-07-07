// ---------- tipos ----------

export interface MediaRow {
  id: number;
  post_id: number;
  kind: "image" | "video";
  r2_key: string;
  thumb_key: string | null;
  width: number | null;
  height: number | null;
  position: number;
}

export interface PostRow {
  id: number;
  titulo: string | null;
  text: string | null;
  created_at: string;
  deleted_at?: string | null;
  // Etiqueta de "lugar" (texto libre). Se muestra tal cual, sin geocoding.
  location?: string | null;
  edited_at?: string | null;
}

export interface Post extends PostRow {
  media: MediaRow[];
  hashtags: string[];
}

export interface JordiRow {
  id: number;
  nombre: string;
  subtitulo: string | null;
  color: string;
  texto: string | null;
  orden: number;
  created_at: string;
}

// D1 limita los parámetros vinculados por query (~100). Cualquier lista de IDs
// en un `IN (?,?,…)` hay que trocearla por debajo de ese tope.
const D1_MAX_BIND = 90;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function selectByIds<T>(
  db: D1Database,
  ids: number[],
  sqlFor: (placeholders: string) => string,
): Promise<T[]> {
  if (ids.length === 0) return [];
  const batches = chunk(ids, D1_MAX_BIND);
  const res = await Promise.all(
    batches.map((b) =>
      db
        .prepare(sqlFor(b.map(() => "?").join(",")))
        .bind(...b)
        .all<T>(),
    ),
  );
  return res.flatMap((r) => r.results);
}

// Carga en bloque (1 query por relación, troceada por lotes) media + hashtags
// de cada post.
async function attachMediaAndTags(
  db: D1Database,
  posts: PostRow[],
): Promise<Post[]> {
  if (posts.length === 0) return [];
  const ids = posts.map((p) => p.id);

  const [mediaRows, tagRows] = await Promise.all([
    selectByIds<MediaRow>(
      db,
      ids,
      (ph) => `SELECT * FROM media WHERE post_id IN (${ph}) ORDER BY post_id, position`,
    ),
    selectByIds<{ post_id: number; tag: string }>(
      db,
      ids,
      (ph) => `SELECT post_id, tag FROM hashtags WHERE post_id IN (${ph})`,
    ),
  ]);

  const mediaByPost = new Map<number, MediaRow[]>();
  for (const m of mediaRows) {
    const arr = mediaByPost.get(m.post_id) || [];
    arr.push(m);
    mediaByPost.set(m.post_id, arr);
  }
  const tagsByPost = new Map<number, string[]>();
  for (const t of tagRows) {
    const arr = tagsByPost.get(t.post_id) || [];
    arr.push(t.tag);
    tagsByPost.set(t.post_id, arr);
  }

  return posts.map((p) => ({
    ...p,
    media: mediaByPost.get(p.id) || [],
    hashtags: tagsByPost.get(p.id) || [],
  }));
}

// ---------- posts ----------

export async function listPosts(
  db: D1Database,
  opts: {
    cursor?: string;
    tag?: string;
    location?: string;
    q?: string;
    type?: "image" | "video";
    limit: number;
  },
): Promise<{ posts: Post[]; nextCursor: string | null }> {
  const limit = Math.min(100, Math.max(1, opts.limit));
  const conds: string[] = ["p.deleted_at IS NULL"];
  const args: unknown[] = [];

  if (opts.tag) {
    conds.push(
      "EXISTS (SELECT 1 FROM hashtags h WHERE h.post_id = p.id AND h.tag = ?)",
    );
    args.push(opts.tag.toLowerCase());
  }
  if (opts.location) {
    // Coincidencia exacta con la etiqueta de lugar (se muestra tal cual, así que
    // se filtra tal cual). Cap defensivo por si llega un valor enorme.
    conds.push("p.location = ?");
    args.push(opts.location.slice(0, 120));
  }
  if (opts.type === "image" || opts.type === "video") {
    conds.push("EXISTS (SELECT 1 FROM media m WHERE m.post_id = p.id AND m.kind = ?)");
    args.push(opts.type);
  }
  if (opts.q) {
    // Cap defensivo: truncar a 200 (no descartar el filtro). Escapar wildcards.
    const escaped = opts.q.slice(0, 200).replace(/[\\%_]/g, "\\$&");
    const pattern = `%${escaped}%`;
    conds.push("(p.titulo LIKE ? ESCAPE '\\' OR p.text LIKE ? ESCAPE '\\')");
    args.push(pattern, pattern);
  }
  if (opts.cursor) {
    // cursor codifica (created_at|id) para desempatar posts del mismo segundo.
    const [cAt, cIdStr] = opts.cursor.split("|");
    const cId = parseInt(cIdStr || "0");
    if (cAt && Number.isFinite(cId)) {
      conds.push("(p.created_at < ? OR (p.created_at = ? AND p.id < ?))");
      args.push(cAt, cAt, cId);
    }
  }

  const sql = `SELECT p.* FROM posts p WHERE ${conds.join(" AND ")} ORDER BY p.created_at DESC, p.id DESC LIMIT ?`;
  args.push(limit + 1);

  const res = await db.prepare(sql).bind(...args).all<PostRow>();
  const rows = res.results;
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  if (page.length === 0) return { posts: [], nextCursor: null };

  const posts = await attachMediaAndTags(db, page);
  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? `${last.created_at}|${last.id}` : null;
  return { posts, nextCursor };
}

export async function getPost(
  db: D1Database,
  id: number,
): Promise<Post | null> {
  const row = await db
    .prepare("SELECT * FROM posts WHERE id = ? AND deleted_at IS NULL")
    .bind(id)
    .first<PostRow>();
  if (!row) return null;
  const [withExtras] = await attachMediaAndTags(db, [row]);
  return withExtras;
}

export async function createPost(
  db: D1Database,
  titulo: string | null,
  text: string | null,
  location: string | null = null,
): Promise<PostRow> {
  const row = await db
    .prepare(
      "INSERT INTO posts (titulo, text, location, created_at) VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now')) RETURNING *",
    )
    .bind(titulo, text, location)
    .first<PostRow>();
  return row!;
}

// Actualiza título/texto/lugar de un post y sella edited_at. false si no existe
// o está borrado.
export async function updatePost(
  db: D1Database,
  id: number,
  fields: { titulo: string | null; text: string | null; location: string | null },
): Promise<boolean> {
  const res = await db
    .prepare(
      "UPDATE posts SET titulo = ?, text = ?, location = ?, edited_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(fields.titulo, fields.text, fields.location, id)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

export async function attachMedia(
  db: D1Database,
  postId: number,
  items: Array<{
    kind: "image" | "video";
    r2_key: string;
    thumb_key: string | null;
    width: number | null;
    height: number | null;
  }>,
) {
  if (items.length === 0) return;
  const stmt = db.prepare(
    "INSERT INTO media (post_id, kind, r2_key, thumb_key, width, height, position) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  await db.batch(
    items.map((m, i) =>
      stmt.bind(postId, m.kind, m.r2_key, m.thumb_key, m.width, m.height, i),
    ),
  );
}

// Soft delete: marca deleted_at pero conserva los assets de R2 (recuperable).
export async function deletePost(
  db: D1Database,
  id: number,
): Promise<boolean> {
  const res = await db
    .prepare(
      "UPDATE posts SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(id)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

export async function listHashtags(
  db: D1Database,
): Promise<Array<{ tag: string; count: number }>> {
  const res = await db
    .prepare(
      `SELECT h.tag, COUNT(*) as count
         FROM hashtags h JOIN posts p ON p.id = h.post_id
         WHERE p.deleted_at IS NULL
         GROUP BY h.tag ORDER BY count DESC, h.tag ASC`,
    )
    .all<{ tag: string; count: number }>();
  return res.results;
}

// ---------- jordis ----------

export async function listJordis(db: D1Database): Promise<JordiRow[]> {
  const res = await db
    .prepare("SELECT * FROM jordis ORDER BY orden ASC, id ASC")
    .all<JordiRow>();
  return res.results;
}

export async function createJordi(
  db: D1Database,
  nombre: string,
  subtitulo: string | null,
  color: string,
  texto: string | null,
): Promise<JordiRow> {
  // Nuevo jordi va al final: orden = max(orden)+1.
  const max = await db
    .prepare("SELECT COALESCE(MAX(orden), -1) AS m FROM jordis")
    .first<{ m: number }>();
  const orden = (max?.m ?? -1) + 1;
  const row = await db
    .prepare(
      "INSERT INTO jordis (nombre, subtitulo, color, texto, orden) VALUES (?, ?, ?, ?, ?) RETURNING *",
    )
    .bind(nombre, subtitulo, color, texto, orden)
    .first<JordiRow>();
  return row!;
}

export async function updateJordi(
  db: D1Database,
  id: number,
  fields: { nombre: string; subtitulo: string | null; color: string; texto: string | null },
): Promise<JordiRow | null> {
  const row = await db
    .prepare(
      "UPDATE jordis SET nombre = ?, subtitulo = ?, color = ?, texto = ? WHERE id = ? RETURNING *",
    )
    .bind(fields.nombre, fields.subtitulo, fields.color, fields.texto, id)
    .first<JordiRow>();
  return row ?? null;
}

export async function deleteJordi(db: D1Database, id: number): Promise<boolean> {
  const res = await db.prepare("DELETE FROM jordis WHERE id = ?").bind(id).run();
  return (res.meta?.changes ?? 0) > 0;
}

// Reordena: recibe el orden deseado de ids y reasigna `orden` = índice.
export async function reorderJordis(
  db: D1Database,
  ids: number[],
): Promise<void> {
  if (ids.length === 0) return;
  const stmt = db.prepare("UPDATE jordis SET orden = ? WHERE id = ?");
  await db.batch(ids.map((id, i) => stmt.bind(i, id)));
}

// ---------- export ----------

export async function exportAll(db: D1Database) {
  const [posts, media, hashtags, jordis] = await Promise.all([
    db.prepare("SELECT * FROM posts WHERE deleted_at IS NULL ORDER BY id").all(),
    db
      .prepare(
        "SELECT * FROM media WHERE post_id IN (SELECT id FROM posts WHERE deleted_at IS NULL) ORDER BY post_id, position",
      )
      .all(),
    db
      .prepare(
        "SELECT * FROM hashtags WHERE post_id IN (SELECT id FROM posts WHERE deleted_at IS NULL) ORDER BY post_id, tag",
      )
      .all(),
    db.prepare("SELECT * FROM jordis ORDER BY orden, id").all(),
  ]);
  return {
    exported_at: new Date().toISOString(),
    posts: posts.results,
    media: media.results,
    hashtags: hashtags.results,
    jordis: jordis.results,
  };
}
