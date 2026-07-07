-- ============================================================================
-- jordis — schema (D1 / SQLite). Repo nuevo → una sola fuente de verdad, sin
-- carpeta migrations/. Se aplica entero con:
--   npm run db:migrate          (D1 LOCAL, en .wrangler/)
--   npm run db:migrate:remote   (D1 de producción)
-- Todo es CREATE ... IF NOT EXISTS + INSERT idempotente, así que re-aplicarlo
-- es seguro.
-- ============================================================================

-- Posts del feed. Sin hilos/replies (jordis es un feed plano), sin encuestas,
-- sin coordenadas. `titulo` es el título opcional del post; `text` el cuerpo;
-- `location` la etiqueta de "lugar" (texto libre, se muestra tal cual).
CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titulo TEXT,
    text TEXT,
    location TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    -- Soft delete: NULL = visible; ISO timestamp = en papelera. Los assets de
    -- R2 se conservan para poder restaurar. Se filtra en listPosts/getPost.
    deleted_at TEXT,
    -- edited_at: NULL = nunca editado; ISO timestamp de la última edición.
    edited_at TEXT
);

CREATE TABLE IF NOT EXISTS media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    -- kind: 'image' | 'video'. TEXT libre (sin CHECK) para no migrar si se
    -- añaden tipos en el futuro.
    kind TEXT NOT NULL,
    r2_key TEXT NOT NULL,
    thumb_key TEXT,
    width INTEGER,
    height INTEGER,
    position INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS hashtags (
    post_id INTEGER NOT NULL,
    tag TEXT NOT NULL,
    PRIMARY KEY (post_id, tag),
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
);

-- Las "jordis": las facetas que presenta la web. Cada una tiene un nombre, un
-- color (hex #rrggbb, se pinta como cuadrado), un texto de presentación y un
-- orden. CRUD protegido por contraseña desde la página "editar las jordis".
CREATE TABLE IF NOT EXISTS jordis (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    color TEXT NOT NULL,
    texto TEXT,
    orden INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_posts_deleted ON posts(deleted_at);
CREATE INDEX IF NOT EXISTS idx_media_post ON media(post_id, position);
CREATE INDEX IF NOT EXISTS idx_hashtags_tag ON hashtags(tag);
CREATE INDEX IF NOT EXISTS idx_jordis_orden ON jordis(orden, id);

-- Seed de las 4 jordis iniciales. Colores pastel tomados del mockup
-- `las jordis nuevo.png`. Idempotente: sólo siembra si la tabla está vacía
-- (el WHERE NOT EXISTS evita duplicar en re-aplicaciones del schema).
INSERT INTO jordis (nombre, color, texto, orden)
SELECT 'emoción', '#7fd4ff', '', 0
WHERE NOT EXISTS (SELECT 1 FROM jordis);
INSERT INTO jordis (nombre, color, texto, orden)
SELECT 'comunicación', '#f9a8d4', '', 1
WHERE (SELECT COUNT(*) FROM jordis) = 1;
INSERT INTO jordis (nombre, color, texto, orden)
SELECT 'estética', '#86efac', '', 2
WHERE (SELECT COUNT(*) FROM jordis) = 2;
INSERT INTO jordis (nombre, color, texto, orden)
SELECT 'espiritualidad', '#fde047', '', 3
WHERE (SELECT COUNT(*) FROM jordis) = 3;
