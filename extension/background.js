// FARO — segundo plano (service worker en Chrome; página de eventos en Firefox)
// Captura desde páginas web, reparte operaciones al proyecto de FARO y habla con Google (Drive y Docs).

// En Chrome se cargan acá; en Firefox los carga el manifest antes que este archivo.
if (typeof FaroOps === "undefined" && typeof importScripts === "function") importScripts("config.js", "i18n.js", "faro-ops.js", "google.js");

// Firefox no tiene sidePanel ni offscreen: usa su barra lateral y lee el portapapeles desde el Doc.
const FIREFOX = typeof browser !== "undefined" && !!browser.sidebarAction;

const MENU_CAPTURAR = "faro-capturar";
const MENU_ABRIR = "faro-abrir";
const PREFIJO = "cap:";
const URL_FARO = chrome.runtime.getURL("faro.html");
const ES_DOCS = /^https:\/\/docs\.google\.com\/document\/d\//;

chrome.runtime.onInstalled.addListener((detalle) => {
  if (detalle?.reason === "install") chrome.tabs.create({ url: chrome.runtime.getURL("bienvenida.html") }).catch(() => {});
  if (!chrome.contextMenus) return; // Firefox para Android no tiene menú contextual
  chrome.contextMenus.create({ id: MENU_CAPTURAR, title: FaroI18n.t("Enviar a FARO"), contexts: ["selection"] });
  chrome.contextMenus.create({ id: MENU_ABRIR, title: FaroI18n.t("Abrir FARO"), contexts: ["action"] });
});

if (chrome.sidePanel) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
} else {
  // Firefox: el ícono abre/cierra la barra lateral; sin barra lateral (Android), abre FARO completo.
  chrome.action.onClicked.addListener(() => {
    if (FIREFOX && browser.sidebarAction.toggle) browser.sidebarAction.toggle();
    else abrirFaro();
  });
}

chrome.contextMenus?.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_ABRIR) { abrirFaro(); return; }
  if (info.menuItemId !== MENU_CAPTURAR) return;
  abrirPanel(tab);
  capturar(tab, info.frameId ?? 0, info.selectionText ?? "", info.pageUrl).catch(console.error);
});

chrome.commands?.onCommand.addListener((comando, tab) => {
  if (comando !== "capturar") return;
  // En Google Docs la selección no es accesible: abre el codificador de FARO dentro del Doc.
  if (tab && ES_DOCS.test(tab.url || "")) {
    chrome.tabs.sendMessage(tab.id, { tipo: "docs-abrir-codificador" }).catch(() => {});
    return;
  }
  abrirPanel(tab);
  capturar(tab, 0, "", tab?.url).catch(console.error);
});

// Tiene que llamarse en el mismo gesto del usuario (antes de cualquier await).
function abrirPanel(tab) {
  if (chrome.sidePanel) {
    if (tab && tab.windowId !== undefined) chrome.sidePanel.open({ windowId: tab.windowId }).catch(console.error);
  } else if (FIREFOX) {
    browser.sidebarAction.open().catch(console.error);
  }
}

async function leerSeleccion(tabId, frameId) {
  const [r] = await chrome.scripting.executeScript({
    target: { tabId, frameIds: [frameId] },
    func: () => (window.getSelection() ? window.getSelection().toString() : "")
  });
  return r?.result ?? "";
}

async function capturar(tab, frameId, respaldo, url) {
  let texto = respaldo;
  if (tab && typeof tab.id === "number" && tab.id >= 0) {
    try {
      const exacto = await leerSeleccion(tab.id, frameId);
      if (exacto.trim()) texto = exacto;
    } catch { /* página protegida o iframe de otro origen */ }
  }
  texto = texto.replace(/\r\n/g, "\n").trim();
  if (!texto) return;
  const c = { id: crypto.randomUUID(), texto, url: url || tab?.url || "", titulo: tab?.title || "", fecha: new Date().toISOString(), codigos: [], memo: "" };
  await chrome.storage.local.set({ [PREFIJO + c.id]: c });
}

// ---------- FARO ----------

// Las páginas propias de la extensión no se pueden buscar con tabs.query por URL.
// Chrome: runtime.getContexts. Firefox: extension.getViews (la página de eventos ve las pestañas de FARO).
async function pestanasFaro() {
  if (chrome.runtime.getContexts) {
    const ctx = await chrome.runtime.getContexts({ contextTypes: ["TAB"] });
    return ctx.filter((c) => (c.documentUrl || "").startsWith(URL_FARO) && c.tabId >= 0);
  }
  const vistas = (chrome.extension?.getViews?.({ type: "tab" }) || []).filter((v) => v.location.href.startsWith(URL_FARO));
  const salida = [];
  for (const v of vistas) {
    try { const t = await v.chrome.tabs.getCurrent(); if (t) salida.push({ tabId: t.id }); } catch { /* pestaña cerrándose */ }
  }
  return salida;
}

async function abrirFaro(matId) {
  const destino = URL_FARO + (matId ? "#mat=" + encodeURIComponent(matId) : "");
  const [c] = await pestanasFaro();
  if (c) {
    const t = await chrome.tabs.update(c.tabId, { active: true, ...(matId ? { url: destino } : {}) });
    if (chrome.windows) await chrome.windows.update(t.windowId, { focused: true }).catch(() => {});
  } else {
    await chrome.tabs.create({ url: destino });
  }
}

