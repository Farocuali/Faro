const { JSDOM } = require('jsdom');
const { RAIZ, ok: okU } = require('./util');
console.log('panel lateral · bibliografía');
const fs = require('fs');
const dir = RAIZ + '/';
const wait = (ms) => new Promise(r => setTimeout(r, ms));

const store = {}; const listeners = [];
const storage = { local: {
  async get(k) { if (k === null) return structuredClone(store); const ks=[].concat(k); const o={}; for (const x of ks) if (x in store) o[x]=structuredClone(store[x]); return o; },
  async set(o) { const ch = {}; for (const [k,v] of Object.entries(o)) { ch[k] = { oldValue: store[k], newValue: structuredClone(v) }; store[k] = structuredClone(v); } setTimeout(() => listeners.forEach(f => f(ch, 'local'))); },
  async remove(ks) { ks = [].concat(ks); const ch = {}; for (const k of ks) { ch[k] = { oldValue: store[k] }; delete store[k]; } setTimeout(() => listeners.forEach(f => f(ch, 'local'))); }
}, onChanged: { addListener: f => listeners.push(f) } };

const GEMINI_TXT = `### OBRAS FUNDAMENTALES

- **Escobar, A. (2014).** *Sentipensar con la tierra: nuevas lecturas sobre desarrollo, territorio y diferencia*. Ediciones UNAULA.
  *¿Por qué leerlo?:* Conecta territorio y ontologías relacionales.

- **Svampa, M. (2019).** *Las fronteras del neoextractivismo en América Latina*. CALAS.
  *¿Por qué leerlo?:* Marco regional.

### APORTES FEMINISTAS

- **Inventada, X. (2020).** *Un libro que no existe*. Editorial Falsa.
  *¿Por qué leerlo?:* <script>alert(1)</script> [link](javascript:alert(1)).

No incluí la sección de diálogos contemporáneos por falta de obras verificadas.`;

const calls = [];
async function fakeFetch(url, init = {}) {
  calls.push({ url, init });
  const json = (status, body) => ({ ok: status < 400, status, json: async () => body, headers: { get: () => null } });
  if (url.includes('generativelanguage')) {
    const body = JSON.parse(init.body);
    if (init.headers['x-goog-api-key'] === 'MALA') return json(400, { error: { message: 'API key not valid. Please pass a valid API key.' } });
    await wait(30);
    if (init.signal?.aborted) { const e = new Error('abort'); e.name = 'AbortError'; throw e; }
    return json(200, { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: GEMINI_TXT }] },
      groundingMetadata: body.tools ? { groundingChunks: [{ web: { uri: 'https://scielo.org/x', title: 'scielo.org' } }, { web: { uri: 'https://scielo.org/x', title: 'dup' } }, { web: { uri: 'javascript:bad', title: 'malo' } }],
        searchEntryPoint: { renderedContent: '<div class="chip">sugerencia</div>' } } : undefined }] });
  }
  if (url.includes('api.crossref.org')) {
    const q = decodeURIComponent(url.split('query.bibliographic=')[1]);
    if (q.includes('Sentipensar')) return json(200, { message: { items: [{ DOI: '10.1/otro', title: ['Algo distinto'], author: [{ family: 'Pérez' }] }, { DOI: '10.5555/escobar', title: ['Sentipensar con la tierra'], subtitle: ['nuevas lecturas sobre desarrollo, territorio y diferencia'], author: [{ family: 'Escobar', given: 'Arturo' }] }] } });
    if (q.includes('neoextractivismo')) return json(200, { message: { items: [{ DOI: '10.9/x', title: ['Las fronteras del neoextractivismo en América Latina'], author: [{ family: 'Gudynas' }] }] } });
    return json(200, { message: { items: [] } });
  }
  throw new Error('url inesperada ' + url);
}

