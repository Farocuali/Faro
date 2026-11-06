// FARO dentro de Google Docs
// Google Docs dibuja el texto en un canvas: las extensiones no pueden leer la selección.
// Flujo: seleccionás → copiás (Ctrl+C) → escribís el código en el panel de FARO.
// - Con Google conectado: el código se guarda en el Doc (rango con nombre «faro|id|código») y se resalta.
//   El Doc pasa a ser la fuente: FARO se sincroniza leyendo esos rangos (también los del complemento de Docs).
// - Sin Google: FARO ubica el fragmento en el texto exportado del Doc y lo guarda en el proyecto.

(() => {
  if (window.__faroDocs) return;
  window.__faroDocs = true;

  const ORIGEN = "https://docs.google.com";
  const esTop = window.top === window;
  const { t } = self.FaroI18n;

  // ---------- En todos los marcos: capturar lo que se copia ----------
  function alCopiar(e) {
    let texto = "";
    try { texto = e.clipboardData?.getData("text/plain") || ""; } catch { /* sin acceso */ }
    if (!texto) { try { texto = String(window.getSelection?.() || ""); } catch { /* nada */ } }
    if (!texto.trim()) return;
    if (esTop) window.dispatchEvent(new CustomEvent("faro-copia", { detail: texto }));
    else { try { window.top.postMessage({ __faro: "copia", texto }, ORIGEN); } catch { /* marco ajeno */ } }
  }
  window.addEventListener("copy", alCopiar);
  window.addEventListener("cut", alCopiar);

  // Alt+Shift+1…9: aplica el código favorito N al último fragmento copiado.
  window.addEventListener("keydown", (e) => {
    if (!e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey) return;
    const m = /^Digit([1-9])$/.exec(e.code || "");
    if (!m) return;
    e.preventDefault(); e.stopPropagation();
    const n = Number(m[1]);
    if (esTop) window.dispatchEvent(new CustomEvent("faro-atajo", { detail: n }));
    else { try { window.top.postMessage({ __faro: "atajo", n }, ORIGEN); } catch { /* marco ajeno */ } }
  }, true);

  if (!esTop) return;

  const docId = (location.pathname.match(/\/document\/d\/([^/]+)/) || [])[1];
  if (!docId) return;

  // ---------- Comunicación con la extensión ----------
  async function enviar(msg) {
    let r;
    try { r = await chrome.runtime.sendMessage(msg); }
    catch { throw Object.assign(new Error(t("FARO se actualizó: recargá esta página.")), { codigo: "recargar" }); }
    if (!r) throw new Error(t("Sin respuesta de FARO"));
    if (!r.ok) throw Object.assign(new Error(r.error?.mensaje || "Error"), { codigo: r.error?.codigo });
    return r.r;
  }
  const op = (o) => enviar({ tipo: "op", op: o });

  const tituloDoc = () => document.title.replace(/\s+-\s+(Google Docs|Documentos de Google|Google Documentos|Google Docs Editors)\s*$/i, "").trim() || "Google Doc";

  async function textoDelDoc() {
    const url = `${location.origin}/document/d/${encodeURIComponent(docId)}/export?format=txt`;
    const valido = (x) => x && !/^\s*<!doctype html/i.test(x);
    // 1) El segundo plano de la extensión: puede seguir el desvío de Google a googleusercontent.com.
    try {
      const r = await enviar({ tipo: "docs-exportar", url });
      if (valido(r.texto)) return r.texto;
    } catch { /* sigue */ }
    // 2) Desde la página misma.
    try {
      const pedir = (typeof content !== "undefined" && content.fetch) ? content.fetch.bind(content) : fetch;
      const r = await pedir(url, { credentials: "include" });
      if (r.ok) { const x = await r.text(); if (valido(x)) return x; }
    } catch { /* sigue */ }
    // 3) La API de Docs (requiere haber conectado Google en FARO).
    try {
      const d = await enviar({ tipo: "docs-texto", docId });
      return d.texto;
    } catch (e) {
      throw new Error(t("No pude leer el texto del Doc. Revisá que tengas acceso al documento y que esté permitido descargarlo."));
    }
  }

  // ---------- Estado ----------
  let ultimaCopia = "";
  let ultimaCopiaHora = 0;
  let googleConectado = false;
  let accesoDoc = false;      // con el permiso por archivo, la persona le da acceso a FARO a cada Doc una vez
  let abierto = false;
  let matId = null;

  window.addEventListener("faro-copia", (e) => recibirCopia(e.detail));
  window.addEventListener("message", (e) => {
    if (e.origin !== ORIGEN || !e.data) return;
    if (e.data.__faro === "copia" && typeof e.data.texto === "string") recibirCopia(e.data.texto);
    if (e.data.__faro === "atajo" && Number.isInteger(e.data.n)) aplicarFavorito(e.data.n);
  });
  function recibirCopia(x) {
    ultimaCopia = String(x).replace(/\r\n?/g, "\n").trim();
    ultimaCopiaHora = Date.now();
    if (abierto) { mostrarFragmento(); ui.codigo.focus(); }
  }

  // ---------- Interfaz (Shadow DOM, aislada de Docs) ----------
  const host = document.createElement("div");
  host.id = "faro-docs";
  host.style.cssText = "position:fixed;right:20px;bottom:20px;z-index:2147483000;";
  // Que Docs no se quede con el teclado ni los clics de FARO.
  ["keydown", "keyup", "keypress", "input", "paste", "copy", "cut", "mousedown", "mouseup", "click", "dblclick", "wheel", "contextmenu", "focusin", "focusout", "beforeinput"]
    .forEach((ev) => host.addEventListener(ev, (e) => e.stopPropagation()));
  const raiz = host.attachShadow({ mode: "open" });
  const icono = chrome.runtime.getURL("icons/icon48.png");
  const esc = (x) => String(x ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  raiz.innerHTML = `
  <style>
    :host { all: initial; }
    * { box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
    .boton {
      display: flex; align-items: center; gap: 8px; cursor: pointer;
      background: #1f3a5f; color: #fff; border: 0; border-radius: 999px;
      padding: 6px 14px 6px 6px; font-size: 13px; font-weight: 600; letter-spacing: .04em;
      box-shadow: 0 4px 14px rgba(15,26,49,.3);
    }
    .boton img { width: 26px; height: 26px; border-radius: 7px; }
    .boton:hover { background: #18304f; }
    .panel {
      width: 350px; max-height: min(680px, calc(100vh - 40px)); overflow: auto;
      background: #fbf8f1; color: #1d2433; border: 1px solid #e2ded4; border-radius: 14px;
      box-shadow: 0 12px 40px rgba(15,26,49,.28); font-size: 13px; line-height: 1.45;
    }
    .cab { display: flex; align-items: center; gap: 8px; padding: 10px 12px; background: #1f3a5f; color: #fff; border-radius: 14px 14px 0 0; position: sticky; top: 0; z-index: 1; }
    .cab img { width: 24px; height: 24px; border-radius: 6px; }
    .cab b { letter-spacing: .08em; }
    .cab .estado { margin-left: auto; font-size: 11px; opacity: .85; text-align: right; }
    .cerrar { background: none; border: 0; color: #fff; font-size: 18px; cursor: pointer; padding: 0 2px 0 6px; }
    .modo { font-size: 11.5px; padding: 6px 12px; background: #eef3f9; color: #1f3a5f; border-bottom: 1px solid #e2ded4; }
    .modo.local { background: #fbeed8; color: #6b4a12; }
    .modo .btn { display: block; margin-top: 6px; }
    .sec { padding: 12px; border-bottom: 1px solid #e2ded4; }
    .sec:last-child { border-bottom: 0; }
    .tit { font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #5f6778; margin-bottom: 6px; }
    .paso { color: #5f6778; font-size: 12px; margin: 0 0 8px; }
    kbd { border: 1px solid #d5d0c4; border-bottom-width: 2px; border-radius: 4px; padding: 0 4px; font-size: 11px; background: #fff; }
    .frag {
      margin: 0 0 8px; padding: 8px 10px; background: #fff; border: 1px solid #e2ded4; border-left: 3px solid #e8a33d;
      border-radius: 6px; max-height: 120px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12.5px;
    }
    .frag.vacio { color: #8a8f9c; font-style: italic; border-left-color: #e2ded4; }
    .fila { display: flex; gap: 6px; align-items: center; }
    input[type=text], select {
      width: 100%; font-size: 13px; padding: 7px 9px; border: 1px solid #d5d0c4; border-radius: 7px; background: #fff; color: #1d2433;
    }
    input:focus, select:focus, button:focus-visible { outline: 2px solid #e8a33d; outline-offset: -1px; }
    .btn { font-size: 12.5px; font-weight: 600; border-radius: 7px; padding: 7px 12px; cursor: pointer; border: 1px solid #1f3a5f; background: #1f3a5f; color: #fff; white-space: nowrap; }
    .btn.sec2 { background: #fff; color: #1f3a5f; }
    .btn:disabled { opacity: .45; cursor: default; }
    .link { background: none; border: 0; color: #1f3a5f; text-decoration: underline; cursor: pointer; font-size: 12px; padding: 0; }
    label.chk { display: flex; gap: 6px; align-items: center; font-size: 12px; margin: 8px 0 0; color: #1d2433; }
    .msg { font-size: 12px; margin-top: 8px; padding: 6px 8px; border-radius: 6px; }
    .msg.ok { background: #e3f1e6; color: #1f5c32; }
    .msg.error { background: #fbe7e3; color: #8c2f1f; }
    .msg.info { background: #eef3f9; color: #1f3a5f; }
    .chips { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; }
    .chip { font-size: 11.5px; background: #fbeed8; border-radius: 999px; padding: 2px 9px; }
    .acciones { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
    ul.frags { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; max-height: 220px; overflow: auto; }
    ul.frags li { display: flex; gap: 6px; align-items: flex-start; background: #fff; border: 1px solid #e2ded4; border-radius: 6px; padding: 5px 6px 5px 8px; font-size: 12px; }
    ul.frags li .q { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; color: #3a4252; }
    ul.frags li .c { font-weight: 600; color: #1f3a5f; white-space: nowrap; }
    ul.frags li.perdido .q { text-decoration: line-through; color: #8a8f9c; }
    ul.frags li button { border: 0; background: none; color: #8a8f9c; cursor: pointer; font-size: 15px; line-height: 1; padding: 0 2px; }
    ul.frags li button:hover { color: #8c2f1f; }
    .cab { cursor: grab; user-select: none; }
    .cab.arrastrando { cursor: grabbing; }
    .min { background: none; border: 0; color: #fff; font-size: 18px; cursor: pointer; padding: 0 4px; line-height: 1; }
    .pestanas { display: flex; border-bottom: 1px solid #e2ded4; background: #fff; }
    .pestanas button { flex: 1; border: 0; background: none; padding: 8px 4px; font-size: 12.5px; font-weight: 600; color: #5f6778; cursor: pointer; border-bottom: 2px solid transparent; }
    .pestanas button[aria-selected="true"] { color: #1f3a5f; border-bottom-color: #e8a33d; }
    .favs { display: flex; flex-wrap: wrap; gap: 4px; margin: 0 0 8px; }
    .fav { font-size: 11.5px; border: 1px solid rgba(0,0,0,.08); border-radius: 999px; padding: 2px 8px; cursor: pointer; color: #1d2433; }
    .fav b { font-weight: 700; margin-right: 3px; color: #5f6778; }
    .def { margin-top: 8px; padding: 8px 10px; background: #fff; border: 1px solid #e2ded4; border-radius: 6px; font-size: 12px; color: #3a4252; }
    .def b { color: #1d2433; }
    .def p { margin: 3px 0 0; }
    .muestra { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 5px; vertical-align: -1px; border: 1px solid rgba(0,0,0,.12); }
    .aviso { margin-top: 8px; font-size: 12px; padding: 6px 8px; border-radius: 6px; background: #fbeed8; color: #6b4a12; }
    ul.citas { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; max-height: 330px; overflow: auto; }
    ul.citas li { background: #fff; border: 1px solid #e2ded4; border-radius: 6px; padding: 7px 8px; font-size: 12.5px; }
    ul.citas .q { white-space: pre-wrap; }
    .memo { color: #1f3a5f; font-style: italic; font-size: 11.5px; margin-top: 3px; white-space: pre-wrap; }
    .memo-edit { display: flex; flex-direction: column; gap: 4px; margin-top: 4px; width: 100%; }
    ul.frags li .memo, ul.frags li .memo-edit { flex-basis: 100%; }
    ul.frags li .memo-edit .btn { font-size: 11.5px; padding: 4px 9px; border: 1px solid #1f3a5f; background: #1f3a5f; color: #fff; }
    ul.frags li .memo-edit .btn.sec2 { background: #fff; color: #1f3a5f; }
    ul.frags li .memo-edit .btn:not(.sec2):hover { color: #fff; }
    ul.frags li { flex-wrap: wrap; }
    .memo-edit textarea { font: inherit; font-size: 12px; border: 1px solid #c9c3b6; border-radius: 6px; padding: 5px; resize: vertical; min-height: 44px; }
    ul.citas .ref { color: #5f6778; font-size: 11.5px; margin-top: 3px; }
    ul.citas .fila { justify-content: flex-end; margin-top: 4px; }
    .btn.chico { font-size: 11.5px; padding: 4px 9px; }
    [hidden] { display: none !important; }
  </style>
  <button class="boton" id="abrir" title="${esc(t("FARO: codificar este Doc (Alt+Shift+F)"))}"><img src="${icono}" alt="">FARO</button>
  <div class="panel" id="panel" hidden role="dialog" aria-label="FARO">
    <div class="cab" id="cab" title="${esc(t("Arrastrá para mover"))}"><img src="${icono}" alt=""><b>FARO</b><span class="estado" id="estado"></span><button class="min" id="minimizar" aria-label="${esc(t("Minimizar"))}" title="${esc(t("Minimizar"))}">–</button><button class="cerrar" id="cerrar" aria-label="${esc(t("Ocultar FARO en esta página"))}" title="${esc(t("Ocultar FARO en esta página (vuelve con Alt+Shift+F)"))}">×</button></div>
    <div class="pestanas" role="tablist">
      <button role="tab" id="tab-codificar" aria-selected="true">${t("Codificar")}</button>
      <button role="tab" id="tab-citar" aria-selected="false">${t("Citar en tu texto")}</button>
    </div>
    <div class="modo" id="modo" hidden></div>

    <div id="vista-codificar">
    <div class="sec">
      <div class="tit">${t("Codificar un fragmento")}</div>
      <p class="paso">${t("Seleccioná texto en el Doc y copialo con <kbd>Ctrl</kbd>+<kbd>C</kbd> (<kbd>⌘</kbd>+<kbd>C</kbd> en Mac).")}</p>
      <div class="frag vacio" id="frag"></div>
      <div class="fila" style="margin-bottom:8px"><button class="link" id="leer">${t("Usar lo que tengo en el portapapeles")}</button></div>
      <div class="favs" id="favs"></div>
      <div class="fila">
        <input type="text" id="codigo" list="codigos" placeholder="${esc(t("Código (o varios, con comas)"))}" autocomplete="off" spellcheck="false">
        <datalist id="codigos"></datalist>
        <button class="btn" id="codificar">${t("Codificar")}</button>
      </div>
      <div class="def" id="definicion" hidden></div>
      <label class="chk" id="chk-resaltar"><input type="checkbox" id="resaltar"> ${t("Resaltar el fragmento en el Doc")}</label>
      <div class="msg" id="msg" hidden></div>
    </div>

    <div class="sec" id="sec-frags" hidden>
      <div class="tit">${t("Codificado en este Doc")}</div>
      <div class="chips" id="chips"></div>
      <ul class="frags" id="frags"></ul>
    </div>

    <div class="sec">
      <div class="tit">${t("Este Doc en FARO")}</div>
      <select id="tipo" aria-label="${esc(t("Tipo de material"))}">
        <option value="notas-campo">${t("Notas de campo")}</option>
        <option value="entrevistas">${t("Entrevista")}</option>
        <option value="documentos">${t("Documento / bibliografía")}</option>
      </select>
      <div class="acciones">
        <button class="btn sec2" id="importar">${t("Importar / actualizar")}</button>
        <button class="btn sec2" id="ver">${t("Abrir en FARO")} ↗</button>
      </div>
      <div class="aviso" id="aviso-nombres" hidden></div>
      <div class="msg" id="msg2" hidden></div>
    </div>
    </div>

    <div id="vista-citar" hidden>
      <div class="sec">
        <div class="tit">${t("Citar fragmentos en tu texto")}</div>
        <p class="paso">${t("Elegí un código: aparecen sus fragmentos de todo el proyecto. «Copiar» y pegalo (Ctrl+V) donde quieras en tu tesis.")}</p>
        <select id="citar-codigo" aria-label="${esc(t("Código"))}"></select>
        <div class="aviso" id="citar-seud" hidden></div>
        <ul class="citas" id="citas"></ul>
        <div class="acciones"><button class="btn sec2" id="copiar-todas" hidden>${t("Copiar todas")}</button></div>
        <div class="msg" id="msg3" hidden></div>
      </div>
    </div>
  </div>`;

  const $ = (id) => raiz.getElementById(id);
  const ui = Object.fromEntries(["abrir", "panel", "cab", "minimizar", "cerrar", "estado", "modo", "frag", "leer", "codigo", "codigos", "codificar", "resaltar", "chk-resaltar", "msg", "sec-frags", "chips", "frags", "tipo", "importar", "ver", "msg2",
    "favs", "definicion", "aviso-nombres", "tab-codificar", "tab-citar", "vista-codificar", "vista-citar", "citar-codigo", "citar-seud", "citas", "copiar-todas", "msg3"]
    .map((id) => [id.replace(/-(\w)/g, (_, c) => c.toUpperCase()), $(id)]));

  function mensaje(el, tipo, texto) {
    el.hidden = !texto;
    el.className = "msg " + (tipo || "");
    el.textContent = texto || "";
  }

  function mostrarFragmento() {
    const vacio = !ultimaCopia;
    ui.frag.classList.toggle("vacio", vacio);
    ui.frag.textContent = vacio ? t("Todavía no copiaste ningún fragmento.") : ultimaCopia;
    ui.codificar.disabled = vacio;
  }

  const enDoc = () => googleConectado && accesoDoc;

  function mostrarModo() {
    ui.modo.hidden = false;
    ui.modo.className = "modo" + (enDoc() ? "" : " local");
    ui.modo.replaceChildren();
    if (enDoc()) {
      ui.modo.textContent = t("Google conectado: los códigos se guardan dentro del Doc y siguen al texto aunque lo edites.");
    } else if (googleConectado) {
      ui.modo.append(document.createTextNode(t("Para guardar los códigos dentro de este Doc, FARO necesita tu permiso para este Doc (una sola vez). Mientras tanto, se guardan en FARO.")));
      const b = document.createElement("button");
      b.className = "btn chico";
      b.textContent = t("Dar acceso a FARO a este Doc");
      b.addEventListener("click", pedirAcceso);
      ui.modo.append(b);
    } else {
      ui.modo.textContent = t("Sin Google: los códigos se guardan en FARO. Conectá Google (botón G en FARO) para guardarlos también en el Doc.");
    }
    ui.chkResaltar.hidden = !enDoc();
    ui.importar.textContent = enDoc() ? t("Sincronizar con el Doc") : t("Importar / actualizar");
  }

  async function pedirAcceso() {
    try {
      await enviar({ tipo: "docs-pedir-acceso", docId });
      mensaje(ui.msg, "info", t("Se abrió el selector de Google en otra pestaña: elegí este Doc y tocá «Seleccionar».")); 
    } catch (e) {
      mensaje(ui.msg, "error", e.codigo === "sin-clave-selector"
        ? t("Falta la clave de API del selector de Google: configurala en FARO (botón G).")
        : e.message);
    }
  }

  async function actualizarResumen() {
    try {
      const r = await op({ tipo: "doc-resumen", docId });
      matId = r.existe ? r.matId : null;
      ui.estado.textContent = r.existe
        ? t(r.total === 1 ? "{n} fragmento codificado" : "{n} fragmentos codificados", { n: r.total })
        : t("Todavía no está en FARO");
      if (r.existe && r.tipo) ui.tipo.value = r.tipo;
      revisarNombres();
      ui.ver.disabled = !r.existe;
      const pares = Object.entries(r.porCodigo || {}).sort((a, b) => b[1] - a[1]);
      ui.secFrags.hidden = !(r.fragmentos || []).length;
      ui.chips.replaceChildren(...pares.map(([c, n]) => {
        const s = document.createElement("span");
        s.className = "chip";
        s.textContent = `${c} · ${n}`;
        return s;
      }));
      ui.frags.replaceChildren(...(r.fragmentos || []).slice().reverse().map((f) => {
        const li = document.createElement("li");
        if (f.lost) li.classList.add("perdido");
        li.title = f.lost ? t("Este fragmento ya no está en el Doc") : f.quote;
        const c = document.createElement("span"); c.className = "c"; c.textContent = f.codigo;
        const q = document.createElement("span"); q.className = "q"; q.textContent = f.quote;
        const b = document.createElement("button");
        b.textContent = "×";
        b.setAttribute("aria-label", t("Quitar «{c}» de este fragmento", { c: f.codigo }));
        b.addEventListener("click", () => quitar(f));
        const bm = document.createElement("button");
        bm.textContent = "✎"; bm.className = "memo-btn";
        bm.title = f.memo ? f.memo : t("Escribir un memo sobre este fragmento");
        bm.setAttribute("aria-label", t("Memo del fragmento"));
        if (f.memo) bm.style.color = "#1f3a5f";
        bm.addEventListener("click", () => editarMemo(li, f));
        li.append(c, q, bm, b);
        if (f.memo) { const m = document.createElement("div"); m.className = "memo"; m.textContent = "✎ " + f.memo; li.append(m); }
        return li;
      }));
    } catch (e) {
      ui.estado.textContent = "";
      mensaje(ui.msg, "error", e.message);
    }
  }

  let codigosProyecto = []; // [{code, desc, incl, excl, ejemplo, color, usos}] — los más usados primero

  async function revisarNombres() {
    try {
      const r = await op({ tipo: "nombres-reales", docId });
      ui.avisoNombres.hidden = !r.cantidad;
      ui.avisoNombres.textContent = r.cantidad
        ? t(r.cantidad === 1 ? "Este Doc tiene {n} nombre real de tu diccionario de seudónimos. FARO lo reemplaza al citar y al exportar, pero el Doc lo sigue teniendo." : "Este Doc tiene {n} nombres reales de tu diccionario de seudónimos. FARO los reemplaza al citar y al exportar, pero el Doc los sigue teniendo.", { n: r.cantidad })
        : "";
    } catch { ui.avisoNombres.hidden = true; }
  }

  async function cargarCodigos() {
    try {
      const r = await op({ tipo: "codigos" });
      codigosProyecto = r.codigos || [];
    } catch { codigosProyecto = []; }
    ui.codigos.replaceChildren(...codigosProyecto.map((c) => { const o = document.createElement("option"); o.value = c.code; return o; }));
    ui.favs.replaceChildren(...codigosProyecto.slice(0, 9).map((c, i) => {
      const b = document.createElement("button");
      b.className = "fav";
      b.style.background = c.color;
      b.title = t("Alt+Shift+{n} aplica «{c}» al último fragmento copiado", { n: i + 1, c: c.code });
      const n = document.createElement("b"); n.textContent = String(i + 1);
      b.append(n, document.createTextNode(c.code));
      b.addEventListener("click", () => agregarCodigoAlCampo(c.code));
      return b;
    }));
    mostrarDefinicion();
    llenarSelectorCitas();
  }

  function agregarCodigoAlCampo(codigo) {
    const actuales = ui.codigo.value.split(",").map((x) => x.trim()).filter(Boolean);
    if (!actuales.some((x) => x.toLowerCase() === codigo.toLowerCase())) actuales.push(codigo);
    ui.codigo.value = actuales.join(", ");
    ui.codigo.focus();
    mostrarDefinicion();
  }

  // Muestra la definición del último código escrito, si existe en el libro de códigos.
  function mostrarDefinicion() {
    const ultimo = ui.codigo.value.split(",").map((x) => x.trim()).filter(Boolean).pop() || "";
    const c = codigosProyecto.find((x) => x.code.toLowerCase() === ultimo.toLowerCase());
    if (!c) { ui.definicion.hidden = true; return; }
    const partes = [];
    if (c.desc) partes.push(["", c.desc]);
    if (c.incl) partes.push([t("Cuándo aplicarlo: "), c.incl]);
    if (c.excl) partes.push([t("Cuándo no: "), c.excl]);
    if (c.ejemplo) partes.push([t("Ejemplo: "), c.ejemplo]);
    ui.definicion.replaceChildren();
    const tit = document.createElement("div");
    const mu = document.createElement("span"); mu.className = "muestra"; mu.style.background = c.color;
    const nb = document.createElement("b"); nb.textContent = c.code;
    const us = document.createTextNode(" · " + t(c.usos === 1 ? "{n} uso" : "{n} usos", { n: c.usos }));
    tit.append(mu, nb, us);
    ui.definicion.append(tit);
    if (!partes.length) {
      const p = document.createElement("p"); p.textContent = t("Este código todavía no tiene definición en el libro de códigos de FARO."); ui.definicion.append(p);
    }
    for (const [etq, txt] of partes) {
      const p = document.createElement("p");
      if (etq) { const b = document.createElement("b"); b.textContent = etq; p.append(b); }
      p.append(document.createTextNode(txt));
      ui.definicion.append(p);
    }
    ui.definicion.hidden = false;
  }

  async function aplicarFavorito(n) {
    if (!codigosProyecto.length) await cargarCodigos();
    const c = codigosProyecto[n - 1];
    if (!c) return;
    if (!abierto) await abrir();
    mostrarVista("codificar");
    ui.codigo.value = c.code;
    mostrarDefinicion();
    codificar();
  }
  window.addEventListener("faro-atajo", (e) => aplicarFavorito(e.detail));

  async function revisarGoogle() {
    try {
      const est = await enviar({ tipo: "google-estado" });
      googleConectado = !!est.conectado;
    } catch { googleConectado = false; }
    accesoDoc = false;
    if (googleConectado) {
      try { accesoDoc = !!(await enviar({ tipo: "docs-acceso", docId })).acceso; } catch { accesoDoc = false; }
    }
    const pref = await chrome.storage.local.get("docs:resaltar");
    ui.resaltar.checked = pref["docs:resaltar"] !== false;
    mostrarModo();
  }

  async function abrir() {
    abierto = true;
    ui.abrir.hidden = true;
    ui.panel.hidden = false;
    if (host.style.left) requestAnimationFrame(() => ubicar({ x: parseFloat(host.style.left), y: parseFloat(host.style.top) }));
    mostrarFragmento();
    mensaje(ui.msg, "", "");
    mensaje(ui.msg2, "", "");
    ui.codigo.focus();
    await revisarGoogle();
    await Promise.all([actualizarResumen(), cargarCodigos()]);
  }

  function cerrar() {
    abierto = false;
    ui.panel.hidden = true;
    ui.abrir.hidden = false;
  }

  async function leerPortapapeles() {
    try {
      let r = await enviar({ tipo: "leer-portapapeles" });
      // Firefox no tiene documentos ocultos: con el permiso clipboardRead, el Doc lo lee directo.
      if (r.sinOffscreen) r = { texto: await navigator.clipboard.readText() };
      if (r.texto && r.texto.trim()) { ultimaCopia = r.texto.replace(/\r\n?/g, "\n").trim(); ultimaCopiaHora = Date.now(); }
      else mensaje(ui.msg, "error", t("El portapapeles está vacío. Copiá un fragmento del Doc."));
    } catch (e) { mensaje(ui.msg, "error", e.message); }
    mostrarFragmento();
  }

  const textoNoEncontrado = () => t("No encontré ese fragmento en este Doc. ¿Lo copiaste de este documento?");

  async function codificar() {
    const codigos = [...new Set(ui.codigo.value.split(",").map((s) => s.trim()).filter(Boolean))];
    if (!ultimaCopia) { mensaje(ui.msg, "error", t("Primero copiá un fragmento del Doc (Ctrl+C).")); return; }
    if (!codigos.length) { mensaje(ui.msg, "error", t("Escribí un código.")); ui.codigo.focus(); return; }
    ui.codificar.disabled = true;
    mensaje(ui.msg, "info", t("Codificando…"));
    try {
      let aviso;
      if (enDoc()) {
        let r;
        try {
          r = await enviar({ tipo: "docs-codificar-google", docId, cita: ultimaCopia, codigos, resaltar: ui.resaltar.checked, matType: ui.tipo.value });
        } catch (e) {
          if (e.codigo === "cita-no-encontrada") throw new Error(textoNoEncontrado());
          if (e.codigo === "sin-acceso-doc") { accesoDoc = false; mostrarModo(); return codificar(); }
          if (!["requiere-login", "sin-token", "esperando-pestana"].includes(e.codigo)) throw e;
          googleConectado = false; mostrarModo(); // la sesión venció: seguimos sin Google
          return codificar();
        }
        matId = r.matId;
        aviso = t("✓ Codificado como {c} y guardado en el Doc.", { c: codigos.map((c) => `«${c}»`).join(", ") });
      } else {
        const texto = await textoDelDoc();
        let perdidas = 0;
        for (const codigo of codigos) {
          const r = await op({ tipo: "doc-codificar", docId, titulo: tituloDoc(), texto, cita: ultimaCopia, codigo, matType: ui.tipo.value });
          if (r.error === "cita-no-encontrada") throw new Error(textoNoEncontrado());
          if (r.error) throw new Error(r.error);
          perdidas = Math.max(perdidas, r.perdidas || 0);
          matId = r.matId;
        }
        aviso = t("✓ Codificado como {c}.", { c: codigos.map((c) => `«${c}»`).join(", ") });
        if (perdidas) aviso += " " + t("({n} fragmento(s) anteriores ya no están en el Doc y quedaron marcados en FARO.)", { n: perdidas });
      }
      mensaje(ui.msg, "ok", aviso);
      ui.codigo.value = "";
      ui.definicion.hidden = true;
      await Promise.all([actualizarResumen(), cargarCodigos()]);
    } catch (e) {
      mensaje(ui.msg, "error", e.message);
    } finally {
      ui.codificar.disabled = !ultimaCopia;
      ui.codigo.focus();
    }
  }

  function editarMemo(li, f) {
    if (li.querySelector(".memo-edit")) return;
    li.style.flexWrap = "wrap";
    const caja = document.createElement("div"); caja.className = "memo-edit";
    const ta = document.createElement("textarea"); ta.value = f.memo || ""; ta.placeholder = t("Qué pensaste al codificar esto…");
    const fila = document.createElement("div"); fila.className = "fila";
    const ok = document.createElement("button"); ok.className = "btn chico"; ok.textContent = t("Guardar memo");
    const no = document.createElement("button"); no.className = "btn sec2 chico"; no.textContent = t("Cancelar");
    ok.addEventListener("click", async () => {
      try {
        await op({ tipo: "memo-guardar", annId: f.annId, texto: ta.value });
        mensaje(ui.msg2, "ok", ta.value.trim() ? t("✓ Memo guardado.") : t("Se borró el memo."));
        await actualizarResumen();
      } catch (e) { mensaje(ui.msg2, "error", e.message); }
    });
    no.addEventListener("click", () => caja.remove());
    fila.append(no, ok); caja.append(ta, fila); li.append(caja); ta.focus();
  }

  async function quitar(f) {
    try {
      if (f.enDoc && enDoc()) await enviar({ tipo: "docs-desmarcar", docId, annId: f.annId, matType: ui.tipo.value });
      else await op({ tipo: "quitar-ann", matId, annId: f.annId });
      mensaje(ui.msg2, "ok", t("Se quitó «{c}».", { c: f.codigo }));
      await actualizarResumen();
    } catch (e) {
      mensaje(ui.msg2, "error", e.codigo === "requiere-login" ? t("Para quitar un código guardado en el Doc, conectá Google en FARO.") : e.message);
    }
  }

  async function importar() {
    ui.importar.disabled = true;
    mensaje(ui.msg2, "info", t("Leyendo el Doc…"));
    try {
      if (enDoc()) {
        const r = await enviar({ tipo: "docs-sincronizar", docId, matType: ui.tipo.value });
        matId = r.matId;
        const partes = [];
        if (r.creado) partes.push(t("Importado a FARO."));
        if (r.nuevas) partes.push(t("{n} código(s) nuevo(s) desde el Doc.", { n: r.nuevas }));
        if (r.quitadas) partes.push(t("{n} código(s) que ya no están en el Doc se quitaron.", { n: r.quitadas }));
        if (r.perdidas) partes.push(t("{n} fragmento(s) sin respaldo en el Doc quedaron marcados.", { n: r.perdidas }));
        mensaje(ui.msg2, "ok", "✓ " + (partes.join(" ") || t("FARO y el Doc ya estaban sincronizados.")));
      } else {
        const texto = await textoDelDoc();
        const r = await op({ tipo: "doc-importar", docId, titulo: tituloDoc(), texto, matType: ui.tipo.value });
        matId = r.matId;
        mensaje(ui.msg2, "ok", r.creado ? t("✓ Importado a FARO.") : r.cambiado
          ? t("✓ Texto actualizado.") + (r.perdidas ? " " + t("{n} fragmento(s) ya no están en el Doc y quedaron marcados.", { n: r.perdidas }) : "")
          : t("✓ Ya estaba al día."));
      }
      await actualizarResumen();
    } catch (e) {
      mensaje(ui.msg2, "error", e.message);
    } finally {
      ui.importar.disabled = false;
    }
  }

  // ---------- Pestañas ----------
  function mostrarVista(v) {
    const citar = v === "citar";
    ui.tabCodificar.setAttribute("aria-selected", String(!citar));
    ui.tabCitar.setAttribute("aria-selected", String(citar));
    ui.vistaCodificar.hidden = citar;
    ui.vistaCitar.hidden = !citar;
    if (citar) cargarCitas();
  }
  ui.tabCodificar.addEventListener("click", () => mostrarVista("codificar"));
  ui.tabCitar.addEventListener("click", () => mostrarVista("citar"));

  // ---------- Citar en tu texto ----------
  let citasActuales = [];
  const NOMBRES_TIPO = { "notas-campo": () => t("Notas de campo"), entrevistas: () => t("Entrevista"), documentos: () => t("Documento") };
  const referencia = (c) => [c.fuente, c.fecha].filter(Boolean).join(", ");
  const textoCita = (c) => `«${c.quote.replace(/\s+/g, " ").trim()}» (${referencia(c)})`;

  function llenarSelectorCitas() {
    const previo = ui.citarCodigo.value;
    ui.citarCodigo.replaceChildren(...codigosProyecto.filter((c) => c.usos > 0).map((c) => {
      const o = document.createElement("option");
      o.value = c.code;
      o.textContent = `${c.code} (${c.usos})`;
      return o;
    }));
    if (previo && codigosProyecto.some((c) => c.code === previo)) ui.citarCodigo.value = previo;
  }

  async function cargarCitas() {
    const codigo = ui.citarCodigo.value;
    ui.citas.replaceChildren();
    ui.copiarTodas.hidden = true;
    mensaje(ui.msg3, "", "");
    if (!codigo) { mensaje(ui.msg3, "info", t("Todavía no hay fragmentos codificados en el proyecto.")); return; }
    try {
      const r = await op({ tipo: "citas", codigo });
      citasActuales = r.citas || [];
      ui.citarSeud.hidden = !r.seudonimos;
      ui.citarSeud.textContent = r.seudonimos ? t("Con seudónimos: los nombres de tu diccionario se reemplazan en las citas.") : "";
      ui.citas.replaceChildren(...citasActuales.map((c) => {
        const li = document.createElement("li");
        const q = document.createElement("div"); q.className = "q"; q.textContent = `«${c.quote}»`;
        const ref = document.createElement("div"); ref.className = "ref"; ref.textContent = `${referencia(c)} · ${(NOMBRES_TIPO[c.tipo] || (() => ""))()}`;
        const fila = document.createElement("div"); fila.className = "fila";
        const b = document.createElement("button"); b.className = "btn sec2 chico"; b.textContent = t("Copiar");
        b.addEventListener("click", () => copiar([c], b));
        fila.append(b);
        if (c.memo) {
          const bm = document.createElement("button"); bm.className = "btn sec2 chico"; bm.textContent = t("Copiar con memo");
          bm.addEventListener("click", () => copiar([c], bm, true));
          fila.append(bm);
        }
        li.append(q, ref);
        if (c.memo) { const m = document.createElement("div"); m.className = "memo"; m.textContent = "✎ " + c.memo; li.append(m); }
        li.append(fila);
        return li;
      }));
      ui.copiarTodas.hidden = citasActuales.length < 2;
    } catch (e) { mensaje(ui.msg3, "error", e.message); }
  }
  ui.citarCodigo.addEventListener("change", cargarCitas);

  async function copiar(lista, boton, conMemo = false) {
    const nota = (c) => conMemo && c.memo ? c.memo.replace(/\s+/g, " ").trim() : "";
    const texto = lista.map((c) => textoCita(c) + (nota(c) ? "\n" + nota(c) : "")).join("\n\n");
    const html = lista.map((c) => `<p>«${esc(c.quote.replace(/\s+/g, " ").trim())}» (${esc(referencia(c))})</p>` + (nota(c) ? `<p><i>${esc(nota(c))}</i></p>` : "")).join("");
    try {
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ "text/plain": new Blob([texto], { type: "text/plain" }), "text/html": new Blob([html], { type: "text/html" }) })]);
      } else {
        await navigator.clipboard.writeText(texto);
      }
      mensaje(ui.msg3, "ok", t(lista.length === 1 ? "✓ Cita copiada. Pegala con Ctrl+V donde quieras." : "✓ {n} citas copiadas. Pegalas con Ctrl+V donde quieras.", { n: lista.length }));
      if (boton) { const o = boton.textContent; boton.textContent = "✓"; setTimeout(() => { boton.textContent = o; }, 1200); }
    } catch {
      mensaje(ui.msg3, "error", t("No se pudo copiar. Seleccioná el texto de la cita y copialo a mano."));
    }
  }
  ui.copiarTodas.addEventListener("click", () => copiar(citasActuales, ui.copiarTodas));

  // ---------- Minimizar y arrastrar ----------
  const MARGEN = 8;
  function ubicar(pos) {
    const r = host.getBoundingClientRect();
    const x = Math.min(Math.max(MARGEN, pos.x), window.innerWidth - Math.max(r.width, 60) - MARGEN);
    const y = Math.min(Math.max(MARGEN, pos.y), window.innerHeight - Math.max(r.height, 40) - MARGEN);
    host.style.left = x + "px"; host.style.top = y + "px"; host.style.right = "auto"; host.style.bottom = "auto";
  }
  chrome.storage.local.get("docs:posicion").then((d) => { if (d["docs:posicion"]) requestAnimationFrame(() => ubicar(d["docs:posicion"])); }).catch(() => {});
  ui.cab.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button")) return;
    const r = host.getBoundingClientRect();
    const dx = e.clientX - r.left, dy = e.clientY - r.top;
    ui.cab.classList.add("arrastrando");
    ui.cab.setPointerCapture(e.pointerId);
    const mover = (ev) => ubicar({ x: ev.clientX - dx, y: ev.clientY - dy });
    const soltar = () => {
      ui.cab.classList.remove("arrastrando");
      ui.cab.removeEventListener("pointermove", mover);
      ui.cab.removeEventListener("pointerup", soltar);
      const f = host.getBoundingClientRect();
      chrome.storage.local.set({ "docs:posicion": { x: f.left, y: f.top } }).catch(() => {});
    };
    ui.cab.addEventListener("pointermove", mover);
    ui.cab.addEventListener("pointerup", soltar);
  });
  window.addEventListener("resize", () => { if (host.style.left) ubicar({ x: parseFloat(host.style.left), y: parseFloat(host.style.top) }); });
  ui.minimizar.addEventListener("click", cerrar);

  ui.abrir.addEventListener("click", abrir);
  // × oculta FARO en esta página (vuelve con Alt+Shift+F o al recargar); – lo minimiza al botón.
  ui.cerrar.addEventListener("click", () => { cerrar(); host.style.display = "none"; });
  ui.leer.addEventListener("click", leerPortapapeles);
  ui.codificar.addEventListener("click", codificar);
  ui.codigo.addEventListener("input", mostrarDefinicion);
  ui.codigo.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); codificar(); } if (e.key === "Escape") cerrar(); });
  ui.resaltar.addEventListener("change", () => chrome.storage.local.set({ "docs:resaltar": ui.resaltar.checked }));
  ui.importar.addEventListener("click", importar);
  ui.ver.addEventListener("click", () => enviar({ tipo: "abrir-faro", matId }).catch((e) => mensaje(ui.msg2, "error", e.message)));

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.tipo === "docs-acceso-concedido" && msg.docId === docId) {
      accesoDoc = true;
      mostrarModo();
      mensaje(ui.msg, "ok", t("✓ FARO ya tiene acceso a este Doc: desde ahora los códigos se guardan adentro."));
      if (abierto) actualizarResumen();
    }
    if (msg?.tipo === "docs-abrir-codificador") {
      host.style.display = "";
      if (!abierto) abrir();
      else ui.codigo.focus();
      if (!ultimaCopia || Date.now() - ultimaCopiaHora > 5 * 60 * 1000) leerPortapapeles();
    }
    return false;
  });

  mostrarFragmento();
  (document.body || document.documentElement).appendChild(host);
})();
