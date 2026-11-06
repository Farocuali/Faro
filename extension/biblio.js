// FARO · Captura — pestaña Bibliografía
// Misma lógica que «Recomendar bibliografía» de FARO web (Gemini + búsqueda de Google, mismo prompt),
// más dos agregados propios de la extensión: buscar desde un fragmento capturado y contrastar
// cada obra recomendada con CrossRef.

(() => {
  const CLAVE_CFG = 'cfg:gemini';
  const CLAVE_HIST = 'biblio:historial';
  const MODELO_DEFECTO = 'gemini-2.5-flash';
  const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
  const MAX_HIST = 10;
  const MAX_VERIFICAR = 8;

  const { t } = FaroI18n;
  const $ = (id) => document.getElementById(id);
  const ui = {
    config: $('b-config'), clave: $('b-clave'), modelo: $('b-modelo'),
    guardarConfig: $('b-guardar-config'), configEstado: $('b-config-estado'),
    origen: $('b-origen'), origenFuente: $('b-origen-fuente'),
    consulta: $('b-consulta'), web: $('b-web'),
    buscar: $('b-buscar'), detener: $('b-detener'),
    cargando: $('b-cargando'), aviso: $('b-aviso'),
    resultado: $('b-resultado'), salida: $('b-salida'), leyenda: $('b-leyenda'),
    fuentesCaja: $('b-fuentes-caja'), fuentes: $('b-fuentes'),
    sugCaja: $('b-sugerencias-caja'), sug: $('b-sugerencias'),
    copiar: $('b-copiar'), histCaja: $('b-historial-caja'), hist: $('b-historial')
  };

  let cfg = { clave: '', modelo: MODELO_DEFECTO };
  let claveFaro = '';       // la clave de Gemini que ya cargaste en FARO completo (si está guardada sin cifrar)
  const claveActiva = () => cfg.clave || claveFaro;
  let historial = [];
  let actual = null;           // resultado mostrado
  let abortoBusqueda = null;
  let abortoVerif = null;

  // ---------- Utilidades ----------

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  const urlSegura = (u) => (/^https?:\/\//i.test(String(u || '').trim()) ? String(u).trim() : null);

  const recortar = (s, n) => (s.length > n ? s.slice(0, n).trimEnd() + '…' : s);

  function normalizar(s) {
    return String(s || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  // ---------- Markdown mínimo y seguro (escapa todo antes de dar formato) ----------

  function enLinea(texto) {
    let h = esc(texto);
    h = h.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, u) => {
      const ok = urlSegura(u.replace(/&amp;/g, '&'));
      return ok ? `<a href="${esc(ok)}" target="_blank" rel="noopener noreferrer">${t}</a>` : t;
    });
    h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    h = h.replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<em>$2</em>');
    return h;
  }

  // Detecta «**Autor/a (Año).** *Título*» (formato pedido en el prompt) para poder verificarlo.
  function datosReferencia(contenido) {
    const m = contenido.match(/^\*\*(.+?)\*\*[.,:\s]*\*([^*]+)\*/);
    if (!m) return null;
    const autor = m[1].replace(/\(([^)]*)\)\.?\s*$/, '').replace(/[.\s]+$/, '').trim();
    const titulo = m[2].replace(/[.\s]+$/, '').trim();
    return titulo.length >= 4 ? { autor, titulo } : null;
  }

  function renderMd(md) {
    const lineas = String(md || '').replace(/\r\n/g, '\n').split('\n');
    const out = [];
    let enLista = false;
    let anteriorVacia = true;

    const cerrarLista = () => { if (enLista) { out.push('</li></ul>'); enLista = false; } };

    for (const linea of lineas) {
      const vacia = !linea.trim();
      if (vacia) { anteriorVacia = true; continue; }

      const titulo = linea.match(/^\s*#{1,6}\s+(.*)$/);
      const tituloNegrita = linea.match(/^\s*\*\*([^*]+)\*\*:?\s*$/);
      const vineta = linea.match(/^\s*(?:[-•]|\*(?=\s)|\d+[.)])\s+(.*)$/);
      const sangrada = /^\s{2,}\S/.test(linea);

      if (titulo || (tituloNegrita && !vineta)) {
        cerrarLista();
        out.push(`<h3>${enLinea((titulo || tituloNegrita)[1])}</h3>`);
      } else if (vineta) {
        if (enLista) out.push('</li>'); else { out.push('<ul>'); enLista = true; }
        const ref = datosReferencia(vineta[1]);
        const attrs = ref ? ` data-autor="${esc(ref.autor)}" data-titulo="${esc(ref.titulo)}"` : '';
        out.push(`<li${attrs}><span class="ref">${enLinea(vineta[1])}</span>`);
      } else if (enLista && (sangrada || !anteriorVacia)) {
        out.push(`<br>${enLinea(linea.trim())}`);
      } else {
        cerrarLista();
        out.push(`<p>${enLinea(linea.trim())}</p>`);
      }
      anteriorVacia = false;
    }
    cerrarLista();
    return out.join('');
  }

  // ---------- Gemini ----------

  function diagnostico(status, cuerpo) {
    const msg = String(cuerpo?.error?.message || '').toLowerCase();
    if (status === 0) return { titulo: t('Sin conexión'), detalle: t('No pude conectarme con Gemini. Revisá tu conexión y reintentá.') };
    if (status === 400 && (msg.includes('api key') || msg.includes('api_key')))
      return { titulo: t('La clave no es válida'), detalle: t('Revisá la clave en «Configuración de Gemini». Tiene que empezar con AIza.') };
    if (status === 400 && msg.includes('search'))
      return { titulo: t('Este modelo no acepta búsqueda web'), detalle: t('Cambiá a gemini-2.5-flash o gemini-2.5-flash-lite, o apagá «Buscar en la web».') };
    if (status === 403) return { titulo: t('La clave no tiene permiso'), detalle: t('Puede que la API de Gemini no esté habilitada para esa clave. Generá una nueva en aistudio.google.com/apikey.') };
    if (status === 404) return { titulo: t('No encontré ese modelo'), detalle: t('Revisá el nombre del modelo en la configuración (por ejemplo, {m}).', { m: MODELO_DEFECTO }) };
    if (status === 429) return { titulo: t('Llegaste al tope de consultas'), detalle: t('Esperá un minuto. Si pasa seguido, usá gemini-2.5-flash-lite, que tiene más cupo gratuito.') };
    if (status >= 500) return { titulo: t('Error en los servidores de Google'), detalle: t('Esperá unos minutos y reintentá.') };
    return { titulo: t('Error inesperado'), detalle: cuerpo?.error?.message || t('Código {n}', { n: status }) };
  }

  const BLOQUEOS = ['SAFETY', 'RECITATION', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII'];

  async function llamarGemini({ system, user, web, signal }) {
    const url = `${GEMINI_BASE}/${encodeURIComponent(cfg.modelo)}:generateContent`;
    const body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { maxOutputTokens: 8000, temperature: 0.4, topP: 0.95 }
    };
    if (web) body.tools = [{ google_search: {} }];

    let res;
    for (let intento = 0; ; intento++) {
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': claveActiva() },
          body: JSON.stringify(body),
          referrerPolicy: 'no-referrer',
          signal
        });
      } catch (e) {
        if (e.name === 'AbortError') throw e;
        throw diagnostico(0, {});
      }
      if ((res.status === 429 || res.status === 503) && intento < 2) {
        await new Promise((ok) => setTimeout(ok, 1000 * 2 ** intento));
        continue;
      }
      break;
    }

    let datos = {};
    try { datos = await res.json(); } catch { /* cuerpo vacío */ }
    if (!res.ok) throw diagnostico(res.status, datos);

    if (datos.promptFeedback?.blockReason)
      throw { titulo: t('Google bloqueó el pedido'), detalle: t('Motivo: {m}. Probá reformular el tema.', { m: datos.promptFeedback.blockReason }) };
    const cand = datos.candidates?.[0];
    if (BLOQUEOS.includes(cand?.finishReason))
      throw { titulo: t('Google bloqueó la respuesta'), detalle: t('Motivo: {m}. Probá reformular el tema.', { m: cand.finishReason }) };

    let texto = (cand?.content?.parts || []).map((p) => p.text || '').join('').trim();
    if (!texto) throw { titulo: t('Respuesta vacía'), detalle: t('Gemini no devolvió texto. Reintentá o cambiá de modelo.') };
    if (cand?.finishReason === 'MAX_TOKENS') texto += '\n\n*[' + t('Respuesta cortada por límite de longitud') + ']*';

    const meta = cand?.groundingMetadata;
    const vistos = new Set();
    const fuentes = (meta?.groundingChunks || [])
      .map((ch) => ch.web || ch.retrievedContext)
      .filter((w) => w && w.uri && !vistos.has(w.uri) && vistos.add(w.uri))
      .map((w) => ({ titulo: w.title || w.uri, uri: w.uri }));
    const sugerencia = meta?.searchEntryPoint?.renderedContent || '';

    return { texto, fuentes, sugerencia };
  }

  // ---------- CrossRef ----------

  function coincideTitulo(nuestro, suyo) {
    const a = normalizar(nuestro);
    const b = normalizar(suyo);
    if (!a || !b) return false;
    if (a === b) return true;
    const [corto, largo] = a.length <= b.length ? [a, b] : [b, a];
    if (corto.length >= 15 && largo.startsWith(corto)) return true; // con o sin subtítulo
    const ta = new Set(a.split(' ')), tb = new Set(b.split(' '));
    const inter = [...ta].filter((t) => tb.has(t)).length;
    return inter / new Set([...ta, ...tb]).size >= 0.85;
  }

  function primerApellido(autor) {
    const primero = String(autor || '').split(/;| y | & | and /i)[0].trim();
    if (!primero) return '';
    const base = primero.includes(',') ? primero.split(',')[0] : primero.split(/\s+/).pop();
    return normalizar(base);
  }

  async function buscarEnCrossref(ref, signal) {
    const q = `${ref.titulo} ${ref.autor}`.trim();
    const url = `https://api.crossref.org/works?rows=5&select=DOI,title,subtitle,author&query.bibliographic=${encodeURIComponent(q)}`;
    const tiempo = AbortSignal.timeout(10000);
    const res = await fetch(url, { signal: AbortSignal.any ? AbortSignal.any([signal, tiempo]) : signal, referrerPolicy: 'no-referrer' });
    if (!res.ok) throw new Error(`CrossRef ${res.status}`);
    const datos = await res.json();
    const apellido = primerApellido(ref.autor);
    for (const it of datos?.message?.items || []) {
      const t = (it.title || [])[0] || '';
      const st = (it.subtitle || [])[0] || '';
      const tituloOk = coincideTitulo(ref.titulo, t)
        || (st && coincideTitulo(ref.titulo, `${t} ${st}`))
        || coincideTitulo(ref.titulo.split(':')[0], t);
      if (!tituloOk) continue;
      const autores = (it.author || []).map((a) => normalizar(a.family || a.name || ''));
      const autorOk = !apellido || autores.length === 0
        || autores.some((f) => f && (f.includes(apellido) || apellido.includes(f)));
      if (autorOk) return it.DOI;
    }
    return null;
  }

  function insignia(li, clase, html) {
    let s = li.querySelector(':scope > .ref > .verif');
    if (!s) {
      s = document.createElement('span');
      li.querySelector(':scope > .ref').append(s);
    }
    s.className = `verif ${clase}`;
    s.innerHTML = html;
  }

  async function verificar() {
    if (abortoVerif) abortoVerif.abort();
    abortoVerif = new AbortController();
    const signal = abortoVerif.signal;
    const items = [...ui.salida.querySelectorAll('li[data-titulo]')].slice(0, MAX_VERIFICAR);
    ui.leyenda.hidden = items.length === 0;
    for (const li of items) insignia(li, 'verif-pend', t('verificando…'));
    for (const li of items) {
      if (signal.aborted) return;
      try {
        const doi = await buscarEnCrossref({ titulo: li.dataset.titulo, autor: li.dataset.autor }, signal);
        if (signal.aborted) return;
        if (doi) {
          const href = esc(`https://doi.org/${doi}`);
          insignia(li, 'verif-ok', `<a href="${href}" target="_blank" rel="noopener noreferrer" title="${esc(doi)}">✓ CrossRef</a>`);
        } else {
          insignia(li, 'verif-no', t('sin coincidencia en CrossRef'));
        }
      } catch (e) {
        if (signal.aborted) return;
        insignia(li, 'verif-no', t('CrossRef no respondió'));
      }
    }
  }

  // ---------- Pantalla ----------

  function mostrarAviso(a) {
    if (!a) { ui.aviso.hidden = true; ui.aviso.replaceChildren(); return; }
    const t = document.createElement('strong');
    t.textContent = a.titulo;
    ui.aviso.replaceChildren(t, document.createTextNode(a.detalle || ''));
    ui.aviso.hidden = false;
  }

  function montarSugerencia(html) {
    ui.sug.replaceChildren();
    ui.sugCaja.hidden = !html;
    if (!html) return;
    // HTML de Google sin modificar (lo exigen sus términos), aislado en un iframe sin scripts.
    const f = document.createElement('iframe');
    f.setAttribute('sandbox', 'allow-popups allow-popups-to-escape-sandbox');
    f.setAttribute('referrerpolicy', 'no-referrer');
    f.title = t('Sugerencias de búsqueda de Google');
    f.style.cssText = 'width:100%;height:84px;border:0;display:block;background:transparent';
    f.srcdoc = '<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><base target="_blank"></head><body style="margin:0">' + html + '</body></html>';
    ui.sug.append(f);
  }

  function avisoDeResultado(r) {
    if (r.web && r.fuentes.length === 0) {
      return {
        titulo: t('No se pudo confirmar la búsqueda web'),
        detalle: t('Esta respuesta no trae fuentes, así que probablemente salió de memoria y puede contener datos inventados. Reintentá con un tema más específico o verificá cada referencia antes de usarla.')
      };
    }
    if (!r.web) {
      return {
        titulo: t('Búsqueda web desactivada'),
        detalle: t('Esta respuesta es de memoria y puede inventar referencias. Verificá cada obra antes de citarla.')
      };
    }
    return null;
  }

  function mostrarResultado(r) {
    actual = r;
    ui.salida.innerHTML = renderMd(r.texto);
    ui.fuentes.replaceChildren(...r.fuentes.map((f) => {
      const li = document.createElement('li');
      const ok = urlSegura(f.uri);
      const el = document.createElement(ok ? 'a' : 'span');
      if (ok) { el.href = ok; el.target = '_blank'; el.rel = 'noopener noreferrer'; }
      el.textContent = f.titulo;
      li.append(el);
      return li;
    }));
    ui.fuentesCaja.hidden = r.fuentes.length === 0;
    montarSugerencia(r.web ? r.sugerencia : '');
    mostrarAviso(avisoDeResultado(r));
    ui.resultado.hidden = false;
    verificar();
  }

  function renderHistorial() {
    ui.histCaja.hidden = historial.length === 0;
    ui.hist.replaceChildren(...historial.map((h) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.id = h.id;
      b.textContent = `${new Date(h.fecha).toLocaleDateString(FaroI18n.locale)} · ${recortar(h.consulta.replace(/\s+/g, ' '), 90)}`;
      b.title = h.consulta;
      li.append(b);
      return li;
    }));
  }

  function setCargando(si) {
    ui.cargando.hidden = !si;
    ui.buscar.disabled = si;
    ui.detener.hidden = !si;
  }

  // ---------- Acciones ----------

  async function buscar() {
    const consulta = ui.consulta.value.trim();
    if (!consulta) { ui.consulta.focus(); mostrarAviso({ titulo: t('Falta el tema'), detalle: t('Describí sobre qué querés bibliografía.') }); return; }
    if (!claveActiva()) {
      ui.config.open = true;
      ui.clave.focus();
      mostrarAviso({ titulo: t('Falta la clave de Gemini'), detalle: t('Pegala en «Configuración de Gemini» y tocá Guardar.') });
      return;
    }

    if (abortoBusqueda) abortoBusqueda.abort();
    if (abortoVerif) abortoVerif.abort();
    abortoBusqueda = new AbortController();
    const web = ui.web.checked;

    mostrarAviso(null);
    ui.resultado.hidden = true;
    setCargando(true);

    // Mismo prompt que FARO web, en el idioma de la interfaz.
    const P = FaroI18n.es
      ? { sys: RECOMENDAR_SYSTEM_ES, web: RECOMENDAR_GROUNDING_ES, user: `Buscá en internet trabajos académicos reales sobre: ${consulta}.\nVerificá con la búsqueda que cada obra existe (autor/a, año, título, editorial o revista) antes de incluirla, y citá las fuentes.` }
      : { sys: RECOMENDAR_SYSTEM_EN, web: RECOMENDAR_GROUNDING_EN, user: `Search the internet for real academic works on: ${consulta}.\nVerify with the search that each work exists (author, year, title, publisher or journal) before including it, and cite the sources.` };
    const system = P.sys + (web ? P.web : '');
    const user = web ? P.user : consulta;

    try {
      const r = await llamarGemini({ system, user, web, signal: abortoBusqueda.signal });
      const entrada = { id: crypto.randomUUID(), consulta, web, fecha: new Date().toISOString(), ...r };
      mostrarResultado(entrada);
      historial = [entrada, ...historial].slice(0, MAX_HIST);
      renderHistorial();
      chrome.storage.local.set({ [CLAVE_HIST]: historial });
    } catch (e) {
      if (e?.name === 'AbortError') mostrarAviso({ titulo: t('Búsqueda detenida'), detalle: '' });
      else mostrarAviso(e?.titulo ? e : { titulo: 'Error', detalle: String(e) });
    } finally {
      setCargando(false);
      abortoBusqueda = null;
    }
  }

  ui.buscar.addEventListener('click', buscar);
  ui.consulta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); buscar(); }
  });
  ui.consulta.addEventListener('input', () => { if (!ui.consulta.value.trim()) ui.origen.hidden = true; });
  ui.detener.addEventListener('click', () => { if (abortoBusqueda) abortoBusqueda.abort(); });

  ui.guardarConfig.addEventListener('click', async () => {
    cfg = { clave: ui.clave.value.trim(), modelo: ui.modelo.value.trim() || MODELO_DEFECTO };
    ui.modelo.value = cfg.modelo;
    await chrome.storage.local.set({ [CLAVE_CFG]: cfg });
    ui.configEstado.textContent = cfg.clave ? t('Guardado.') : t('Guardado (sin clave).');
    if (cfg.clave) { ui.config.open = false; mostrarAviso(null); }
  });

  ui.hist.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-id]');
    const h = b && historial.find((x) => x.id === b.dataset.id);
    if (!h) return;
    ui.consulta.value = h.consulta;
    ui.web.checked = h.web;
    ui.origen.hidden = true;
    mostrarResultado(h);
    ui.resultado.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  ui.copiar.addEventListener('click', async () => {
    if (!actual) return;
    const fuentes = actual.fuentes.length
      ? '\n\n' + t('Fuentes consultadas:') + '\n' + actual.fuentes.map((f, i) => `[${i + 1}] ${f.titulo} — ${f.uri}`).join('\n')
      : '';
    try {
      await navigator.clipboard.writeText(actual.texto + fuentes);
      ui.copiar.textContent = t('Copiado ✓');
    } catch {
      ui.copiar.textContent = t('No se pudo copiar');
    }
    setTimeout(() => { ui.copiar.textContent = t('Copiar resultado'); }, 1500);
  });

  // Viene de «Buscar bibliografía sobre este fragmento» en la pestaña Fragmentos.
  document.addEventListener('faro:biblio-desde-fragmento', (e) => {
    const c = e.detail;
    const codigos = c.codigos?.length ? t(' (códigos: {c})', { c: c.codigos.join(', ') }) : '';
    ui.consulta.value = t('Bibliografía para analizar este fragmento{c}:', { c: codigos }) + `\n\n«${recortar(c.texto, 1500)}»`;
    let fuente = c.titulo;
    if (!fuente) { try { fuente = new URL(c.url).hostname; } catch { fuente = t('una página'); } }
    ui.origenFuente.textContent = fuente;
    ui.origen.title = c.url || '';
    ui.origen.hidden = false;
    mostrarAviso(null);
    ui.consulta.focus();
    ui.consulta.setSelectionRange(0, 0);
  });

  // ---------- Inicio ----------

  (async () => {
    const datos = await chrome.storage.local.get([CLAVE_CFG, CLAVE_HIST]);
    cfg = { clave: '', modelo: MODELO_DEFECTO, ...(datos[CLAVE_CFG] || {}) };
    historial = Array.isArray(datos[CLAVE_HIST]) ? datos[CLAVE_HIST] : [];
    ui.clave.value = cfg.clave;
    ui.modelo.value = cfg.modelo;
    try {
      if (typeof FaroOps !== 'undefined') {
        const kv = await FaroOps.leerKV(['apiKey', 'keyMode', 'model']);
        if ((kv.keyMode || 'plain') === 'plain' && kv.apiKey) {
          claveFaro = kv.apiKey;
          if (!datos[CLAVE_CFG]?.modelo && kv.model) { cfg.modelo = kv.model; ui.modelo.value = kv.model; }
          ui.configEstado.textContent = cfg.clave ? '' : t('Usando la clave de Gemini que cargaste en FARO.');
        }
      }
    } catch { /* FARO todavía no se abrió */ }
    ui.config.open = !claveActiva();
    renderHistorial();
  })();

  // Para pruebas
  window.__faroBiblio = { renderMd, coincideTitulo, primerApellido, datosReferencia };
})();
