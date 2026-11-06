const fs = require('fs');
const { RAIZ, ok } = require('./util'); const dir = RAIZ + '/';

function entorno({ scopes = 'openid email https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/documents' } = {}) {
  const local = {}, session = {};
  const area = (o) => ({
    get: async (k) => { const ks = k === null ? Object.keys(o) : [].concat(k); const r = {}; ks.forEach(x => { if (x in o) r[x] = o[x]; }); return r; },
    set: async (v) => Object.assign(o, v),
    remove: async (k) => [].concat(k).forEach(x => delete o[x])
  });
  const llamadas = [], flujos = [];
  let tokenN = 0;
  const g = {
    chrome: {
      storage: { local: area(local), session: area(session) },
      identity: {
        getRedirectURL: () => 'https://abc.chromiumapp.org/',
        launchWebAuthFlow: async ({ url, interactive }) => {
          flujos.push({ url, interactive });
          if (!interactive && !local['google:email']) throw new Error('User interaction required.');
          tokenN++;
          return `https://abc.chromiumapp.org/#access_token=TOK${tokenN}&expires_in=3600&scope=${encodeURIComponent(scopes)}`;
        }
      }
    },
    fetch: null, self: null, llamadas, flujos, local, session
  };
  return g;
}

function cargar(g, rutas) {
  const ctx = { chrome: g.chrome, fetch: (...a) => g.fetch(...a), URLSearchParams, URL, console };
  ctx.self = ctx;
  new Function('self', 'chrome', 'fetch', fs.readFileSync(dir + 'faro-ops.js', 'utf8'))(ctx, g.chrome, ctx.fetch);
  new Function('self', 'chrome', 'fetch', fs.readFileSync(dir + 'google.js', 'utf8'))(ctx, g.chrome, ctx.fetch);
  g.fetch = async (url, init = {}) => {
    g.llamadas.push({ url, init });
    for (const [re, fn] of rutas) if (re.test(url)) return fn(url, init);
    throw new Error('ruta no simulada ' + url);
  };
  return ctx.Google;
}
const resp = (status, body, tipo = 'application/json') => ({ ok: status < 400, status, headers: { get: () => tipo }, json: async () => body, text: async () => typeof body === 'string' ? body : JSON.stringify(body) });

