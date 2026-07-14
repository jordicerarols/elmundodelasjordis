-- ============================================================================
-- Migración PUNTUAL (run once) — añade la columna `subtitulo` a `jordis`.
--
-- ✅ ESTADO: aplicada en la D1 de PRODUCCIÓN el 14 jul 2026 (desde la consola
--    del dashboard de Cloudflare; sólo el ALTER — los UPDATE de abajo no se
--    ejecutaron porque los valores se pusieron a mano desde /editar). Se
--    conserva por si hay que reconstruir una base con el esquema viejo.
--
-- Contexto: al principio cada jordi guardaba la faceta (emoción, comunicación…)
-- en `nombre`. Ahora `nombre` es el nombre propio (jordi/jordy/yordy/iordi) y la
-- faceta vive en `subtitulo`. Las bases NUEVAS ya nacen bien desde schema.sql;
-- este archivo sólo sirve para actualizar una D1 que YA tenía el esquema viejo.
--
-- ⚠️ NO es idempotente: el ALTER falla ("duplicate column name: subtitulo") si
--    ya se aplicó. Ejecútalo UNA sola vez por base de datos.
--
--   npm run db:migrate:subtitulo:remote      (D1 de producción)
--   npm run db:migrate:subtitulo             (D1 local, normalmente innecesario)
--
-- ¿Ya está aplicada? Compruébalo con:
--   npx wrangler d1 execute jordis-db --remote --command "PRAGMA table_info(jordis);"
--   (si aparece la columna `subtitulo`, no vuelvas a ejecutar esta migración).
-- ============================================================================

-- 1) Nueva columna.
ALTER TABLE jordis ADD COLUMN subtitulo TEXT;

-- 2) La faceta que vivía en `nombre` pasa a `subtitulo`, y `nombre` toma el
--    nombre propio de cada jordi. Se casa por el nombre de faceta (no por orden)
--    para ser robusto ante reordenaciones. En un mismo UPDATE, el lado derecho
--    (`subtitulo = nombre`) usa el valor ANTIGUO de la fila, así que copia bien.
UPDATE jordis SET subtitulo = nombre, nombre = 'jordi' WHERE nombre = 'emoción';
UPDATE jordis SET subtitulo = nombre, nombre = 'jordy' WHERE nombre = 'comunicación';
UPDATE jordis SET subtitulo = nombre, nombre = 'yordy' WHERE nombre = 'estética';
UPDATE jordis SET subtitulo = nombre, nombre = 'iordi' WHERE nombre = 'espiritualidad';
