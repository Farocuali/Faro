const { chromium } = require('playwright');
// Prueba de punta a punta: carga la extensión en Chromium y simula un Google Doc.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { RAIZ, ok } = require('./util');
// Se prueba el paquete armado (dist/chrome), igual al que se instala.
const ext = path.join(RAIZ, 'dist', 'chrome');
if (!fs.existsSync(path.join(ext, 'manifest.json'))) { console.error('Falta dist/chrome: corré python3 herramientas/empaquetar.py'); process.exit(1); }
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'faro-e2e-'));
console.log('navegador (Chromium + extensión)');
const wait = ms => new Promise(r => setTimeout(r, ms));

let DOC_TXT = '﻿Entrevista a Ana, vecina del corredor\r\n\r\nAna: Antes acá todo era monte. Ahora pasan los camiones de la soja todo el día.\r\nEl municipio dice que el corredor va a proteger el bosque, pero nadie nos preguntó nada.\r\n';

function paginaDocs() {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Entrevista Ana - Google Docs</title></head><body>
  <div class="kix-appview-editor" style="height:600px;background:#eee">[canvas del Doc]</div>
  <script>
    const f = document.createElement('iframe');
    f.className = 'docs-texteventtarget-iframe';
    f.style.cssText = 'position:absolute;top:0;left:0;width:500px;height:200px;';
    document.body.appendChild(f);
    f.contentDocument.body.innerHTML = '<div contenteditable="true" id="ed">' + ${JSON.stringify(DOC_TXT.replace(/^﻿/, '').replace(/\r\n/g, '\n'))}.replace(/\\n/g,'<br>') + '</div>';
  </script></body></html>`;
}

(async () => {
  const ctx = await chromium.launchPersistentContext(OUT + '/perfil', {
    headless: true, channel: 'chromium', viewport: { width: 1400, height: 900 }, locale: 'es-AR',
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--lang=es-AR']
  });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://docs.google.com' });
  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker');
  const id = sw.url().split('/')[2];
  await wait(800);
  ok(ctx.pages().some(p => p.url().endsWith('/bienvenida.html')), 'Al instalar abre la página de bienvenida');
  const errores = [];
  const vigilar = (p, nombre) => {
    p.on('console', m => { if (m.type() === 'error') errores.push(`[${nombre}] ${m.text()}`); });
    p.on('pageerror', e => errores.push(`[${nombre}] pageerror: ${e.message}`));
  };

  await ctx.route('https://farocuali.github.io/**', (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><title>FARO</title><p>FARO web</p>' }));
  await ctx.route('https://openidconnect.googleapis.com/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await ctx.route('https://docs.google.com/**', async (route) => {
    const u = route.request().url();
    if (u.includes('/export?format=txt')) return route.fulfill({ status: 200, contentType: 'text/plain; charset=utf-8', body: DOC_TXT });
    if (u.includes('/document/d/DOC123/edit')) return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: paginaDocs() });
    return route.fulfill({ status: 404, body: '' });
  });

  // ---------- Google Docs: codificar sin FARO abierto (va directo a la base) ----------
  const docs = await ctx.newPage(); vigilar(docs, 'docs');
  await docs.goto('https://docs.google.com/document/d/DOC123/edit');
  await docs.waitForSelector('#faro-docs', { timeout: 10000 });
  ok(true, 'Docs: aparece el botón FARO');

  let marco = docs.frames().find(f => f !== docs.mainFrame());
  async function copiar(texto) {
    await marco.evaluate((t) => {
      const ed = document.getElementById('ed'); ed.focus();
      // selecciona el texto t dentro del editor
      const walker = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT);
      let n; while ((n = walker.nextNode())) { const i = n.data.indexOf(t); if (i >= 0) { const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + t.length); const s = getSelection(); s.removeAllRanges(); s.addRange(r); return; } }
      throw new Error('texto no encontrado en el editor');
    }, texto);
    await docs.keyboard.press('Control+c');
    await wait(150);
  }

  await copiar('Ahora pasan los camiones de la soja todo el día.');
  await docs.click('#faro-docs >> #abrir');
  await wait(400);
  const prev = await docs.locator('#faro-docs >> #frag').textContent();
  ok(prev === 'Ahora pasan los camiones de la soja todo el día.', 'Docs: toma el fragmento copiado con Ctrl+C');
  ok((await docs.locator('#faro-docs >> #estado').textContent()).includes('Todavía no está'), 'Docs: avisa que el Doc no está en FARO');
  ok(await docs.locator('#faro-docs >> #chk-resaltar').isHidden() && (await docs.locator('#faro-docs >> #modo').textContent()).includes('Sin Google'), 'Docs: sin Google, avisa que los códigos quedan en FARO');

  await docs.fill('#faro-docs >> #codigo', 'extractivismo, paisaje');
  await docs.press('#faro-docs >> #codigo', 'Enter');
  await docs.waitForFunction(() => document.querySelector('#faro-docs').shadowRoot.getElementById('msg').textContent.includes('✓'), null, { timeout: 8000 });
  const msg1 = await docs.locator('#faro-docs >> #msg').textContent();
  ok(msg1.includes('«extractivismo»') && msg1.includes('«paisaje»'), 'Docs: aplica dos códigos a la vez');
  ok((await docs.locator('#faro-docs >> #estado').textContent()) === '2 fragmentos codificados', 'Docs: actualiza el resumen');
  ok((await docs.locator('#faro-docs >> .chip').count()) === 2, 'Docs: muestra los códigos del Doc');

  // fragmento que no está en el Doc
  await docs.evaluate(() => { const ta = document.createElement('textarea'); ta.value = 'texto de otro documento'; document.body.appendChild(ta); ta.select(); });
  await docs.keyboard.press('Control+c'); await wait(150);
  await docs.fill('#faro-docs >> #codigo', 'x');
  await docs.press('#faro-docs >> #codigo', 'Enter');
  await docs.waitForFunction(() => document.querySelector('#faro-docs').shadowRoot.getElementById('msg').className.includes('error'), null, { timeout: 8000 });
  ok((await docs.locator('#faro-docs >> #msg').textContent()).includes('No encontré ese fragmento'), 'Docs: avisa si lo copiado no está en el Doc');

  // ---------- FARO completo: el material y los códigos están en el proyecto ----------
  const faro = await ctx.newPage(); vigilar(faro, 'faro');
  await faro.goto(`chrome-extension://${id}/faro.html`);
  await faro.waitForFunction(() => document.getElementById('faro-google-btn'), null, { timeout: 10000 });
  const estado = await faro.evaluate(() => {
    const m = materials.find(x => x.attrs && x.attrs['Google Doc'] === 'DOC123');
    return m && { name: m.name, type: m.type, anns: m.anns.map(a => ({ label: a.label, quote: a.quote, ok: m.text.slice(a.start, a.end) === a.quote })), codes: savedCodes.map(c => c.code), textoInicio: m.text.slice(0, 25) };
  });
  ok(estado && estado.name === 'Entrevista Ana' && estado.type === 'notas-campo', 'FARO: el Doc es un material con su título');
  ok(estado && estado.textoInicio === 'Entrevista a Ana, vecina ', 'FARO: texto sin BOM ni \\r');
  ok(estado && estado.anns.length === 2 && estado.anns.every(a => a.ok && a.quote === 'Ahora pasan los camiones de la soja todo el día.'), 'FARO: las anotaciones apuntan al fragmento exacto');
  ok(estado && estado.codes.join() === 'extractivismo,paisaje', 'FARO: los códigos existen en el libro de códigos');

  // ---------- Codificar con FARO abierto (lo aplica la pestaña) ----------
  await copiar('nadie nos preguntó nada.');
  await docs.fill('#faro-docs >> #codigo', 'Paisaje');
  await docs.press('#faro-docs >> #codigo', 'Enter');
  await docs.waitForFunction(() => document.querySelector('#faro-docs').shadowRoot.getElementById('msg').textContent.includes('✓ Codificado'), null, { timeout: 8000 });
  await wait(300);
  const tras = await faro.evaluate(() => ({ n: materials.find(x => x.attrs?.['Google Doc'] === 'DOC123').anns.length, codes: savedCodes.length, toast: document.getElementById('toast').textContent }));
  ok(tras.n === 3 && tras.codes === 2, 'FARO abierto: recibe la anotación al instante y reutiliza el código existente («Paisaje» = «paisaje»)');
  ok(tras.toast.includes('Google Docs'), 'FARO abierto: muestra un aviso');
  const enDB = await faro.evaluate(() => FaroOps.leerKV(['materials']).then(kv => kv.materials.find(x => x.attrs?.['Google Doc'] === 'DOC123').anns.length));
  ok(enDB === 3, 'FARO abierto: lo guarda en la base');

  // ---------- El Doc cambió: actualizar reubica las anotaciones ----------
  DOC_TXT = '﻿Entrevista a Ana, vecina del corredor\r\nRegistro del 3 de noviembre.\r\n\r\nAna: Antes acá todo era monte. Ahora pasan los camiones de la soja todo el día.\r\nEl municipio dice que el corredor va a proteger el bosque, pero nadie nos preguntó nada.\r\n';
  await docs.click('#faro-docs >> #importar');
  await docs.waitForFunction(() => document.querySelector('#faro-docs').shadowRoot.getElementById('msg2').textContent.includes('✓'), null, { timeout: 8000 });
  ok((await docs.locator('#faro-docs >> #msg2').textContent()).includes('actualizado'), 'Docs: actualizar trae el texto nuevo');
  await wait(300);
  const reubic = await faro.evaluate(() => { const m = materials.find(x => x.attrs?.['Google Doc'] === 'DOC123'); return m.anns.every(a => !a.lost && m.text.slice(a.start, a.end) === a.quote); });
  ok(reubic, 'FARO: las anotaciones se reubican cuando el Doc cambia');

  // ---------- Abrir en FARO ----------
  await docs.click('#faro-docs >> #ver');
  await wait(1200);
  const ruta = await faro.evaluate(() => ({ route, activeMatId, nombre: materials.find(m => m.id === activeMatId)?.name }));
  ok(ruta.route === 'codificar' && ruta.nombre === 'Entrevista Ana', 'Docs → «Abrir en FARO» abre el material en Codificar');
  await faro.screenshot({ path: OUT + '/faro-codificar.png' });

  // ---------- Atajo de teclado en Docs ----------
  await docs.locator('#faro-docs >> #cerrar').click();
  await sw.evaluate(async () => { const [t] = await chrome.tabs.query({ url: 'https://docs.google.com/*' }); await chrome.tabs.sendMessage(t.id, { tipo: 'docs-abrir-codificador' }); });
  await wait(500);
  ok(await docs.locator('#faro-docs >> #panel').isVisible(), 'Docs: Alt+Shift+F abre el codificador');
  await docs.bringToFront();
  await docs.screenshot({ path: OUT + '/docs-panel.png' });

  // ---------- Panel lateral: pasar capturas web a FARO ----------
  await sw.evaluate(async () => {
    await chrome.storage.local.set({
      'cap:a': { id: 'a', texto: 'El corredor biológico conecta tres reservas.', url: 'https://diario.com/nota', titulo: 'Diario', fecha: '2026-11-04T12:00:00.000Z', codigos: ['conservación'], memo: '' },
      'cap:b': { id: 'b', texto: 'Los productores rechazan el proyecto.', url: 'https://diario.com/nota', titulo: 'Diario', fecha: '2026-11-04T12:05:00.000Z', codigos: [], memo: '' }
    });
  });
  const panel = await ctx.newPage(); vigilar(panel, 'panel');
  await panel.goto(`chrome-extension://${id}/sidepanel.html`);
  await wait(500);
  ok((await panel.textContent('#pasar-faro')) === 'Pasar a FARO (2)', 'Panel: cuenta las capturas pendientes');
  await panel.click('#pasar-faro');
  await panel.waitForFunction(() => document.getElementById('pasar-faro').textContent === 'Todo en FARO ✓', null, { timeout: 8000 });
  ok((await panel.locator('.en-faro:visible').count()) === 2, 'Panel: marca las capturas como «En FARO»');
  // agregar un código después de pasar
  const tarjetaB = panel.locator('.captura', { hasText: 'Los productores' });
  await tarjetaB.locator('[data-campo="codigo"]').fill('conflicto');
  await tarjetaB.locator('[data-campo="codigo"]').press('Enter');
  await wait(800);
  const web = await faro.evaluate(() => { const m = materials.find(x => x.tags?.includes('captura web')); return m && { name: m.name, frags: m.text.split('— — —').length, anns: m.anns.map(a => a.label + ':' + (m.text.slice(a.start, a.end) === a.quote)) }; });
  ok(web && web.name === 'Web · Diario' && web.frags === 2, 'FARO: un material por página con los dos fragmentos');
  ok(web && web.anns.join() === 'conservación:true,conflicto:true', 'FARO: códigos del panel (antes y después de pasar) quedan anotados');

  // ---------- Botón G ----------
  await faro.click('#faro-google-btn');
  await faro.waitForSelector('[data-copiar]');
  const uris = await faro.$$eval('.fg input[readonly]', (xs) => xs.map(x => x.value));
  ok(uris.join() === `https://${id}.chromiumapp.org/,https://farocuali.github.io/Faro/`, 'G: muestra las dos URIs de redireccionamiento');
  await faro.fill('#fg-client', 'cualquier-cosa');
  await faro.click('#fg-guardar-client');
  await wait(400);
  ok((await faro.textContent('#toast')).includes('apps.googleusercontent.com'), 'G: rechaza un Client ID mal formado');
  await faro.fill('#fg-client', '123-abc.apps.googleusercontent.com');
  await faro.click('#fg-guardar-client');
  await faro.waitForSelector('#fg-conectar');
  ok(true, 'G: con Client ID ofrece «Conectar con Google»');
  await faro.screenshot({ path: OUT + '/faro-g.png' });
  await faro.click('#m-close');

  // ---------- Inicio de sesión por pestaña: la página pública devuelve el permiso ----------
  await sw.evaluate(() => chrome.storage.session.set({ 'google:state': { state: 'faro_123', desde: Date.now() } }));
  const scope = encodeURIComponent('openid email https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/documents');
  const vuelta = await ctx.newPage();
  const cerrada = new Promise(r => vuelta.on('close', r));
  await vuelta.goto(`https://farocuali.github.io/Faro/#access_token=TOK_TEST&token_type=Bearer&expires_in=3600&state=faro_123&scope=${scope}`).catch(() => {});
  await Promise.race([cerrada, wait(4000)]);
  const tok = await sw.evaluate(() => chrome.storage.session.get('google:token').then(d => d['google:token']?.token));
  ok(tok === 'TOK_TEST' && vuelta.isClosed(), 'Pestaña de Google: FARO toma el permiso y cierra la pestaña');

  // ---------- Exportaciones a Google Docs (HTML) ----------
  const html = await faro.evaluate(() => ({ cod: __faroExt.EXPORTES.codigos.html(), vacioRefs: __faroExt.EXPORTES.referencias.vacio() }));
  ok(html.cod.includes('<h2>extractivismo</h2>') && html.cod.includes('Ahora pasan los camiones') && html.cod.includes('2 fragmentos'), 'Drive: el libro de códigos para Docs trae códigos, conteos y ejemplos');

  // ---------- Librerías de FARO dentro de la extensión ----------
  const libs = await faro.evaluate(async () => {
    const r = {};
    for (const n of ['cytoscape', 'mammoth', 'pdfjs']) { try { await ensureLib(n); r[n] = 'ok'; } catch (e) { r[n] = String(e); } }
    r.worker = typeof pdfjsLib !== 'undefined' && pdfjsLib.GlobalWorkerOptions.workerSrc.startsWith('chrome-extension://');
    return r;
  });
  ok(libs.cytoscape === 'ok' && libs.mammoth === 'ok' && libs.pdfjs === 'ok' && libs.worker, 'FARO: Cytoscape, Mammoth y PDF.js cargan desde el paquete');

  // recorrer todas las secciones
  for (const r of ['proyecto', 'notas-campo', 'entrevistas', 'documentos', 'codificar', 'analizar', 'profundidad', 'nube', 'citar', 'recomendar', 'config', 'home']) {
    await faro.evaluate((r) => go(r), r); await wait(350);
  }
  await faro.evaluate(() => go('nube')); await wait(1500);
  await faro.screenshot({ path: OUT + '/faro-nube.png' });
  const csp = errores.filter(e => /Content Security Policy|Refused to/i.test(e));
  ok(csp.length === 0, 'FARO: ninguna sección choca con la política de seguridad');
  const otros = errores.filter(e => !/Content Security Policy|Refused to/i.test(e) && !/404/.test(e));
  ok(otros.length === 0, 'Sin errores de JavaScript' + (otros.length ? ':\n  ' + otros.join('\n  ') : ''));

  // ---------- Acuerdo entre codificadoras ----------
  const abrirHerramienta = async (id) => { await faro.click('#faro-mas-btn'); await faro.click(`[data-herramienta="${id}"]`); };
  await abrirHerramienta('acuerdo');
  await faro.waitForSelector('#ka-archivo');
  const otra = await faro.evaluate(() => {
    const d = JSON.parse(JSON.stringify(__faroExt.datosProyecto()));
    const m = d.materials.find(x => x.attrs?.['Google Doc'] === 'DOC123');
    m.anns = m.anns.filter(a => a.label !== 'paisaje');      // la otra persona no usó «paisaje»
    return JSON.stringify(d);
  });
  const archivoOtra = path.join(OUT, 'rochi.json'); fs.writeFileSync(archivoOtra, otra);
  await faro.fill('#ka-otra', 'Rochi');
  await faro.setInputFiles('#ka-archivo', archivoOtra);
  await faro.waitForSelector('#ka-csv', { timeout: 5000 });
  const tabla = await faro.evaluate(() => [...document.querySelectorAll('#ka-resultado table tr')].slice(1).map(tr => [...tr.cells].map(c => c.textContent)));
  const filaEx = tabla.find(f => f[0] === 'extractivismo'), filaPa = tabla.find(f => f[0] === 'paisaje');
  ok(filaEx && filaEx[1] === '1,00' && filaPa && filaPa[1] === '0,00', 'κ: 1 donde coinciden, 0 en el código que usó una sola');
  await faro.screenshot({ path: OUT + '/faro-kappa.png' });
  await faro.click('#m-close');

  // ---------- α de Krippendorff con dos respaldos (3 personas) ----------
  await abrirHerramienta('acuerdo');
  await faro.waitForSelector('#ka-archivo');
  const variante = (quitar) => faro.evaluate((q) => { const d = JSON.parse(JSON.stringify(__faroExt.datosProyecto())); const m = d.materials.find(x => x.attrs?.['Google Doc'] === 'DOC123'); m.anns = m.anns.filter(a => a.label !== q); return JSON.stringify(d); }, quitar);
  const f1 = path.join(OUT, 'luz.json'), f2 = path.join(OUT, 'sol.json');
  fs.writeFileSync(f1, await variante('paisaje')); fs.writeFileSync(f2, await variante('extractivismo'));
  await faro.setInputFiles('#ka-archivo', [f1, f2]);
  await faro.waitForSelector('#ka-csv', { timeout: 5000 });
  const txtAlfa = await faro.textContent('#ka-resultado');
  ok(txtAlfa.includes('Krippendorff') && (await faro.$$('#ka-resultado li')).length === 3, 'α: con tres personas muestra α y κ para los tres pares');
  await faro.click('#m-close');

  // ---------- Colores de códigos ----------
  await abrirHerramienta('colores');
  await faro.waitForSelector('input[type=color][data-codigo="paisaje"]');
  await faro.$eval('input[type=color][data-codigo="paisaje"]', (el) => { el.value = '#ff0000'; el.dispatchEvent(new Event('change')); });
  await wait(300);
  await faro.click('#m-close');
  await faro.evaluate(() => { const m = materials.find(x => x.attrs?.['Google Doc'] === 'DOC123'); activeMatId = m.id; go('codificar'); });
  await wait(600);
  const fondos = await faro.$$eval('mark.coded', (ms) => ms.map(m => m.style.backgroundColor));
  ok(fondos.includes('rgb(255, 0, 0)'), 'Colores: el color elegido se aplica a los fragmentos en FARO');
  const kv = await sw.evaluate(() => FaroOps.leerKV(['faroExt:colores']));
  ok(kv['faroExt:colores']?.paisaje === '#FF0000', 'Colores: queda guardado para usarlo en Google Docs');

  // ---------- Saturación ----------
  await abrirHerramienta('saturacion');
  await faro.waitForSelector('#sat-tipo');
  const filasSat = await faro.$$eval('.modal-body table tr', (tr) => tr.length - 1);
  ok((await faro.$('.modal-body svg')) && filasSat === 2, 'Saturación: gráfico y una fila por material codificado');
  await faro.screenshot({ path: OUT + '/faro-saturacion.png' });
  await faro.click('#m-close');

  // ---------- Registro de decisiones ----------
  await faro.evaluate(async () => {
    const c = savedCodes.find(x => x.code === 'conflicto'); c.code = 'conflicto social'; await persist(true);
    const des = savedCodes.find(x => x.code === 'conservación'), dest = savedCodes.find(x => x.code === 'paisaje');
    for (const m of materials) for (const a of m.anns) if (a.codeId === des.id) { a.codeId = dest.id; a.label = dest.code; }
    savedCodes.splice(savedCodes.indexOf(des), 1); await persist(true);
    dest.desc = 'Transformaciones del paisaje rural'; await persist(true);
  });
  await abrirHerramienta('registro');
  await faro.waitForSelector('#rg-nota');
  await faro.fill('#rg-nota', 'Fusioné conservación en paisaje porque se superponen.');
  await faro.click('#rg-agregar');
  await faro.waitForFunction(() => document.querySelector('.modal-body')?.textContent.includes('Fusioné conservación'), null, { timeout: 5000 }).catch(() => {});
  const reg = await faro.textContent('.modal-body');
  ok(reg.includes('«conflicto» → «conflicto social»'), 'Registro: detecta el renombre');
  ok(reg.includes('«conservación» se fusionó en «paisaje»'), 'Registro: detecta la fusión');
  ok(reg.includes('Definición cambiada') && reg.includes('Fusioné conservación'), 'Registro: cambios de definición y notas propias');
  ok(reg.includes('Código creado') && reg.includes('desde Docs o el panel'), 'Registro: también lo que llegó desde Docs');
  await faro.screenshot({ path: OUT + '/faro-registro.png' });
  await faro.click('#m-close');

  // ---------- Docs: definiciones, favoritos, seudónimos, citar, atajos, minimizar ----------
  await faro.evaluate(async () => { pseudoDict.push({ real: 'Ana', alias: 'Vecina' }); await persist(true); });
  await docs.bringToFront();
  await docs.reload(); await docs.waitForSelector('#faro-docs');
  marco = docs.frames().find(f => f !== docs.mainFrame());
  await docs.click('#faro-docs >> #abrir'); await wait(600);
  const favs = await docs.$$eval('#faro-docs >> .fav', (b) => b.map(x => x.textContent));
  ok(favs.length >= 3 && favs[0].startsWith('1'), `Docs: códigos favoritos numerados (${favs.slice(0, 3).join(', ')})`);
  await docs.fill('#faro-docs >> #codigo', 'paisaje');
  ok((await docs.textContent('#faro-docs >> #definicion')).includes('Transformaciones del paisaje rural'), 'Docs: muestra la definición del código');
  ok(await docs.locator('#faro-docs >> #aviso-nombres').isVisible(), 'Docs: avisa que el Doc tiene nombres reales');
  await docs.fill('#faro-docs >> #codigo', '');
  // Atajo Alt+Shift+1 desde el editor (iframe)
  const antes = await docs.textContent('#faro-docs >> #estado');
  await copiar('Antes acá todo era monte.');
  await marco.evaluate(() => document.getElementById('ed').focus());
  await docs.keyboard.press('Alt+Shift+Digit1');
  await docs.waitForFunction((a) => document.querySelector('#faro-docs').shadowRoot.getElementById('estado').textContent !== a, antes, { timeout: 8000 });
  ok((await docs.textContent('#faro-docs >> #msg')).includes('✓'), 'Docs: Alt+Shift+1 aplica el código favorito 1');
  // Citar
  await docs.click('#faro-docs >> #tab-citar'); await wait(300);
  await docs.selectOption('#faro-docs >> #citar-codigo', 'extractivismo'); await wait(400);
  const cita = await docs.textContent('#faro-docs >> ul.citas li .q');
  ok(cita.includes('[Vecina]') || !cita.includes('Ana'), 'Citar: las citas salen con seudónimos');
  await docs.click('#faro-docs >> ul.citas li .btn'); await wait(300);
  const portapapeles = await docs.evaluate(() => navigator.clipboard.readText());
  ok(/^«.+» \(Entrevista \[Vecina\], \d\d\/\d\d\/\d\d\)$/.test(portapapeles), `Citar: copia la cita con su referencia → ${portapapeles.slice(0, 60)}…`);
  await docs.screenshot({ path: OUT + '/docs-citar.png' });
  // Minimizar y arrastrar
  const cab = await docs.locator('#faro-docs >> #cab').boundingBox();
  await docs.mouse.move(cab.x + 60, cab.y + 10); await docs.mouse.down(); await docs.mouse.move(300, 120, { steps: 5 }); await docs.mouse.up();
  await wait(300);
  const pos = await sw.evaluate(() => chrome.storage.local.get('docs:posicion'));
  ok(pos['docs:posicion'] && Math.abs(pos['docs:posicion'].x - 240) < 30, 'Docs: el panel se arrastra y recuerda su lugar');
  await docs.click('#faro-docs >> #minimizar');
  ok(await docs.locator('#faro-docs >> #abrir').isVisible() && await docs.locator('#faro-docs >> #panel').isHidden(), 'Docs: minimizar deja solo el botón');

  // ---------- Permiso por archivo: «Dar acceso a FARO a este Doc» con el selector de Google ----------
  // Se sirve la página real acceso.html (raíz del repo); los scripts de Google se reemplazan por imitaciones que registran las llamadas.
  await ctx.route('https://farocuali.github.io/Faro/acceso.html', (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fs.readFileSync(path.join(RAIZ, '..', 'acceso.html'), 'utf8') }));
  await ctx.route('https://apis.google.com/js/api.js', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: `
    window.__reg = { metodos: {} };
    window.gapi = { load: function (m, cb) { window.google = window.google || {};
      google.picker = { ViewId: { DOCUMENTS: 'documents' }, DocsViewMode: { LIST: 'list' }, Response: { ACTION: 'action', DOCUMENTS: 'docs' },
        Action: { PICKED: 'picked', CANCEL: 'cancel' }, Document: { ID: 'id' },
        DocsView: function (v) { __reg.vista = v; this.setFileIds = function (x) { __reg.fileIds = x; return this; }; this.setMode = function () { return this; }; },
        PickerBuilder: function () { var self = this, cb;
          ['addView','setOAuthToken','setDeveloperKey','setAppId','setLocale','setTitle'].forEach(function (k) { self[k] = function (v) { __reg.metodos[k] = typeof v === 'object' ? 'vista' : v; return self; }; });
          self.setCallback = function (f) { cb = f; return self; };
          self.build = function () { return { setVisible: function () { console.log('PICKER ' + JSON.stringify(__reg)); setTimeout(function () { cb({ action: 'picked', docs: [{ id: __reg.fileIds }] }); }, 50); } }; };
        } };
      cb(); } };` }));
  await ctx.route('https://accounts.google.com/gsi/client', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: `
    window.google = window.google || {};
    google.accounts = { oauth2: { initTokenClient: function (cfg) { console.log('GIS ' + JSON.stringify({ client_id: cfg.client_id, scope: cfg.scope })); return { requestAccessToken: function () { setTimeout(function () { cfg.callback({ access_token: 'TOKEN_PRUEBA' }); }, 20); } }; } } };` }));
  await sw.evaluate(async () => {
    await Google.guardarClientId('123456789-abc.apps.googleusercontent.com', 'AIzaSyPruebaPruebaPruebaPrueba12');
    self.__acceso = false;
    Google.estado = async () => ({ conectado: true, email: 'mic@x', clientId: '123456789-abc.apps.googleusercontent.com' });
    Google.tieneAcceso = async () => self.__acceso;
  });
  await docs.click('#faro-docs >> #abrir'); await wait(600);
  ok((await docs.textContent('#faro-docs >> #modo')).includes('necesita tu permiso para este Doc'), 'Acceso: con Google conectado y sin acceso, explica que hace falta el permiso de este Doc');
  const nuevaPestana = ctx.waitForEvent('page');
  await docs.click('#faro-docs >> #modo .btn');
  const pAcceso = await nuevaPestana;
  const registros = [];
  pAcceso.on('console', (m) => registros.push(m.text()));
  // La pestaña la abre la extensión y su primera carga puede escaparse de ctx.route (sale a internet):
  // se recarga desde Playwright para que se sirvan la página local y las imitaciones de Google.
  await pAcceso.waitForLoadState('domcontentloaded').catch(() => {});
  await pAcceso.reload();
  await pAcceso.waitForSelector('#elegir:not([disabled])', { timeout: 8000 });
  ok(pAcceso.url().startsWith('https://farocuali.github.io/Faro/acceso.html#doc=DOC123&cliente=123456789-abc'), 'Acceso: abre la página pública con el Doc y el cliente en el fragmento');
  await sw.evaluate(() => { self.__acceso = true; });
  await pAcceso.click('#elegir');
  await docs.waitForFunction(() => document.querySelector('#faro-docs').shadowRoot.getElementById('msg').textContent.includes('ya tiene acceso'), null, { timeout: 8000 });
  const gis = JSON.parse((registros.find((x) => x.startsWith('GIS ')) || 'GIS {}').slice(4));
  const pick = JSON.parse((registros.find((x) => x.startsWith('PICKER ')) || 'PICKER {"metodos":{}}').slice(7));
  ok(gis.scope === 'https://www.googleapis.com/auth/drive.file' && gis.client_id === '123456789-abc.apps.googleusercontent.com', 'Acceso: pide solo drive.file con el Client ID de FARO');
  ok(pick.fileIds === 'DOC123' && pick.metodos.setAppId === '123456789' && pick.metodos.setDeveloperKey === 'AIzaSyPruebaPruebaPruebaPrueba12' && pick.metodos.setOAuthToken === 'TOKEN_PRUEBA', 'Acceso: el selector muestra solo ese Doc, con el número de proyecto y la clave correctos');
  ok(pAcceso.isClosed(), 'Acceso: al elegir el Doc, la pestaña se cierra sola');
  ok((await docs.textContent('#faro-docs >> #modo')).includes('se guardan dentro del Doc'), 'Acceso: el panel pasa a guardar los códigos dentro del Doc');

  await ctx.close();

  // ---------- Interfaz en inglés (navegador en inglés) ----------
  const ctx2 = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'faro-en-')), {
    headless: true, channel: 'chromium', locale: 'en-US',
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--lang=en-US']
  });
  await ctx2.route('https://docs.google.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: paginaDocs() }));
  const p2 = await ctx2.newPage();
  await p2.goto('https://docs.google.com/document/d/DOC123/edit');
  await p2.waitForSelector('#faro-docs', { timeout: 10000 });
  await p2.click('#faro-docs >> #abrir');
  await wait(300);
  const titulo = await p2.locator('#faro-docs >> .tit').first().textContent();
  ok(titulo === 'Code a fragment', `Docs en inglés: «${titulo}»`);
  const sw2 = ctx2.serviceWorkers()[0] || await ctx2.waitForEvent('serviceworker');
  const id2 = sw2.url().split('/')[2];
  const pp = await ctx2.newPage(); await pp.goto(`chrome-extension://${id2}/sidepanel.html`); await wait(300);
  ok((await pp.textContent('#tab-fragmentos')) === 'Fragments' && (await pp.getAttribute('#filtro', 'placeholder')) === 'Search fragments, codes and memos', 'Panel lateral en inglés');
  await ctx2.close();
  console.log('  (capturas de pantalla en ' + OUT + ')');
})().catch(e => { console.error(e); process.exit(1); });