(async () => {
  // ---------- inicio de sesión ----------
  let g = entorno();
  let G = cargar(g, [
    [/openidconnect.*userinfo/, () => resp(200, { email: 'mic@gmail.com' })],
    [/revoke/, () => resp(200, {})]
  ]);
  let e = await G.token().catch(x => x);
  ok(e.codigo === 'sin-client-id', 'sin Client ID: error claro');
  e = await G.guardarClientId('cualquier cosa').catch(x => x);
  ok(e.codigo === 'client-id-invalido', 'valida el formato del Client ID');
  await G.guardarClientId('123-abc.apps.googleusercontent.com');
  const t = await G.token({ interactivo: true });
  ok(t === 'TOK1' && g.local['google:email'] === 'mic@gmail.com', 'conecta y guarda el correo');
  const u = new URL(g.flujos.at(-1).url);
  ok(u.searchParams.get('response_type') === 'token' && u.searchParams.get('redirect_uri') === 'https://abc.chromiumapp.org/' && u.searchParams.get('scope').includes('drive.file') && !u.searchParams.get('scope').includes('auth/documents'), 'pide solo el permiso por archivo (drive.file), no el sensible de Docs');
  ok((await G.token()) === 'TOK1' && g.flujos.length === 2, 'reutiliza el token vigente');
  g.session['google:token'].vence = Date.now() + 1000;
  ok((await G.token()) === 'TOK2' && g.flujos.at(-1).interactive === false && new URL(g.flujos.at(-1).url).searchParams.get('prompt') === 'none', 'renueva el token en silencio');
  const est = await G.estado();
  ok(est.conectado && est.email === 'mic@gmail.com', 'estado: conectado');
  await G.desconectar();
  ok(g.llamadas.some(c => c.url.includes('revoke?token=TOK2')) && !g.local['google:email'], 'desconectar revoca el token');

  g = entorno({ scopes: 'openid email' });
  G = cargar(g, [[/userinfo/, () => resp(200, {})]]);
  await G.guardarClientId('123-abc.apps.googleusercontent.com');
  e = await G.token({ interactivo: true }).catch(x => x);
  ok(e.codigo === 'faltan-permisos', 'si no se aceptan todos los permisos, lo dice');

  // ---------- Drive ----------
  g = entorno();
  let archivos = {}, n = 0, primero401 = true;
  G = cargar(g, [
    [/userinfo/, () => resp(200, { email: 'mic@gmail.com' })],
    [/drive\/v3\/files\?q=/, (url) => resp(200, { files: url.includes('in%20parents') || url.includes("in parents") ? Object.values(archivos).filter(f => f.mimeType === 'application/json').map(f => ({ id: f.id, name: f.name, modifiedTime: '2026-11-04T15:00:00Z' })) : [] })],
    [/drive\/v3\/files\?fields=id$/, (url, init) => { const m = JSON.parse(init.body); const id = 'CARPETA'; archivos[id] = { id, ...m }; return resp(200, { id }); }],
    [/upload\/drive\/v3\/files\?uploadType=multipart/, (url, init) => {
      if (primero401) { primero401 = false; return resp(401, { error: { message: 'expired' } }); }
      const meta = JSON.parse(init.body.split('\r\n\r\n')[1].split('\r\n')[0]); const id = 'F' + (++n); archivos[id] = { id, ...meta, cuerpo: init.body }; return resp(200, { id, name: meta.name, webViewLink: 'https://drive/' + id });
    }],
    [/upload\/drive\/v3\/files\/F1\?uploadType=multipart/, (url, init) => { archivos.F1.cuerpo = init.body; return resp(200, { id: 'F1', name: 'x', webViewLink: 'https://drive/F1' }); }],
    [/drive\/v3\/files\/CARPETA\?fields/, () => resp(200, { id: 'CARPETA', trashed: false })],
    [/drive\/v3\/files\/F1\?alt=media/, () => resp(200, '{"_app":"faro"}', 'text/plain')]
  ]);
  await G.guardarClientId('123-abc.apps.googleusercontent.com');
  await G.token({ interactivo: true });
  const f1 = await G.guardarRespaldo('{"_app":"faro","materials":[]}', 'FARO — biocorredores.json');
  ok(f1.id === 'F1' && archivos.CARPETA.mimeType === 'application/vnd.google-apps.folder' && archivos.F1.parents[0] === 'CARPETA', 'primer guardado: crea la carpeta FARO y el archivo adentro');
  ok(g.flujos.length >= 2, 'si el token venció (401), lo renueva y reintenta');
  const f1b = await G.guardarRespaldo('{"_app":"faro","materials":[1]}', 'FARO — biocorredores.json');
  const patch = g.llamadas.at(-1);
  ok(f1b.id === 'F1' && patch.init.method === 'PATCH' && Object.keys(archivos).filter(k => k.startsWith('F')).length === 1, 'siguientes guardados: actualiza el mismo archivo');
  ok((await G.listarRespaldos()).length === 1, 'lista los proyectos guardados');
  ok((await G.descargar('F1')) === '{"_app":"faro"}', 'descarga un proyecto');
  const d = await G.crearDoc('FARO · Libro de códigos', '<h1>Libro</h1>');
  const meta = JSON.parse(archivos[d.id].cuerpo.split('\r\n\r\n')[1].split('\r\n')[0]);
  ok(meta.mimeType === 'application/vnd.google-apps.document' && archivos[d.id].cuerpo.includes('Content-Type: text/html') && archivos[d.id].cuerpo.includes('<h1>Libro</h1>'), 'crea un Google Doc a partir de HTML');

  // ---------- Docs: resaltar ----------
  const DOC = { title: 'Entrevista', body: { content: [
    { startIndex: 1, endIndex: 20, paragraph: { elements: [{ startIndex: 1, endIndex: 20, textRun: { content: 'Título de la nota\n' } }] } },
    { table: { tableRows: [{ tableCells: [{ content: [{ paragraph: { elements: [{ startIndex: 23, endIndex: 30, textRun: { content: 'celda.\n' } }] } }] }] }] } },
    { paragraph: { elements: [
      { startIndex: 31, endIndex: 50, textRun: { content: 'Ana dijo: “nadie ' } },
      { startIndex: 48, endIndex: 70, textRun: { content: 'nos preguntó” y\n' } } ] } },
    { paragraph: { elements: [{ startIndex: 64, endIndex: 80, textRun: { content: 'se fue.\n' } }] } }
  ] } };
  g = entorno();
  let lote = null;
  G = cargar(g, [
    [/userinfo/, () => resp(200, { email: 'm@x' })],
    [/documents\/DOC1:batchUpdate/, (u, init) => { lote = JSON.parse(init.body); return resp(200, {}); }],
    [/documents\/DOC1$/, () => resp(200, DOC)]
  ]);
  await G.guardarClientId('123-abc.apps.googleusercontent.com'); await G.token({ interactivo: true });
  const lectura = await G.leerDoc('DOC1');
  ok(lectura.texto.includes('celda.') && lectura.texto.includes('nadie nos preguntó'), 'lee el texto del Doc, incluidas las tablas');
  // cita copiada con comillas rectas y un salto de línea distinto
  const r = await G.resaltar('DOC1', '"nadie nos preguntó" y\r\nse fue', 'territorio');
  const rango = lote.requests[0].updateTextStyle.range;
  ok(rango.startIndex === 41 && rango.endIndex === 70, `resalta con los índices exactos de la API (${rango.startIndex}–${rango.endIndex})`);
  ok(lote.requests[0].updateTextStyle.fields === 'backgroundColor' && lote.requests[0].updateTextStyle.textStyle.backgroundColor.color.rgbColor.red > 0, 'aplica solo color de fondo');
  ok(JSON.stringify(G.colorDeCodigo('Territorio')) === JSON.stringify(G.colorDeCodigo('territorio')), 'cada código tiene siempre el mismo color');
  e = await G.resaltar('DOC1', 'esto no está', 'x').catch(x => x);
  ok(e.codigo === 'cita-no-encontrada', 'si el fragmento no está, no toca el Doc');

  // Permiso por archivo: un Doc que la persona no compartió con FARO
  g = entorno();
  G = cargar(g, [
    [/userinfo/, () => resp(200, { email: 'm@x' })],
    [/documents\/SIN\?fields/, () => resp(404, { error: { message: 'Requested entity was not found.' } })],
    [/documents\/SIN$/, () => resp(403, { error: { message: 'The caller does not have permission' } })],
    [/documents\/CON\?fields/, () => resp(200, { documentId: 'CON' })]
  ]);
  await G.guardarClientId('123-abc.apps.googleusercontent.com', 'AIzaSyEjemploEjemploEjemplo12'); await G.token({ interactivo: true });
  e = await G.leerDoc('SIN').catch(x => x);
  ok(e.codigo === 'sin-acceso-doc', 'un Doc sin acceso da un aviso claro (no un error genérico)');
  ok((await G.tieneAcceso('SIN')) === false && (await G.tieneAcceso('CON')) === true, 'distingue Docs con y sin acceso');
  const ua = new URL(await G.urlAcceso('SIN', 'en'));
  const pa = new URLSearchParams(ua.hash.slice(1));
  ok(ua.origin + ua.pathname === 'https://farocuali.github.io/Faro/acceso.html' && pa.get('doc') === 'SIN' && pa.get('cliente') === '123-abc.apps.googleusercontent.com' && pa.get('clave') === 'AIzaSyEjemploEjemploEjemplo12' && pa.get('idioma') === 'en', 'arma el enlace a la página de acceso (datos en el fragmento, no en la consulta)');
  e = await G.guardarClientId('abc.apps.googleusercontent.com').catch(x => x);
  ok(e.codigo === 'client-id-invalido', 'el Client ID tiene que empezar con el número de proyecto (lo necesita el selector)');
  e = await G.guardarClientId('123-abc.apps.googleusercontent.com', 'mala').catch(x => x);
  ok(e.codigo === 'clave-selector-invalida', 'valida la clave del selector');
})();

