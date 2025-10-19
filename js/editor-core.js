(function () {
  'use strict';

  // ——— Utils ———
  const two = n => String(n).padStart(2,'0');
  const text = (root, sel) => (root.querySelector(sel)?.textContent || '').trim();
  const setText = (el, v, aria) => { el.textContent = v; if (aria) el.setAttribute('aria-label', aria + ' ' + v); };
  const sanitize = s => (s || '').trim().replace(/\s+/g,'_');

  const isValidDateYMD = s => /^(\d{4})-(\d{2})-(\d{2})$/.test(s) && ( ()=>{
    const [y,m,d]=s.split('-').map(Number); const t=new Date(Date.UTC(y,m-1,d));
    return t.getUTCFullYear()===y && (t.getUTCMonth()+1)===m && t.getUTCDate()===d;
  })();
  const isValidTimeHM = s => /^(\d{2}):(\d{2})$/.test(s) && ( ()=>{
    const [h,m]=s.split(':').map(Number); return h>=0&&h<24&&m>=0&&m<60;
  })();

  // ——— Core DOM helpers ———
  const closestElement = (root,node,pred)=>{ let el = node && (node.nodeType===1 ? node : node.parentElement); while (el && el !== root) { if (pred(el)) return el; el = el.parentElement; } return null; };
  const unwrapElement = el => { const p=el.parentNode; while(el.firstChild) p.insertBefore(el.firstChild,el); p.removeChild(el); };
  const elementsInRange = (root,range,pred)=>{ const out=[]; const w=document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, { acceptNode(n){ return pred(n)&&range.intersectsNode(n)?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_SKIP; } }); let n; while((n=w.nextNode())) out.push(n); return out; };
  const getValidRange = (root)=>{ const sel=window.getSelection(); if(!sel||sel.rangeCount===0) return null; const r=sel.getRangeAt(0); if(r.collapsed) return null; if(!root.contains(r.commonAncestorContainer)) return null; return r; };

  // ——— Formatting actions ———
  function toggleInlineTag(root, tagName){
    const range=getValidRange(root); if(!range) return false;
    const isTag=el=>el && el.tagName && el.tagName.toLowerCase()===tagName.toLowerCase();
    let hits = elementsInRange(root, range, isTag);
    const sWrap=closestElement(root,range.startContainer,isTag), eWrap=closestElement(root,range.endContainer,isTag);
    if (sWrap) hits.push(sWrap); if (eWrap) hits.push(eWrap);
    hits = Array.from(new Set(hits)).sort((a,b)=>{ const depth=x=>{let d=0; while(x&&x!==root){d++; x=x.parentElement;} return d;}; return depth(b)-depth(a); });
    if (hits.length){ hits.forEach(unwrapElement); return true; }
    const w=document.createElement(tagName);
    try { range.surroundContents(w); }
    catch { const frag=range.extractContents(); w.appendChild(frag); range.insertNode(w); }
    return true;
  }

  function applyColor(root, colorName){
    const range=getValidRange(root); if(!range) return false;
    const targetCls='c-'+colorName;
    const isColor=el=>el.tagName && el.tagName.toLowerCase()==='span' && /\bc-\w+\b/.test(el.className);
    let spans=elementsInRange(root,range,isColor);
    const s=closestElement(root,range.startContainer,isColor), e=closestElement(root,range.endContainer,isColor);
    if (s) spans.push(s); if (e) spans.push(e); spans=Array.from(new Set(spans));

    const onlyTarget = spans.length>0 && spans.every(sp=>sp.classList.contains(targetCls));
    if (onlyTarget){ spans.forEach(sp=>{ sp.classList.remove(targetCls); if(!/\bc-\w+\b/.test(sp.className)) unwrapElement(sp); }); return true; }
    if (spans.length){ spans.forEach(sp=>{ sp.className = sp.className.replace(/\bc-\w+\b/g,'').trim(); sp.classList.add(targetCls); }); return true; }

    const w=document.createElement('span'); w.className=targetCls;
    try { range.surroundContents(w); }
    catch { const frag=range.extractContents(); w.appendChild(frag); range.insertNode(w); }
    return true;
  }

  function applyLink(root, href){
    const range=getValidRange(root); if(!range) return false;
    const a=document.createElement('a'); a.href=href; a.target='_blank'; a.rel='noopener';
    try { range.surroundContents(a); }
    catch { const frag=range.extractContents(); a.appendChild(frag); range.insertNode(a); }
    return true;
  }

  // ——— Meta fields (placeholders + pickers) ———
  function initFields(root, fields){
    if (!fields) return;
    Object.entries(fields).forEach(([id, cfg])=>{
      const el = root.querySelector('#'+id); if(!el) return;
      if (cfg.default && !el.textContent.trim()) el.textContent = cfg.default;
      if (cfg.picker==='date'){
        const input = root.querySelector('#'+cfg.inputId);
        const set   = v=> setText(el, v, id);
        el.setAttribute('role','button'); el.setAttribute('tabindex','0');
        el.addEventListener('click',()=> (input.showPicker?input.showPicker():input.click()));
        el.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); (input.showPicker?input.showPicker():input.click()); }});
        input.addEventListener('input',()=>{ if(isValidDateYMD(input.value)) set(input.value); });
        if (!el.textContent.trim()){ const now=new Date(); const v=`${now.getFullYear()}-${two(now.getMonth()+1)}-${two(now.getDate())}`; input && (input.value=v); set(v); }
      }
      if (cfg.picker==='time'){
        const input = root.querySelector('#'+cfg.inputId);
        const set   = v=> setText(el, v, id);
        el.setAttribute('role','button'); el.setAttribute('tabindex','0');
        el.addEventListener('click',()=> (input.showPicker?input.showPicker():input.click()));
        el.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); (input.showPicker?input.showPicker():input.click()); }});
        input.addEventListener('input',()=>{ if(isValidTimeHM(input.value)) set(input.value); });
        if (!el.textContent.trim()){ const now=new Date(); const v=`${two(now.getHours())}:${two(now.getMinutes())}`; input && (input.value=v); set(v); }
      }
    });
  }

  // ——— Atomic getters for filename pieces ———
  const atoms = {
    getLugar:  root => sanitize( text(root,'#lugar') || 'sin-lugar' ),
    getFecha:  root => text(root,'#fecha'),
    getFechaRequired(root){ const f = text(root,'#fecha'); if(!isValidDateYMD(f)){ alert('Revisa “fecha” (YYYY-MM-DD)'); throw new Error('fecha requerida'); } return f; },
    getHoraOrNow(root){ let h = text(root,'#hora'); if(!isValidTimeHM(h)){ const now=new Date(); h=`${two(now.getHours())}:${two(now.getMinutes())}`; const el=root.querySelector('#hora'); if(el) setText(el,h,'hora'); const inp=root.querySelector('#horaPicker'); if(inp) inp.value=h; } return h; },
    getTitulo: root => text(root,'#titulo'),
    getCap:    root => sanitize( text(root,'#capitulo') || 'capitulo' ),
    getLibro:  root => sanitize( text(root,'#libro')    || 'libro' ),
    getTematica: root => sanitize( text(root,'#tematica') || 'tematica' ),
  };

  // ——— Filename builders per editor type ———
  const nameBuilders = {
    diario(root){ const fecha = atoms.getFechaRequired(root); const hora = atoms.getHoraOrNow(root); const [hh,mm]=hora.split(':'); const lugar=atoms.getLugar(root); return `${fecha}_${hh}-${mm}_${lugar}.html`; },
    capitulos(root){ const fecha = atoms.getFechaRequired(root); const hora = atoms.getHoraOrNow(root); const [hh,mm]=hora.split(':'); const libro=atoms.getLibro(root); const cap=atoms.getCap(root); return `${libro}_${cap}_${fecha}-${hh}-${mm}.html`; },
    extras(root){
      const fecha = atoms.getFechaRequired(root);          // YYYY-MM-DD
      const tematica = atoms.getTematica(root);            // “tematica” saneada
      // Formato pedido: "extra"[tematica][fecha] (sin hora)
      return `extra_${tematica}_${fecha}.html`;
    }
  };

  // ——— Payload builders per editor type ———
  const payloadBuilders = {
    diario(root, editorSel){ const ed=root.querySelector(editorSel); return (ed?.innerHTML || '').trim(); },
    capitulos(root, editorSel){ const ed=root.querySelector(editorSel); const titulo = atoms.getTitulo(root); const body = (ed?.innerHTML || '').trim(); return `<h3>${titulo||''}</h3>\n${body}`; },
    extras(root, editorSel){ 
      const ed = root.querySelector(editorSel); 
      const titulo = atoms.getTitulo(root); 
      const body = (ed?.innerHTML || '').trim(); 
      return `<h3>${titulo||''}</h3>\n${body}`; 
    }
  };

  // ——— Download ———
  function download({root, editorSel, name, payload}){
    const blob = new Blob([payload], {type:'text/html'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  // ——— Init ———
  function init(config){
    const root = config.root || document;
    const editor = root.querySelector(config.editor);

    // Toolbar (data-driven)
    root.querySelectorAll(config.toolbarBtnSel).forEach(btn=>{
      btn.addEventListener('mousedown', e=>e.preventDefault());
      btn.addEventListener('click', ()=>{
        const tag = btn.getAttribute('data-tag');
        const col = btn.getAttribute('data-color');
        const act = btn.getAttribute('data-action');
        if (tag){ if(!toggleInlineTag(editor, tag)) alert('no hay texto seleccionado'); return; }
        if (col){ if(!applyColor(editor, col)) alert('no hay texto seleccionado'); return; }
        if (act==='link'){
          const href = prompt('Pega el enlace (https://…)');
          if (!href) return; if(!applyLink(editor, href)) alert('no hay texto seleccionado'); return;
        }
      });
    });

    // Meta fields
    initFields(root, config.fields);

    // Download: use provided builders or auto by data-editor
    const editorType = document.body.dataset.editor || 'diario';
    const buildName   = config.filenameFn || nameBuilders[editorType] || nameBuilders.diario;
    const buildPayload= config.payloadFn  || payloadBuilders[editorType]|| payloadBuilders.diario;

    if (config.downloadBtn){
      const btn = root.querySelector(config.downloadBtn);
      btn && btn.addEventListener('click', (e)=>{
        e.preventDefault();
        let name, payload;
        try { name = buildName(root); } catch(err){ return; }
        payload = buildPayload(root, config.editor);
        download({root, editorSel: config.editor, name, payload});
      });
    }

    return { toggle: t=>toggleInlineTag(editor,t), color: c=>applyColor(editor,c), link: h=>applyLink(editor,h), atoms };
  }

  window.SimpleEditor = { init, utils:{ two, isValidDateYMD, isValidTimeHM, sanitize }, atoms };
})();
