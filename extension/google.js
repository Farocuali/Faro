// FARO · conexión con Google (inicio de sesión, Drive y Docs). Corre en el service worker.
// Usa el Client ID que cada persona crea en Google Cloud (ver guia-google.html).

(function (global) {
  "use strict";

  const SCOPES = [
    "openid",
    "email",
    // Permiso por archivo (no sensible): FARO solo accede a los archivos que crea y a los Docs a los que
    // la persona le da acceso con el selector de Google (acceso.html en la raíz del repo). No ve el resto de su Drive.
    "https://www.googleapis.com/auth/drive.file"
  ];
  const PAGINA_ACCESO = "https://farocuali.github.io/Faro/acceso.html";
  const K = {
    clientId: "google:clientId",
    claveSelector: "google:claveSelector",
    email: "google:email",
    carpeta: "drive:carpetaId",
    respaldo: "drive:respaldoId",
    token: "google:token" // en storage.session: se borra al cerrar el navegador
  };

  const DRIVE = "https://www.googleapis.com/drive/v3";
  const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
  const DOCS = "https://docs.googleapis.com/v1/documents";

  class ErrorGoogle extends Error {
    constructor(codigo, detalle) { super(detalle || codigo); this.codigo = codigo; }
  }

  const local = chrome.storage.local;
  const sesion = chrome.storage.session;

  // Sin chrome.identity (Firefox para Android), Google vuelve a la página pública de FARO
  // y oauth-content.js le pasa el permiso a la extensión.
  const REDIRECT_WEB = "https://farocuali.github.io/Faro/";
  const hayIdentity = () => !!chrome.identity?.launchWebAuthFlow;
  const redirectActual = () => (hayIdentity() ? chrome.identity.getRedirectURL() : REDIRECT_WEB);

  async function config() {
    const d = await local.get([K.clientId, K.email, K.claveSelector]);
    const predeterminado = global.FARO_CONFIG?.clientIdPredeterminado || "";
    const propio = !!d[K.clientId];
    return {
      clientId: d[K.clientId] || predeterminado, email: d[K.email] || "", clientIdPropio: propio, hayPredeterminado: !!predeterminado,
      // Clave de API del selector de Google: va con el Client ID (la propia o la incorporada en FARO).
      claveSelector: propio ? (d[K.claveSelector] || "") : (global.FARO_CONFIG?.claveSelectorPredeterminada || ""),
      redirect: redirectActual(), redirectWeb: REDIRECT_WEB,
      redirectExtension: hayIdentity() ? chrome.identity.getRedirectURL() : "",
      flujoPestana: !hayIdentity()
    };
  }

  async function guardarClientId(id, claveSelector) {
    id = String(id || "").trim();
    if (id && !/^\d+-[\w.-]+\.apps\.googleusercontent\.com$/.test(id)) throw new ErrorGoogle("client-id-invalido", "El Client ID tiene la forma 123456789-abc.apps.googleusercontent.com");
    claveSelector = String(claveSelector || "").trim();
    if (claveSelector && !/^AIza[\w-]{20,}$/.test(claveSelector)) throw new ErrorGoogle("clave-selector-invalida", "La clave de API empieza con AIza.");
    await local.set({ [K.clientId]: id, [K.claveSelector]: claveSelector });
    await sesion.remove(K.token);
  }

  function urlAutorizacion(clientId, { silencioso, email, state }) {
    const p = new URLSearchParams({
      client_id: clientId,
      response_type: "token",
      redirect_uri: redirectActual(),
      scope: SCOPES.join(" "),
      include_granted_scopes: "true"
    });
    if (silencioso) p.set("prompt", "none");
    else p.set("prompt", "select_account consent");
    if (email) p.set("login_hint", email);
    if (state) p.set("state", state);
    return "https://accounts.google.com/o/oauth2/v2/auth?" + p;
  }

  // Valida la respuesta de Google (fragmento #access_token=…) y guarda el token.
  async function procesarRespuesta(frag, interactivo) {
    if (frag.get("error")) throw new ErrorGoogle(interactivo ? "denegado" : "requiere-login", frag.get("error"));
    const token = frag.get("access_token");
    if (!token) throw new ErrorGoogle("sin-token");
    const otorgados = (frag.get("scope") || "").split(" ");
    const faltan = SCOPES.slice(2).filter((s) => !otorgados.includes(s));
    if (faltan.length) throw new ErrorGoogle("faltan-permisos", "Para usar Drive y Docs hay que aceptar todos los permisos.");
    const vence = Date.now() + (Number(frag.get("expires_in")) || 3600) * 1000;
    await sesion.set({ [K.token]: { token, vence } });
    try {
      const r = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: "Bearer " + token } });
      if (r.ok) { const u = await r.json(); if (u.email) await local.set({ [K.email]: u.email }); }
    } catch { /* el correo es solo informativo */ }
    return token;
  }

  async function pedirToken(interactivo) {
    const { clientId, email } = await config();
    if (!clientId) throw new ErrorGoogle("sin-client-id", "Falta configurar el Client ID de Google.");

    if (!hayIdentity()) {
      // Sin ventana de inicio de sesión propia: se abre Google en una pestaña común.
      if (!interactivo) throw new ErrorGoogle("requiere-login", "Hay que volver a conectar Google.");
      const state = "faro_" + crypto.getRandomValues(new Uint32Array(4)).join("");
      await sesion.set({ "google:state": { state, desde: Date.now() } });
      await chrome.tabs.create({ url: urlAutorizacion(clientId, { silencioso: false, email, state }) });
      throw new ErrorGoogle("esperando-pestana", "Iniciá sesión en la pestaña de Google que se abrió.");
    }

    let url;
    try {
      url = await chrome.identity.launchWebAuthFlow({
        url: urlAutorizacion(clientId, { silencioso: !interactivo, email }),
        interactive: interactivo
      });
    } catch (e) {
      throw new ErrorGoogle(interactivo ? "cancelado" : "requiere-login", e.message);
    }
    return procesarRespuesta(new URLSearchParams(new URL(url).hash.slice(1)), interactivo);
  }

  // Llega desde oauth-content.js (página pública de FARO) con el fragmento de Google.
  async function recibirDesdePestana(hash) {
    const frag = new URLSearchParams(String(hash || "").replace(/^#/, ""));
    const d = await sesion.get("google:state");
    const esperado = d["google:state"];
    await sesion.remove("google:state");
    if (!esperado || frag.get("state") !== esperado.state || Date.now() - esperado.desde > 15 * 60 * 1000) {
      throw new ErrorGoogle("state-invalido", "La respuesta de Google no corresponde a un inicio de sesión de FARO.");
    }
    await procesarRespuesta(frag, true);
    return { ok: true };
  }

  async function token({ interactivo = false } = {}) {
    const d = await sesion.get(K.token);
    const t = d[K.token];
    if (t && t.vence - Date.now() > 60000) return t.token;
    try {
      return await pedirToken(false);
    } catch (e) {
      if (!interactivo) throw e;
      return pedirToken(true);
    }
  }

  async function estado() {
    const c = await config();
    let conectado = false;
    if (c.clientId && c.email) {
      try { await token(); conectado = true; } catch { conectado = false; }
    }
    return { ...c, conectado };
  }

  async function desconectar() {
    const d = await sesion.get(K.token);
    const t = d[K.token]?.token;
    if (t) { try { await fetch("https://oauth2.googleapis.com/revoke?token=" + encodeURIComponent(t), { method: "POST" }); } catch { /* sin red */ } }
    await sesion.remove(K.token);
    await local.remove([K.email]);
  }

  async function api(url, opciones = {}, { reintento = true } = {}) {
    const t = await token();
    const res = await fetch(url, { ...opciones, headers: { ...(opciones.headers || {}), Authorization: "Bearer " + t } });
    if (res.status === 401 && reintento) {
      await sesion.remove(K.token);
      return api(url, opciones, { reintento: false });
    }
    if (!res.ok) {
      let msg = "";
      try { msg = (await res.json())?.error?.message || ""; } catch { /* sin cuerpo */ }
      const codigo = res.status === 403 ? "sin-permiso" : res.status === 404 ? "no-encontrado" : res.status === 429 ? "limite" : "http-" + res.status;
      throw new ErrorGoogle(codigo, msg || "Error " + res.status);
    }
    const tipo = res.headers.get("content-type") || "";
    return tipo.includes("application/json") ? res.json() : res.text();
  }

  // ---------- Drive ----------

  async function carpeta() {
    const d = await local.get(K.carpeta);
    if (d[K.carpeta]) {
      try {
        const f = await api(`${DRIVE}/files/${d[K.carpeta]}?fields=id,trashed`);
        if (!f.trashed) return f.id;
      } catch { /* la borraron o cambió la cuenta */ }
    }
    const q = encodeURIComponent("name='FARO' and mimeType='application/vnd.google-apps.folder' and trashed=false");
    const lista = await api(`${DRIVE}/files?q=${q}&fields=files(id)&spaces=drive`);
    let id = lista.files?.[0]?.id;
    if (!id) {
      const f = await api(`${DRIVE}/files?fields=id`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "FARO", mimeType: "application/vnd.google-apps.folder" })
      });
      id = f.id;
    }
    await local.set({ [K.carpeta]: id });
    return id;
  }

  function multipart(meta, contenido, tipo) {
    const limite = "faro" + Math.random().toString(36).slice(2);
    const cuerpo =
      `--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
      `--${limite}\r\nContent-Type: ${tipo}; charset=UTF-8\r\n\r\n${contenido}\r\n--${limite}--`;
    return { body: cuerpo, headers: { "Content-Type": `multipart/related; boundary=${limite}` } };
  }

  async function guardarRespaldo(json, nombre) {
    const padre = await carpeta();
    const d = await local.get(K.respaldo);
    const campos = "id,name,modifiedTime,webViewLink";
    if (d[K.respaldo]) {
      try {
        const m = multipart({ name: nombre }, json, "application/json");
        return await api(`${UPLOAD}/files/${d[K.respaldo]}?uploadType=multipart&fields=${campos}`, { method: "PATCH", ...m });
      } catch (e) {
        if (e.codigo !== "no-encontrado") throw e;
      }
    }
    const m = multipart({ name: nombre, parents: [padre], mimeType: "application/json" }, json, "application/json");
    const f = await api(`${UPLOAD}/files?uploadType=multipart&fields=${campos}`, { method: "POST", ...m });
    await local.set({ [K.respaldo]: f.id });
    return f;
  }

  async function listarRespaldos() {
    const padre = await carpeta();
    const q = encodeURIComponent(`'${padre}' in parents and mimeType='application/json' and trashed=false`);
    const r = await api(`${DRIVE}/files?q=${q}&orderBy=modifiedTime desc&fields=files(id,name,modifiedTime,size)`);
    return r.files || [];
  }

  async function descargar(id) {
    const t = await api(`${DRIVE}/files/${encodeURIComponent(id)}?alt=media`);
    return typeof t === "string" ? t : JSON.stringify(t);
  }

  async function usarRespaldo(id) {
    await local.set({ [K.respaldo]: id });
  }

  async function crearDoc(titulo, html) {
    const padre = await carpeta();
    const m = multipart({ name: titulo, parents: [padre], mimeType: "application/vnd.google-apps.document" }, html, "text/html");
    return api(`${UPLOAD}/files?uploadType=multipart&fields=id,name,webViewLink`, { method: "POST", ...m });
  }

  // ---------- Docs ----------

  // Texto plano del Doc con el índice de la API de cada carácter (para poder resaltar).
  function textoConIndices(contenido) {
    let texto = "";
    const idx = [];
    const recorrer = (elementos) => {
      for (const el of elementos || []) {
        if (el.paragraph) {
          for (const pe of el.paragraph.elements || []) {
            const tr = pe.textRun;
            if (!tr || typeof pe.startIndex !== "number") continue;
            const c = tr.content || "";
            for (let i = 0; i < c.length; i++) { texto += c[i]; idx.push(pe.startIndex + i); }
          }
        } else if (el.table) {
          for (const fila of el.table.tableRows || []) for (const celda of fila.tableCells || []) recorrer(celda.content);
        } else if (el.tableOfContents) {
          recorrer(el.tableOfContents.content);
        }
      }
    };
    recorrer(contenido);
    return { texto, idx };
  }

  // ---------- Códigos guardados en el Doc (rangos con nombre) ----------
  // Convención compartida con el complemento de Docs (complemento-docs/Codigo.gs):
  //   nombre del rango = "faro|<id de anotación>|<código codificado con encodeURIComponent>"
  const PREFIJO_RANGO = "faro|";
  const nombreRango = (annId, codigo) => `${PREFIJO_RANGO}${annId}|${encodeURIComponent(codigo)}`;
  function leerNombreRango(nombre) {
    const partes = String(nombre).split("|");
    if (partes.length < 3 || partes[0] !== "faro") return null;
    try { return { annId: partes[1], codigo: decodeURIComponent(partes.slice(2).join("|")) }; } catch { return null; }
  }
  const nuevoAnnId = () => "doc_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);

  // Índice de la API → posición en el texto plano (idx está ordenado de menor a mayor).
  // Devuelve la primera posición cuyo índice es ≥ indiceApi (sirve para inicio y para fin exclusivo).
  function aPosicion(idx, indiceApi) {
    let lo = 0, hi = idx.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (idx[m] < indiceApi) lo = m + 1; else hi = m; }
    return lo;
  }

  // Con el permiso por archivo, un Doc que la persona todavía no compartió con FARO responde 403 o 404.
  async function leerDoc(docId) {
    let d;
    try { d = await api(`${DOCS}/${encodeURIComponent(docId)}`); }
    catch (e) {
      if (e.codigo === "sin-permiso" || e.codigo === "no-encontrado") throw new ErrorGoogle("sin-acceso-doc", "FARO todavía no tiene acceso a este Doc.");
      throw e;
    }
    const { texto, idx } = textoConIndices(d.body?.content);
    const marcas = [];
    for (const [nombre, grupo] of Object.entries(d.namedRanges || {})) {
      if (!nombre.startsWith(PREFIJO_RANGO)) continue;
      const info = leerNombreRango(nombre);
      if (!info) continue;
      for (const nr of grupo.namedRanges || []) {
        for (const r of nr.ranges || []) {
          if (r.segmentId) continue; // encabezados y pies de página: fuera del cuerpo
          const start = aPosicion(idx, r.startIndex);
          const end = aPosicion(idx, r.endIndex);
          if (end > start) marcas.push({ annId: info.annId, codigo: info.codigo, start, end, quote: texto.slice(start, end) });
        }
      }
    }
    return { titulo: d.title, texto, idx, marcas };
  }

  // Color de un código: el que eligió la persona en FARO o, si no, el de la paleta (igual que en el complemento).
  function colorDeCodigo(nombre, colores) {
    const hex = (colores || {})[String(nombre).trim().toLowerCase()] || global.FaroOps.colorPorDefecto(nombre);
    const n = parseInt(hex.slice(1), 16);
    return { red: ((n >> 16) & 255) / 255, green: ((n >> 8) & 255) / 255, blue: (n & 255) / 255 };
  }

  const pedidoColor = (startIndex, endIndex, codigo, colores) => ({
    updateTextStyle: {
      range: { startIndex, endIndex },
      textStyle: codigo ? { backgroundColor: { color: { rgbColor: colorDeCodigo(codigo, colores) } } } : {},
      fields: "backgroundColor"
    }
  });

  async function lote(docId, requests) {
    if (!requests.length) return;
    await api(`${DOCS}/${encodeURIComponent(docId)}:batchUpdate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requests })
    });
  }

  async function resaltar(docId, cita, codigo, colores) {
    const { texto, idx } = await leerDoc(docId);
    const pos = global.FaroOps.buscarCita(texto, cita);
    if (!pos) throw new ErrorGoogle("cita-no-encontrada", "No encontré ese fragmento en el Doc.");
    const startIndex = idx[pos.start];
    const endIndex = idx[pos.end - 1] + 1;
    await lote(docId, [pedidoColor(startIndex, endIndex, codigo, colores)]);
    return { startIndex, endIndex };
  }

  // Codifica dentro del Doc: un rango con nombre por código (y, si se pide, el resaltado).
  // Devuelve el Doc ya releído, con todas sus marcas, para sincronizarlo con FARO.
  async function marcar(docId, cita, codigos, { resaltar: pintar = true, colores } = {}) {
    const { texto, idx } = await leerDoc(docId);
    const pos = global.FaroOps.buscarCita(texto, cita);
    if (!pos) throw new ErrorGoogle("cita-no-encontrada", "No encontré ese fragmento en el Doc.");
    const startIndex = idx[pos.start];
    const endIndex = idx[pos.end - 1] + 1;
    const requests = codigos.map((c) => ({ createNamedRange: { name: nombreRango(nuevoAnnId(), c), range: { startIndex, endIndex } } }));
    if (pintar && codigos.length) requests.push(pedidoColor(startIndex, endIndex, codigos[0], colores));
    await lote(docId, requests);
    return leerDoc(docId);
  }

  // Quita un código del Doc: borra su rango con nombre y el resaltado de ese tramo.
  async function desmarcar(docId, annId, colores) {
    const d = await leerDoc(docId);
    const m = d.marcas.find((x) => x.annId === annId);
    if (!m) return d;
    const requests = [{ deleteNamedRange: { name: nombreRango(m.annId, m.codigo) } }];
    const otra = d.marcas.find((x) => x.annId !== annId && x.start < m.end && m.start < x.end);
    requests.push(pedidoColor(d.idx[m.start], d.idx[m.end - 1] + 1, otra ? otra.codigo : null, colores));
    await lote(docId, requests);
    return leerDoc(docId);
  }

  async function tieneAcceso(docId) {
    try { await api(`${DOCS}/${encodeURIComponent(docId)}?fields=documentId`); return true; }
    catch (e) {
      if (e.codigo === "sin-permiso" || e.codigo === "no-encontrado") return false;
      throw e;
    }
  }

  // Página pública que abre el selector de Google con este Doc (ver acceso.html en la raíz del repo).
  async function urlAcceso(docId, idioma) {
    const c = await config();
    if (!c.clientId) throw new ErrorGoogle("sin-client-id", "Falta configurar el Client ID de Google.");
    if (!c.claveSelector) throw new ErrorGoogle("sin-clave-selector", "Falta la clave de API del selector de Google.");
    const p = new URLSearchParams({ doc: docId, cliente: c.clientId, clave: c.claveSelector, idioma: idioma || "es" });
    if (c.email) p.set("cuenta", c.email);
    return `${PAGINA_ACCESO}#${p}`;
  }

  global.Google = {
    config, guardarClientId, token, estado, desconectar, recibirDesdePestana,
    guardarRespaldo, listarRespaldos, descargar, usarRespaldo, crearDoc,
    leerDoc, tieneAcceso, urlAcceso, resaltar, marcar, desmarcar, colorDeCodigo, textoConIndices, nombreRango, leerNombreRango, SCOPES, PAGINA_ACCESO
  };
})(self);