// ---------- Códigos guardados en el Doc (rangos con nombre) ----------
(async () => {
  await new Promise((r) => setTimeout(r, 50));
  console.log("google · rangos con nombre");
  const g = entorno();
  let lotes = [];
  const contenido = [
    { paragraph: { elements: [{ startIndex: 1, endIndex: 12, textRun: { content: "Entrevista\n" } }] } },
    { paragraph: { elements: [{ startIndex: 12, endIndex: 49, textRun: { content: "Ana: Antes acá todo era monte. Ahora\n" } }] } },
    { paragraph: { elements: [{ startIndex: 49, endIndex: 79, textRun: { content: "pasan los camiones de la soja\n" } }] } }
  ];
  // "Ahora\npasan los camiones" → índices de la API 43..67
  const doc = () => ({ title: "Ana", body: { content: contenido }, namedRanges: {
    "faro|doc_1|extractivismo": { name: "faro|doc_1|extractivismo", namedRanges: [{ namedRangeId: "x", ranges: [{ startIndex: 43, endIndex: 67 }] }] },
    "faro|doc_2|Estado%20%7C%20municipio": { name: "faro|doc_2|Estado%20%7C%20municipio", namedRanges: [{ namedRangeId: "y", ranges: [{ startIndex: 17, endIndex: 29 }] }] },
    "otro rango": { name: "otro rango", namedRanges: [{ ranges: [{ startIndex: 1, endIndex: 5 }] }] }
  } });
  const G = cargar(g, [
    [/userinfo/, () => resp(200, { email: "m@x" })],
    [/documents\/D:batchUpdate/, (u, init) => { lotes.push(JSON.parse(init.body).requests); return resp(200, {}); }],
    [/documents\/D$/, () => resp(200, doc())]
  ]);
  await G.guardarClientId("123-abc.apps.googleusercontent.com"); await G.token({ interactivo: true });
  const d = await G.leerDoc("D");
  ok(d.marcas.length === 2, "lee solo los rangos de FARO");
  const m1 = d.marcas.find((m) => m.annId === "doc_1"), m2 = d.marcas.find((m) => m.annId === "doc_2");
  ok(m1.quote === "Ahora\npasan los camiones" && d.texto.slice(m1.start, m1.end) === m1.quote, "convierte índices de la API en posiciones del texto (cruzando párrafos)");
  ok(m2.codigo === "Estado | municipio" && m2.quote === "Antes acá to", "decodifica nombres de código con «|» y espacios");
  await G.marcar("D", "los camiones de la soja", ["territorio", "paisaje"], { resaltar: true });
  const pedidos = lotes.at(-1);
  const nombres = pedidos.filter((p) => p.createNamedRange).map((p) => p.createNamedRange.name);
  const rango = pedidos[0].createNamedRange.range;
  ok(nombres.length === 2 && nombres.every((n) => /^faro\|doc_[a-z0-9]+_[a-z0-9]+\|/.test(n)) && nombres[0].endsWith("|territorio"), "crea un rango con nombre por código");
  ok(rango.startIndex === 55 && rango.endIndex === 78, `con los índices exactos de la cita (${rango.startIndex}–${rango.endIndex})`);
  ok(pedidos.some((p) => p.updateTextStyle && p.updateTextStyle.range.startIndex === 55), "y la resalta");
  await G.desmarcar("D", "doc_1");
  const p2 = lotes.at(-1);
  ok(p2[0].deleteNamedRange?.name === "faro|doc_1|extractivismo" && p2[1].updateTextStyle && !p2[1].updateTextStyle.textStyle.backgroundColor, "quitar borra el rango y el resaltado");
})();