(async () => {
  const html = fs.readFileSync(dir + 'sidepanel.html', 'utf8').replace(/<script src="[^"]+"><\/script>/g, '');
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true });
  const w = dom.window; w.chrome = { storage, i18n: { getUILanguage: () => 'es-AR' }, runtime: { sendMessage: async () => ({ ok: true, r: {} }) } }; w.confirm = () => true; w.fetch = fakeFetch;
  w.HTMLElement.prototype.scrollIntoView = () => {}; w.scrollTo = () => {};
  let copiado = null; Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async t => { copiado = t; } } });
  if (!w.crypto.randomUUID) w.crypto.randomUUID = () => require('crypto').randomUUID();
  for (const f of ['i18n.js', 'faro-ops.js', 'prompts.js', 'sidepanel.js', 'biblio.js']) { const sc = w.document.createElement('script'); sc.textContent = fs.readFileSync(dir + f, 'utf8'); w.document.body.append(sc); }
  await wait(20);
  const $ = s => w.document.querySelector(s), $$ = s => w.document.querySelectorAll(s);
  const ok = okU;
  const B = w.__faroBiblio;

  // unidades
  ok(B.coincideTitulo('Sentipensar con la tierra: nuevas lecturas', 'Sentipensar con la tierra'), 'título con subtítulo coincide');
  ok(!B.coincideTitulo('La guerra contra las mujeres', 'La guerra de los mundos'), 'títulos distintos no coinciden');
  ok(B.primerApellido('Segato, R. L.; Otra, B.') === 'segato' && B.primerApellido('Rita Laura Segato') === 'segato', 'apellido');
  ok(JSON.stringify(B.datosReferencia('**Segato, R. L. (2016)**. *La guerra*. TdS')) === '{"autor":"Segato, R. L","titulo":"La guerra"}', 'parsea referencia');

  // pestañas
  ok(!$('#vista-fragmentos').hidden && $('#vista-biblio').hidden, 'arranca en Fragmentos');
  $('#tab-biblio').click();
  ok($('#vista-fragmentos').hidden && !$('#vista-biblio').hidden && $('#tab-biblio').getAttribute('aria-selected') === 'true', 'cambia a Bibliografía');
  ok($('#b-config').open, 'config abierta sin clave');

  // buscar sin clave
  $('#b-consulta').value = 'biocorredores y conflictos territoriales';
  $('#b-buscar').click(); await wait(5);
  ok(!$('#b-aviso').hidden && $('#b-aviso').textContent.includes('clave'), 'pide la clave');
  ok(!calls.length, 'no llama a Gemini sin clave');

  // clave mala
  $('#b-clave').value = 'MALA'; $('#b-modelo').value = ''; $('#b-guardar-config').click(); await wait(10);
  ok(store['cfg:gemini'].modelo === 'gemini-2.5-flash', 'guarda config con modelo por defecto');
  $('#b-buscar').click(); await wait(20);
  ok($('#b-aviso').textContent.includes('La clave no es válida'), 'diagnostica clave inválida');

  // clave buena, búsqueda con web
  $('#b-clave').value = 'AIzaBUENA'; $('#b-guardar-config').click(); await wait(10);
  calls.length = 0;
  $('#b-buscar').click(); await wait(5);
  ok(!$('#b-cargando').hidden && !$('#b-detener').hidden, 'muestra cargando');
  await wait(120);
  const g = calls.find(c => c.url.includes('generativelanguage'));
  const body = JSON.parse(g.init.body);
  ok(g.url.endsWith('/gemini-2.5-flash:generateContent') && g.init.headers['x-goog-api-key'] === 'AIzaBUENA', 'llama al modelo con la clave en header');
  ok(body.tools?.[0]?.google_search && body.systemInstruction.parts[0].text.startsWith('[ROL Y OBJETIVO]') && body.systemInstruction.parts[0].text.includes('IMPORTANTE — USÁ LA BÚSQUEDA'), 'usa prompt de FARO + grounding');
  ok(body.contents[0].parts[0].text.startsWith('Buscá en internet trabajos académicos reales sobre: biocorredores'), 'mensaje de usuario igual a FARO');
  ok($('#b-cargando').hidden && !$('#b-resultado').hidden, 'muestra resultado');
  ok($$('#b-salida h3').length === 2 && $$('#b-salida li').length === 3, 'renderiza secciones y obras');
  ok(!$('#b-salida script') && !$('#b-salida').innerHTML.includes('javascript:') && $('#b-salida').textContent.includes('<script>'), 'escapa HTML y descarta links peligrosos');
  ok($$('#b-salida em').length >= 6, 'cursivas');
  ok($$('#b-fuentes li').length === 2 && $$('#b-fuentes a').length === 1, 'fuentes deduplicadas y sin URL peligrosa');
  ok(!$('#b-sugerencias-caja').hidden && $('#b-sugerencias iframe').getAttribute('sandbox') === 'allow-popups allow-popups-to-escape-sandbox', 'sugerencias de Google en iframe aislado');
  ok($('#b-aviso').hidden, 'sin aviso cuando hay fuentes');
  const v = [...$$('#b-salida li')].map(li => li.querySelector('.verif')?.textContent);
  ok(v[0] === '✓ CrossRef' && $('#b-salida li .verif a').href === 'https://doi.org/10.5555/escobar', 'verifica en CrossRef con DOI');
  ok(v[1] === 'sin coincidencia en CrossRef', 'autor distinto no verifica');
  ok(v[2] === 'sin coincidencia en CrossRef', 'obra inexistente no verifica');
  ok(!$('#b-leyenda').hidden, 'leyenda visible');
  ok(store['biblio:historial'].length === 1 && !$('#b-historial-caja').hidden, 'guarda historial');

  // copiar
  $('#b-copiar').click(); await wait(5);
  ok(copiado.includes('Sentipensar') && copiado.includes('Fuentes consultadas') , 'copia resultado con fuentes');

  // sin web
  $('#b-web').checked = false; calls.length = 0;
  $('#b-buscar').click(); await wait(150);
  const body2 = JSON.parse(calls.find(c => c.url.includes('generativelanguage')).init.body);
  ok(!body2.tools && body2.contents[0].parts[0].text === 'biocorredores y conflictos territoriales', 'sin web no manda google_search');
  ok($('#b-aviso').textContent.includes('Búsqueda web desactivada') && $('#b-sugerencias-caja').hidden, 'avisa que es de memoria');
  $('#b-web').checked = true;

  // detener
  $('#b-buscar').click(); await wait(5); $('#b-detener').click(); await wait(60);
  ok($('#b-aviso').textContent.includes('detenida') && $('#b-cargando').hidden, 'detener búsqueda');

  // desde fragmento
  $('#tab-fragmentos').click();
  await storage.local.set({ 'cap:1': { id: '1', texto: 'El corredor atraviesa campos de soja', url: 'https://diario.com/n', titulo: 'Diario', fecha: new Date().toISOString(), codigos: ['territorio'], memo: '' } });
  await wait(20);
  $('.captura [data-accion="biblio"]').click(); await wait(5);
  ok(!$('#vista-biblio').hidden, 'botón del fragmento abre Bibliografía');
  ok($('#b-consulta').value.includes('(códigos: territorio)') && $('#b-consulta').value.includes('«El corredor atraviesa campos de soja»'), 'precarga el fragmento');
  ok(!$('#b-origen').hidden && $('#b-origen-fuente').textContent === 'Diario', 'muestra origen');

  // historial reabre
  $('#b-historial button').click(); await wait(50);
  ok($('#b-consulta').value === 'biocorredores y conflictos territoriales' && $('#b-origen').hidden, 'reabre búsqueda del historial');

  // borrar todo no toca config ni historial
  $('#tab-fragmentos').click(); $('#borrar-todo').click(); await wait(20);
  ok(!store['cap:1'] && store['cfg:gemini'] && store['biblio:historial'], 'borrar fragmentos conserva config e historial');
  // exportar no incluye la clave
  ok(!Object.keys(store).some(k => k.startsWith('cap:')), 'no quedan capturas después de borrar');
})();
