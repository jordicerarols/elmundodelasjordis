# el mundo de las jordis

Web dinámica de [elmundodelasjordis.com](https://elmundodelasjordis.com): un feed
tipo micro-blog con hashtags, fotos y vídeo, más una página "las jordis" editable.
Una sola administradora, protegida por contraseña.

**Stack:** Cloudflare Workers + Hono + D1 (SQLite) + R2 (media). El vídeo se
comprime en el navegador con ffmpeg.wasm antes de subirse.

- Frontend estático en `public/` (HTML + módulos ES, sin build step).
- Backend (rutas API, auth, upload) en `src/` (TypeScript, Hono).
- Base de datos: esquema único en [`schema.sql`](schema.sql).

## Cómo funciona

- **`/`** — la home: título a la izquierda con la lista de hashtags (en fila,
  filtran el feed), y el feed a la derecha con scroll infinito. Cada post lleva
  lugar y fecha arriba a la derecha; el lugar también filtra.
- **`/las-jordis`** — presentación: un círculo de color por "jordi" con su nombre
  dentro. Al activar uno, el fondo toma su color, su subtítulo sustituye al
  titular y su texto aparece entre los círculos y "casa".
- **`/escribir`** — (con contraseña) publicar: título, hashtags, contenido, lugar
  y fotos/vídeo.
- **`/editar`** — (con contraseña) editar las jordis: nombre (el del círculo),
  subtítulo (el titular al activar), color y texto; y añadir jordis nuevas.
- **`/login`** — entrar con la contraseña de administradora.

Al entrar con la contraseña, la web muestra los controles de edición in situ
(enlaces a escribir/editar, y borrar/editar en cada publicación).

**Backup:** `/api/export` (logueada) descarga un JSON con todo el contenido
(posts, media, hashtags y jordis).

---

## Puesta en marcha (una sola vez, con Cloudflare)

Necesitas **Node 22+** (wrangler 4.x lo exige) y la cuenta de Cloudflare de la
clienta. Estos pasos se hacen **una vez** desde tu ordenador (requieren
`wrangler login` o el token, ver abajo).

```bash
npm install

# 1) Crear la base de datos D1 e IMPRIMIR su id
npm run db:create
#   → copia el "database_id" que imprime y pégalo en wrangler.toml
#     (línea database_id = "…").

# 2) Aplicar el esquema (crea tablas + siembra las 4 jordis)
npm run db:migrate:remote

# 3) Crear el bucket de media R2
npm run r2:create

# 4) Definir los secretos de producción
npx wrangler secret put PASSWORD      # la contraseña de administradora
npx wrangler secret put AUTH_SECRET   # un string largo aleatorio (firma la sesión)

# 5) Primer deploy manual (comprueba que todo va)
npm run deploy
```

### Migraciones de esquema

`schema.sql` es la fuente de verdad y es seguro re-aplicarlo (`CREATE ... IF NOT
EXISTS` + seeds guardados). Pero SQLite no tiene `ALTER TABLE` idempotente, así
que **añadir columnas a tablas ya existentes** va en archivos aparte `migrate-*.sql`
de **una sola ejecución**. Base nueva → sólo `db:migrate:remote`, no necesitas nada más.

- **`subtitulo` en `jordis`** — ✅ ya aplicada en producción (14 jul 2026, desde
  la consola D1 del dashboard). Sólo haría falta re-ejecutarla sobre una base
  vieja reconstruida; comprueba con `PRAGMA table_info(jordis)`.

> Ojo: la D1 remota vive en la cuenta de la clienta, y el token local puede no
> tener permisos (`error 7403`). En ese caso las migraciones remotas se ejecutan
> desde el navegador: dashboard → Storage & Databases → D1 → `jordis-db` → Console.

---

## Deploy automático con GitHub Actions

Cada `push` a `main` despliega el Worker solo (workflow en
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)). Sólo hay que
darle un token de Cloudflare **una vez**.

Dos detalles del workflow que NO hay que perder (aprendidos a las malas):

- **`wranglerVersion` fijado**: sin él, la action usa su wrangler embebido
  (3.90.0), que ignora `assets.run_worker_first` → los assets se sirven SIN
  pasar por el worker (sin cabeceras COOP/COEP → el compresor de vídeo muere,
  y `/escribir`/`/editar` quedan sin puerta de login). Mantenerlo en línea con
  la versión de `package-lock.json`.
- **Node 22** en `setup-node`: wrangler 4.x no arranca con Node 20.

### Crear el `CLOUDFLARE_API_TOKEN` (pensado para hacerlo con la clienta delante)

1. En el dashboard de Cloudflare de la clienta: arriba a la derecha, **My Profile
   → API Tokens → Create Token → Custom token → Get started**.
