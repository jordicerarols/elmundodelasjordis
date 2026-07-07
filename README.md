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

- **`/`** — la home: título, lista de hashtags que filtran, y el feed con scroll
  infinito.
- **`/las-jordis`** — presentación: un cuadrado de color por "jordi".
- **`/escribir`** — (con contraseña) publicar: título, hashtags, contenido, lugar
  y fotos/vídeo.
- **`/editar`** — (con contraseña) editar las jordis: nombre, color, texto y añadir.
- **`/login.html`** — entrar con la contraseña de administradora.

Al entrar con la contraseña, la web muestra los controles de edición in situ
(enlaces a escribir/editar, y borrar/editar en cada publicación).

---

## Puesta en marcha (una sola vez, con Cloudflare)

Necesitas Node 18+ y la cuenta de Cloudflare de la clienta. Estos pasos se hacen
**una vez** desde tu ordenador (requieren `wrangler login` o el token, ver abajo).

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

> El feed **estrena vacío**: el contenido de la web antigua queda archivado en el
> repo viejo `jordis` y NO se migra.

---

## Deploy automático con GitHub Actions

Cada `push` a `main` despliega el Worker solo (workflow en
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)). Sólo hay que
darle un token de Cloudflare **una vez**.

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

   (Para el cambio de dominio del último paso hará falta añadir, sólo entonces:
   *Zone · Workers Routes · Edit* y *Zone · DNS · Edit* sobre la zona
   `elmundodelasjordis.com`.)
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

## Cambio de dominio final (último paso, manual y reversible)

Hoy `elmundodelasjordis.com` apunta a **GitHub Pages** (la web vieja), que se queda
como *fallback* durante la transición. Cuando la web nueva esté lista:

1. En [`wrangler.toml`](wrangler.toml), **descomenta** el bloque `routes` con
   `pattern = "elmundodelasjordis.com"` y haz `push` (o `npm run deploy`).
2. En el dashboard de Cloudflare: **Workers & Pages → jordis → Settings → Domains
   & Routes → Add → Custom domain →** `elmundodelasjordis.com`. Cloudflare crea el
   registro DNS que apunta al Worker.
3. Retira el apuntado a GitHub Pages (el registro DNS antiguo hacia
   `jordicerarols.github.io`).

**Para revertir:** quita el custom domain del Worker (o vuelve a comentar `routes`)
y restaura el DNS hacia GitHub Pages. La web vieja sigue intacta en su repo.

---

## Desarrollo local

`wrangler dev` no usa los `wrangler secret` (esos son de producción): lee un
archivo **`.dev.vars`** (gitignored). Créalo copiando el ejemplo:

```bash
cp .dev.vars.example .dev.vars     # y edita PASSWORD / AUTH_SECRET

npm run db:migrate                 # aplica schema.sql a la D1 LOCAL (.wrangler/)
npm run dev                        # http://localhost:8787
```

La D1 y el R2 locales viven en `.wrangler/` y se crean solos. El compresor de
vídeo (ffmpeg.wasm) necesita `SharedArrayBuffer`, que la web habilita con las
cabeceras COOP/COEP `require-corp` en cada respuesta (ya configurado en
`src/index.ts`); las fuentes van **self-hosted** en `public/fonts/` para no chocar
con esa política.

## Estructura

```
src/
  index.ts     rutas Hono: auth, posts CRUD, jordis CRUD, upload, /r2, export
  auth.ts      cookie de sesión firmada (HMAC) + requireAuth
  db.ts        queries D1 (posts, media, hashtags, jordis)
  media.ts     validación/clasificación de uploads (imagen + vídeo)
  hashtags.ts  extracción/normalización de #tags
public/
  index.html / las-jordis.html / escribir.html / editar.html / login.html
  style.css    estilos (un solo archivo) + fonts/ (woff2 self-hosted)
  js/          módulos ES: feed, render, composer, jordis-view, jordis-edit,
               api, auth, utils, state, y el pipeline de compresión reusado
               (compressor*, editor-geom) + glue de ffmpeg (ffmpeg.js, 814.ffmpeg.js)
schema.sql     esquema único (tablas + seed de las 4 jordis)
```

El motor se adaptó de [`twoitter`](https://github.com/meowrhino) (mismo autor):
se reutilizó auth, posts, hashtags, subida de media y compresión de vídeo, y se
quitaron encuestas, notas de voz/transcripción y geolocalización.
