// /app/visualizador-core.js
(function (global) {
  const $ = (root, sel) => root.querySelector(sel);

  async function fetchJSON(url) {
    const res = await fetch(`${url}?ts=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Error ${res.status} al cargar ${url}`);
    return res.json();
  }

  // Resolve a data path regardless of whether the current page is served from / or /htmls/
  function resolveDataPath(p){
    const rel = (p||'').replace(/^\/+/, ''); // strip leading slashes
    const underHtmls = location.pathname.includes('/htmls/');
    return (underHtmls ? '../' : './') + rel;
  }

  async function fetchText(u){
    const r = await fetch(u, { cache: 'no-store' });
    if (!r.ok) throw new Error(`Error ${r.status} al cargar ${u}`);
    return r.text();
  }

function extractContentFromHTML(html){
  // Use a real HTML parser so <html>/<body> are preserved reliably
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const pick = (sel) => doc.querySelector(sel)?.innerHTML;
  return (
    pick('#editor') ||
    pick('.box') ||
    pick('main') ||
    (doc.body ? doc.body.innerHTML : '') ||
    ''
  );
}

  const _meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

  function parseYMD(s){
    // expects YYYY-MM-DD
    const m = (s||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!m) return null;
    return { y: +m[1], mo: +m[2], d: +m[3] };
  }

  function bonGreetingFromTime(t){
    // t like "HH:MM:SS" or "HH:MM"
    const m = (t||'').match(/^(\d{2}):(\d{2})(?::\d{2})?$/);
    if(!m){ return 'bon dia'; }
    const H = +m[1], Mi = +m[2];
    const mins = H*60 + Mi;
    // Ranges:
    // bon dia:   05:00–11:59
    // bon migdia:12:00–15:59
    // bona tarda:16:00–19:59
    // bona nit:  20:00–04:59
    if (mins >= 5*60 && mins <= 11*60+59) return 'bon dia';
    if (mins >= 12*60 && mins <= 15*60+59) return 'bon migdia';
    if (mins >= 16*60 && mins <= 19*60+59) return 'bona tarda';
    return 'bona nit';
  }
  function fmtFechaBonita(yyyy_mm_dd){
    const m = (yyyy_mm_dd||'').match(/(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return (yyyy_mm_dd||'').trim();
    return `${parseInt(m[3],10)} de ${_meses[parseInt(m[2],10)-1]}`;
  }

  // Render por defecto: <li><a href="...">fecha [hora] — título</a></li>
  function defaultRenderItem(item) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    const p = item.path || item.file || '#';
    a.href = p ? resolveDataPath(p) : '#';
    a.textContent = [
      item.date || '',
      item.time ? item.time : '',
      item.title ? `— ${item.title}` : ''
    ].join(' ').replace(/\s+/g, ' ').trim();
    li.appendChild(a);
    return li;
  }

  // Opcional: render “bonito” para pensamientos si es audio
  function isAudio(item) {
    return /\.(mp3|m4a|ogg|wav|opus)$/i.test(item.path || item.file || '');
  }
  function pensamientosRenderItem(item) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    const p = item.path || item.file || '';
    a.href = p ? resolveDataPath(p) : '#';
    a.textContent = `${item.date || ''} ${item.time || ''}`;
    li.appendChild(a);
    return li;
  }
  function renderPensamientosGrouped(container, items){
    // items: normalized with .path .date (YYYY-MM-DD) .time (HH:MM:SS)
    // 1) group by month (YYYY-MM)
    const byMonth = new Map(); // key "YYYY-MM" => { y, mo, days: Map('DD' => [items]) }
    for (const it of items){
      const ymd = parseYMD(it.date || '');
      if (!ymd) continue;
      const key = `${ymd.y}-${String(ymd.mo).padStart(2,'0')}`;
      if (!byMonth.has(key)) {
        byMonth.set(key, { y: ymd.y, mo: ymd.mo, days: new Map() });
      }
      const month = byMonth.get(key);
      const dayKey = String(ymd.d).padStart(2,'0');
      if (!month.days.has(dayKey)) month.days.set(dayKey, []);
      month.days.get(dayKey).push(it);
    }

    // 2) order months DESC (newest month first)
    const months = Array.from(byMonth.values()).sort((a,b)=>{
      if (a.y !== b.y) return b.y - a.y;
      return b.mo - a.mo;
    });

    // 3) build DOM
    container.innerHTML = '';
    const audio = document.createElement('audio'); // singleton audio controller
    audio.preload = 'none';
    audio.style.display = 'none';
    container.appendChild(audio);

    let currentHref = null;

    function makeLink(it){
      const a = document.createElement('a');
      const href = resolveDataPath(it.path || '');
      const d = parseYMD(it.date || '');
      const greet = bonGreetingFromTime((it.time||'').slice(0,5));
      const dayNum = d ? d.d : '';
      a.href = href;
      a.className = 'pens-link';
      a.textContent = `${greet} ${dayNum} de ${_meses[(d?.mo||1)-1]}`;
      a.addEventListener('click', (ev)=>{
        ev.preventDefault();
        if (currentHref !== href){
          currentHref = href;
          audio.src = href;
          audio.currentTime = 0;
          audio.play().catch(()=>{ /* ignore */ });
        } else {
          if (audio.paused) {
            audio.play().catch(()=>{});
          } else {
            audio.pause();
          }
        }
      });
      return a;
    }

    for (const m of months){
      // header: "mes, año"
      const section = document.createElement('section');
      section.className = 'pens-mes';

      const h2 = document.createElement('h2');
      h2.textContent = `${_meses[m.mo-1]}, ${m.y}`;
      section.appendChild(h2);

      // order days DESC (newest day first)
      const days = Array.from(m.days.entries()).sort((a,b)=> parseInt(b[0],10) - parseInt(a[0],10));

      for (const [dayKey, arr] of days){
        // sort items for the day by time ASC (earliest -> latest)
        arr.sort((a,b)=> (a.time||'') < (b.time||'') ? -1 : ((a.time||'') > (b.time||'') ? 1 : 0));

        const row = document.createElement('div');
        row.className = 'pens-row';

        // Create links
        for (const it of arr){
          row.appendChild(makeLink(it));
        }

        section.appendChild(row);
      }

      container.appendChild(section);
    }
  }

  function diarioRenderItem(item){
    const wrap = document.createElement('div');
    wrap.className = 'diario-entrada';

    const h3 = document.createElement('h3');
    const bonito = fmtFechaBonita(item.date || '');
    h3.textContent = `${item.place || ''}, ${bonito}`.replace(/^,\s*/, '').trim();

    const body = document.createElement('div');
    body.className = 'diario-contenido';
    body.textContent = 'cargando...';

    const url = resolveDataPath(item.path || '');
    fetchText(url).then(html => {
      const inner = extractContentFromHTML(html);
      body.innerHTML = inner || '(vacío)';
    }).catch(() => { body.textContent = '(no se pudo cargar)'; });

    wrap.appendChild(h3);
    wrap.appendChild(body);
    return wrap;
  }

  function extrasRenderItem(item){
    const wrap = document.createElement('div');
    wrap.className = 'extras-item';

    const body = document.createElement('div');
    body.className = 'extras-contenido';
    body.textContent = 'cargando...';

    const url = resolveDataPath(item.path || '');
    fetchText(url).then(html => {
      const inner = extractContentFromHTML(html) || '';

      // Parse inner HTML to extract a title h1/h2/h3 if present
      const tmp = document.createElement('div');
      tmp.innerHTML = inner;

      const titleEl = tmp.querySelector('h1, h2, h3');
      const titleText = (titleEl ? titleEl.textContent : (item.titulo || '')).trim() || 'extra';
      if (titleEl) titleEl.remove(); // remove the in-body title to avoid duplication

      // Build headings: H3 (title) then H4 (date · tema)
      const h3 = document.createElement('h3');
      h3.textContent = titleText;

      const h4 = document.createElement('h4');
      const bonito = fmtFechaBonita(item.date || '');
      h4.textContent = [bonito, (item.tema || '').trim()].filter(Boolean).join(' · ');

      // Inject into wrapper in the requested order (h4 before h3)
      wrap.innerHTML = '';
      wrap.appendChild(h4);
      wrap.appendChild(h3);

      // Set cleaned content
      body.innerHTML = tmp.innerHTML || '(vacío)';
      wrap.appendChild(body);
    }).catch(() => {
      // On error, still show minimal header
      const h3 = document.createElement('h3');
      h3.textContent = (item.titulo || item.tema || 'extra').trim();
      const h4 = document.createElement('h4');
      const bonito = fmtFechaBonita(item.date || '');
      h4.textContent = [bonito, (item.tema || '').trim()].filter(Boolean).join(' · ');

      wrap.innerHTML = '';
      wrap.appendChild(h4);
      wrap.appendChild(h3);

      body.textContent = '(no se pudo cargar)';
      wrap.appendChild(body);
    });

    return wrap;
  }

  function librosRenderItem(item){
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = `./capitulo.html?src=${encodeURIComponent(item.path || '')}`;
    const h3 = document.createElement('h3');
    const left = [ item.libro || '', item.capitulo || '' ].filter(Boolean).join(' ').trim();
    const label = [ left, item.titulo || '' ].filter(Boolean).join(', ');
    h3.textContent = label || ((item.path||'').split('/').pop() || 'capítulo');
    a.appendChild(h3);
    li.appendChild(a);
    return li;
  }

  async function init(opts) {
    const {
      root = document,
      containerSel = '#lista',
      categoria,                  // 'diarios' | 'extras' | 'libros' | 'pensamientos'
      renderItem,                 // opcional: función de render por item
      emptyText = 'No hay entradas aún.',
      loadingText = 'Cargando…',
      errorText = 'No se pudo cargar el contenido.'
    } = opts || {};

    if (!categoria) throw new Error('visualizador-core: falta {categoria}');
    const cont = $(root, containerSel);
    if (!cont) throw new Error(`visualizador-core: no existe container ${containerSel}`);

    cont.innerHTML = `<li>cargando...</li>`;

    try {
      // Intentar raíz del sitio y, si falla (404), intentar ../data para páginas dentro de /htmls
      const candidateUrls = [
        `/data/${categoria}.json`,
        `../data/${categoria}.json`
      ];
      let data = [];
      let lastErr = null;
      for (const url of candidateUrls) {
        try {
          data = await fetchJSON(url);
          lastErr = null;
          console.info('visualizador-core: usando', url);
          break;
        } catch (e) {
          lastErr = e;
        }
      }
      if (lastErr) {
        console.warn('visualizador-core: no se encontró JSON para', categoria, '— mostrando lista vacía.');
        data = [];
      }

      let items = Array.isArray(data) ? data.slice() : [];

      // Normalización: asegurar .path
      items = items.map(it => ({
        ...it,
        path: it.path || it.file || it.href || ''
      }));

      // Orden: más nuevo primero. Si vienen con YYYY-MM-DD__HH-mm-ss en el nombre, basta con ordenar por path desc
      items.sort((a, b) => (a.path < b.path ? 1 : -1));

      // Pensamientos: render agrupado por mes y día, con enlaces que reproducen audio
      if (categoria === 'pensamientos' && !renderItem) {
        // Normalizar fecha/hora si faltan
        items = items.map(it => {
          const p = { ...it };
          // try to extract date/time from filename if missing
          if (!p.date) {
            const fn = (p.path||'').split('/').pop() || '';
            const m = fn.match(/(\d{4}-\d{2}-\d{2}).*?(\d{2}\.\d{2}\.\d{2}|\d{2}:\d{2}:\d{2})/);
            if (m){
              p.date = m[1];
              const t = m[2].replaceAll('.', ':');
              p.time = t.length === 5 ? `${t}:00` : t;
            }
          }
          if (p.time && /^\d{2}\.\d{2}\.\d{2}$/.test(p.time)) {
            p.time = p.time.replaceAll('.', ':');
          }
          return p;
        });
        // Crear un contenedor DIV para usar el renderer agrupado
        const parent = cont.parentElement;
        // Si el container actual es UL/OL y usaba LIs, lo vaciamos y tratamos como un div genérico
        cont.innerHTML = '';
        renderPensamientosGrouped(cont, items);
        return;
      }

      cont.innerHTML = '';
      if (!items.length) {
        console.info(`visualizador-core: categoría "${categoria}" sin entradas (0 items).`);
        cont.innerHTML = '';
        return;
      }

      const renderer =
        renderItem ||
        (categoria === 'pensamientos' ? pensamientosRenderItem :
         categoria === 'diario' ? diarioRenderItem :
         categoria === 'libros' ? librosRenderItem :
         categoria === 'extras' ? extrasRenderItem :
         defaultRenderItem);

      const frag = document.createDocumentFragment();
      for (const item of items) {
        try {
          frag.appendChild(renderer(item));
        } catch (e) {
          console.warn('Error renderizando item', item, e);
        }
      }
      cont.appendChild(frag);
    } catch (err) {
      console.error(err);
      cont.innerHTML = `<li>${errorText}</li>`;
    }
  }

  global.VisualizadorCore = { init };
})(window);