2. Ponle un nombre (p.ej. `github-deploy-jordis`) y estos **permisos**:

   | Tipo | Recurso | Nivel |
   |------|---------|-------|
   | Account | Workers Scripts | Edit |
   | Account | D1 | Edit |
   | Account | Workers R2 Storage | Edit |
   | Account | Account Settings | Read |

3. En **Account Resources** elige la cuenta de la clienta. **Continue to summary →
   Create Token**. Copia el token (se muestra una sola vez).
4. En GitHub, en el repo (`github.com/jordicerarols/…`): **Settings → Secrets and
   variables → Actions → New repository secret**. Nombre exacto:
   `CLOUDFLARE_API_TOKEN`. Pega el token.

A partir de ahí, cada push a `main` despliega automáticamente. También se puede
lanzar a mano desde la pestaña **Actions → deploy → Run workflow**.

> Los secretos `PASSWORD` y `AUTH_SECRET` NO van en GitHub: viven en Cloudflare
> (paso 4 de la puesta en marcha, `wrangler secret put`). El token de Actions sólo
> despliega el código.

---

## Dominio

El Worker sirve `elmundodelasjordis.com` y `www` como **custom domains**
(bloque `routes` de [`wrangler.toml`](wrangler.toml)); el cutover desde GitHub
Pages se ejecutó el 7 jul 2026 y la web vieja sigue intacta en su repo.

**Para revertir:** quita el custom domain del Worker (dashboard → Workers →
jordis → Settings → Domains & Routes, o comenta `routes` y push) y restaura el
DNS hacia `jordicerarols.github.io`.

---

## Desarrollo local

`wrangler dev` no usa los `wrangler secret` (esos son de producción): lee un
archivo **`.dev.vars`** (gitignored). Créalo copiando el ejemplo:

```bash
cp .dev.vars.example .dev.vars     # y edita PASSWORD / AUTH_SECRET

npm run db:migrate                 # aplica schema.sql a la D1 LOCAL (.wrangler/)
npm run dev                        # http://localhost:8787
npm test                           # tests unitarios (vitest) — también corren en CI
```

La D1 y el R2 locales viven en `.wrangler/` y se crean solos. El compresor de
vídeo (ffmpeg.wasm) necesita `SharedArrayBuffer`, que la web habilita con las
cabeceras COOP/COEP `require-corp` en cada respuesta (middleware en
`src/index.ts`); las fuentes van **self-hosted** en `public/fonts/` para no
chocar con esa política, y el runtime UMD de ffmpeg (`public/ffmpeg.js` + su
worker `814.ffmpeg.js`) también, porque su worker debe ser same-origin.

## Estructura

```
src/
  index.ts     rutas Hono: auth, posts CRUD, jordis CRUD, upload, /r2, export
               + middleware COOP/COEP (cross-origin isolation para ffmpeg.wasm)
  auth.ts      cookie de sesión firmada (HMAC) + requireAuth
  db.ts        queries D1 (posts, media, hashtags, jordis)
  media.ts     validación/clasificación de uploads (imagen + vídeo)
  hashtags.ts  extracción/normalización de #tags
public/
  index.html / las-jordis.html / escribir.html / editar.html / login.html
  style.css    estilos (un solo archivo) + fonts/ (woff2 self-hosted)
  ffmpeg.js    runtime UMD de @ffmpeg/ffmpeg (self-hosted) + 814.ffmpeg.js (su worker)
  js/
    page-welcome.js  entry de la home (filtros + tinte de fondo)
    feed.js          fetch paginado + scroll infinito
    render.js        tarjeta de post (título, lugar·fecha, media, tags)
    composer.js      página escribir (adjuntos + submit)
    jordis-view.js   página las jordis (círculos + activación)
    jordis-edit.js   página editar las jordis (CRUD)
    compressor*.js   compresión cliente (imagen → WebP wasm; vídeo → VP8 ffmpeg.wasm)
    editor-geom.js   helpers matemáticos puros de la compresión
    api.js / auth.js / state.js / utils.js
test/          tests unitarios (vitest) de las funciones puras: compresor de
               vídeo (args de ffmpeg, "gana el más pequeño"), hashtags, auth
               (token HMAC) y validación de posts
schema.sql     esquema único (tablas + seed de las 4 jordis)
migrate-*.sql  migraciones puntuales (run once) para D1 ya existentes
```

El motor se adaptó de [`twoitter`](https://github.com/meowrhino) (mismo autor):
se reutilizó auth, posts, hashtags, subida de media y compresión de vídeo, y se
quitaron encuestas, notas de voz/transcripción, geolocalización y el editor de
recorte/trim de medios.