// Si FARO está abierto, la pestaña aplica la operación (así no se pisan cambios); si no, va directo a la base.
async function aplicarOp(op) {
  const preparada = FaroOps.prepararOp(op);
  if ((await pestanasFaro()).length) {
    try {
      const r = await chrome.runtime.sendMessage({ tipo: "faro-aplicar-op", op: preparada });
      if (r && "resultado" in r) return r.resultado;
    } catch { /* la pestaña no respondió: seguimos con la base */ }
  }
  return FaroOps.aplicarEnDB(preparada);
}

// ---------- Portapapeles (para Google Docs) ----------

async function leerPortapapeles() {
  if (!chrome.offscreen) return { texto: "", sinOffscreen: true }; // Firefox: lo lee el propio Doc
  const url = chrome.runtime.getURL("offscreen.html");
  const existe = (await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"], documentUrls: [url] })).length > 0;
  if (!existe) {
    await chrome.offscreen.createDocument({
      url, reasons: ["CLIPBOARD"],
      justification: "Leer el fragmento que copiaste en Google Docs para codificarlo en FARO."
    });
  }
  const r = await chrome.runtime.sendMessage({ tipo: "offscreen-leer-portapapeles" });
  return r?.r || { texto: "" };
}

// ---------- Texto del Doc (exportación, con la sesión de Google del navegador) ----------

async function exportarDoc(url) {
  if (!/^https:\/\/docs\.google\.com\/document\/d\/[\w-]+\/export\?format=txt$/.test(url)) throw new Error("URL no válida");
  const r = await fetch(url, { credentials: "include" });
  if (!r.ok) throw new Error("Google respondió " + r.status);
  return { texto: await r.text() };
}

// Colores elegidos en FARO (botón «+» → Colores de códigos).
async function coloresElegidos() {
  try { return (await FaroOps.leerKV([FaroOps.CLAVE_COLORES]))[FaroOps.CLAVE_COLORES] || {}; } catch { return {}; }
}

// ---------- Mensajes ----------

const ACCIONES = {
  "op": (m) => aplicarOp(m.op),
  "abrir-faro": (m) => abrirFaro(m.matId).then(() => ({ ok: true })),
  "leer-portapapeles": () => leerPortapapeles(),

  "google-estado": () => Google.estado(),
  "google-config": (m) => Google.guardarClientId(m.clientId, m.claveSelector).then(() => Google.estado()),
  "google-conectar": () => Google.token({ interactivo: true }).then(() => Google.estado()),
  "google-desconectar": () => Google.desconectar().then(() => Google.estado()),
  "google-token-web": async (m, sender) => {
    const r = await Google.recibirDesdePestana(m.hash);
    if (sender.tab?.id >= 0) chrome.tabs.remove(sender.tab.id).catch(() => {});
    return r;
  },

  "drive-guardar": (m) => Google.guardarRespaldo(m.json, m.nombre),
  "drive-listar": () => Google.listarRespaldos(),
  "drive-descargar": (m) => Google.descargar(m.id),
  "drive-usar-respaldo": (m) => Google.usarRespaldo(m.id).then(() => ({ ok: true })),
  "drive-crear-doc": (m) => Google.crearDoc(m.titulo, m.html),

  "docs-exportar": (m) => exportarDoc(m.url),
  "docs-acceso": (m) => Google.tieneAcceso(m.docId).then((acceso) => ({ acceso })),
  "docs-pedir-acceso": async (m) => {
    const url = await Google.urlAcceso(m.docId, FaroI18n.es ? "es" : "en");
    await chrome.tabs.create({ url });
    return { ok: true };
  },
  // La página de acceso avisa que la persona eligió el Doc: se cierra y se le avisa al Doc.
  "docs-acceso-ok": async (m, sender) => {
    if (sender.tab?.id >= 0) chrome.tabs.remove(sender.tab.id).catch(() => {});
    const pestanas = await chrome.tabs.query({ url: "https://docs.google.com/document/*" });
    for (const t of pestanas) chrome.tabs.sendMessage(t.id, { tipo: "docs-acceso-concedido", docId: m.docId }).catch(() => {});
    return { ok: true };
  },
  // Con Google conectado, los códigos se guardan en el Doc (rangos con nombre) y FARO se sincroniza con él.
  "docs-codificar-google": async (m) => {
    const d = await Google.marcar(m.docId, m.cita, m.codigos, { resaltar: m.resaltar, colores: await coloresElegidos() });
    const r = await aplicarOp({ tipo: "doc-sincronizar", docId: m.docId, titulo: d.titulo, texto: d.texto, marcas: d.marcas, matType: m.matType });
    return { ...r, aplicados: m.codigos };
  },
  "docs-sincronizar": async (m) => {
    const d = await Google.leerDoc(m.docId);
    return aplicarOp({ tipo: "doc-sincronizar", docId: m.docId, titulo: d.titulo, texto: d.texto, marcas: d.marcas, matType: m.matType });
  },
  "docs-desmarcar": async (m) => {
    const d = await Google.desmarcar(m.docId, m.annId, await coloresElegidos());
    return aplicarOp({ tipo: "doc-sincronizar", docId: m.docId, titulo: d.titulo, texto: d.texto, marcas: d.marcas, matType: m.matType });
  },
  "docs-texto": (m) => Google.leerDoc(m.docId).then((d) => ({ titulo: d.titulo, texto: d.texto })),
  "docs-resaltar": async (m) => Google.resaltar(m.docId, m.cita, m.codigo, await coloresElegidos())
};

chrome.runtime.onMessage.addListener((msg, sender, responder) => {
  const accion = msg && ACCIONES[msg.tipo];
  if (!accion) return false;
  Promise.resolve()
    .then(() => accion(msg, sender))
    .then((r) => responder({ ok: true, r }))
    .catch((e) => responder({ ok: false, error: { codigo: e.codigo || "error", mensaje: e.message || String(e) } }));
  return true;
});