// ---- lector-core.js (capítulo individual) ----
(function (global) {
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

  function fmtFechaBonita(yyyy_mm_dd){
    const m = (yyyy_mm_dd||'').match(/(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return (yyyy_mm_dd||'').trim();
    const D = parseInt(m[3],10), Mo = parseInt(m[2],10)-1;
    return `${D} de ${meses[Mo]}`;
  }

  async function fetchText(u){ const r = await fetch(u, {cache:'no-store'}); if(!r.ok) throw new Error(`No se pudo cargar: ${u}`); return r.text(); }
  async function fetchJSON(u){ const r = await fetch(u, {cache:'no-store'}); if(!r.ok) throw new Error(`No se pudo cargar: ${u}`); return r.json(); }

  function resolveDataPath(p){
    const rel = (p||'').replace(/^\/+/, '');
    const underHtmls = location.pathname.includes('/htmls/');
    return (underHtmls ? '../' : './') + rel;
  }

  function samePath(a,b){
    const na = decodeURIComponent(a||'').replace(/^\.\/+/, '').replace(/^\/+/, '');
    const nb = decodeURIComponent(b||'').replace(/^\.\/+/, '').replace(/^\/+/, '');
    return na === nb;
  }

  function getMetaFromHTML(html, src){
    // Parse robustly with DOMParser to avoid losing <body> content
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // helpers
    const pickHTML = (sel) => doc.querySelector(sel)?.innerHTML || '';
    const pickText = (sel) => (doc.querySelector(sel)?.textContent || '').trim();

    // TITLE candidates (first match wins)
    const titulo =
      // explicit ids/data-attrs used by our editors
      pickText('#titulo') ||
      pickText('[data-titulo]') ||
      // common headings
      pickText('h1') ||
      // meta/title fallbacks
      (doc.querySelector('meta[name="titulo"]')?.getAttribute('content') || '').trim() ||
      (doc.querySelector('title')?.textContent || '').trim();

    // LIBRO / CAPITULO labels (optional)
    const libro =
      pickText('#libro') ||
      pickText('[data-libro]');

    const capitulo =
      pickText('#capitulo') ||
      pickText('[data-capitulo]');

    // FECHA: prefer DOM, else derive from filename
    let fecha = pickText('#fecha') || pickText('[data-fecha]');
    if (!fecha && src){
      const fn = src.split('/').pop() || '';
      // Extract YYYY-MM-DD optionally followed by -HH-MM(-SS)
      const m = fn.match(/(\d{4}-\d{2}-\d{2})(?:[-_]\d{2}-\d{2}(?:-\d{2})?)?/);
      if (m) fecha = m[1];
    }

    // CONTENT candidates in priority order
    const content =
      pickHTML('#editor') ||
      pickHTML('.box') ||
      pickHTML('article.cap-body') ||
      pickHTML('main') ||
      // finally, take the body innerHTML (safe because we parsed via DOMParser)
      (doc.body ? doc.body.innerHTML : '') ||
      '';

    return { libro, capitulo, titulo, fecha, content };
  }

  function $(sel){ return document.querySelector(sel); }

  // ---- helpers: orden de capítulos (ascendente) ----
  function _capNumValue(v){
    if (v == null) return null;
    const n = parseInt(String(v).replace(/[^\d-]/g, ''), 10);
    return Number.isNaN(n) ? null : n;
  }
  function _chapterKey(it){
    // 1) preferir número de capítulo si es numérico
    const n = _capNumValue(it.capitulo);
    if (n !== null) return { t:'num', v:n };
    // 2) intentar fecha en el path: YYYY-MM-DD(-HH-MM-SS opcional)
    const m = (it.path || '').match(/(\d{4})-(\d{2})-(\d{2})(?:[-_](\d{2})-(\d{2})(?:-(\d{2}))?)?/);
    if (m){
      const h = m[4] || '00', mi = m[5] || '00', s = m[6] || '00';
      const ts = Date.parse(`${m[1]}-${m[2]}-${m[3]}T${h}:${mi}:${s}Z`);
      if (!Number.isNaN(ts)) return { t:'date', v: ts };
    }
    // 3) fallback: string del path
    return { t:'str', v: (it.path || '') };
  }
  function _compareChaptersAsc(a,b){
    const ka = _chapterKey(a), kb = _chapterKey(b);
    if (ka.t === kb.t){
      if (ka.v < kb.v) return -1;
      if (ka.v > kb.v) return 1;
      return 0;
    }
    const prio = { num:0, date:1, str:2 };
    return (prio[ka.t] ?? 9) - (prio[kb.t] ?? 9);
  }

  async function render({ src, dataPath = '../data/libros.json' }){
    const html = await fetchText(resolveDataPath(src));
    const meta = getMetaFromHTML(html, src);

    // Cargar índice de libros para enriquecer título y navegación (solo lectura)
    const lista = await fetchJSON(dataPath);
    const me = lista.find(it => samePath(it.path, src));

    // Derivar campos finales preferentemente desde libros.json
    const libroName = (me?.libro || meta.libro || '').trim();
    const capNum    = (me?.capitulo || meta.capitulo || '').trim();
    const tituloCap = (me?.titulo || meta.titulo || '').trim();

    // Encabezado: "[libro], [capitulo]" si existen; si no, usar título o guion
    let capTitle = '';
    if (libroName || capNum) {
      capTitle = [libroName, capNum].filter(Boolean).join(', ');
    } else {
      capTitle = tituloCap || '—';
    }
    $('#capTitulo').textContent = capTitle;

    // Actualizar <title> del documento
    if (tituloCap || libroName) {
      document.title = libroName ? `${libroName} · ${tituloCap || (capNum ? ('cap. ' + capNum) : '')}` : `${tituloCap} — capítulo`;
    }

    // Cuerpo del capítulo
    $('#capBody').innerHTML = meta.content || '';

    // Ocultar fecha visual y contenedor meta
    const fechaEl = $('#capFecha');
    if (fechaEl) {
      fechaEl.textContent = '';
      const metaBox = fechaEl.closest('.meta');
      if (metaBox) metaBox.style.display = 'none';
    }

    // Calcular prev/next SIEMPRE por orden dentro del mismo libro (ignorar explícitos del JSON)
    let prev = null, next = null;
    if (me) {
      // clave de libro robusta: me.libro || libroName || prefijo del filename antes del primer "_"
      const libroKey =
        (me.libro || '').trim() ||
        (libroName || '').trim() ||
        (((me.path || '').split('/').pop() || '').split('_')[0]);

      const sameLibro = lista.filter(it => {
        const k = (it.libro || '').trim() || (((it.path || '').split('/').pop() || '').split('_')[0]);
        return k === libroKey;
      });

      const ordered = sameLibro.slice().sort(_compareChaptersAsc); // 1,2,3...
      const idx2 = ordered.findIndex(it => samePath(it.path, src));
      if (idx2 > 0) prev = ordered[idx2 - 1];
      if (idx2 >= 0 && idx2 < ordered.length - 1) next = ordered[idx2 + 1];
    }

    const nav = document.getElementById('navRight');
    if (nav) {
      nav.innerHTML = '';
      if (prev){
        const a=document.createElement('a');
        a.className='btn-prev';
        a.href=`./capitulo.html?src=${encodeURIComponent(prev.path)}`;
        a.textContent='anterior capítulo';
        nav.appendChild(a);
      }
      if (next){
        if (prev) nav.appendChild(document.createTextNode(' '));
        const a=document.createElement('a');
        a.className='btn-next';
        a.href=`./capitulo.html?src=${encodeURIComponent(next.path)}`;
        a.textContent='siguiente capítulo';
        nav.appendChild(a);
      }
    }
  }

  async function init(){
    const qs = new URLSearchParams(location.search);
    const rawSrc = qs.get('src') || '';
    const src = decodeURIComponent(rawSrc).replace(/^\.\/+/, '').replace(/^\/+/, './');

    if (!src){
      const body = document.getElementById('capBody') || document.body;
      body.textContent = 'Capítulo no encontrado.';
      return;
    }

    try{
      await render({ src });
      window.scrollTo({ top: 0, behavior: 'instant' });
    }catch(e){
      console.error(e);
      const body = document.getElementById('capBody') || document.body;
      body.textContent = 'Error cargando el capítulo.';
    }
  }

  global.LectorCore = { init };
})(window);