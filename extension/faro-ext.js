// FARO · puente de la extensión (corre dentro de faro.html, después de faro-app.js)
// - Recibe las operaciones que llegan desde Google Docs y el panel lateral, y las aplica al proyecto abierto.
// - Agrega el botón «G» (Google Docs y Drive): guardar y abrir el proyecto en Drive, crear Google Docs
//   con los resultados y ver los Docs vinculados.
// Usa directamente las funciones y variables globales de FARO (materials, savedCodes, persist, openModal, L, esc…).

(() => {
  "use strict";

  const enviar = (msg) => chrome.runtime.sendMessage(msg).then((r) => {
    if (!r) throw new Error("Sin respuesta de la extensión");
    if (!r.ok) throw Object.assign(new Error(r.error?.mensaje || "Error"), { codigo: r.error?.codigo });
    return r.r;
  });

  // FARO terminó de cargar el proyecto cuando ya abrió la base y activó la sincronización entre pestañas (init()).
  const listo = () => { try { return !!_db && !!_bc; } catch { return false; } };
  const esperarListo = () => new Promise((ok) => {
    const t = setInterval(() => { if (listo()) { clearInterval(t); ok(); } }, 100);
  });

  const escribiendo = () => {
    const a = document.activeElement;
    return !!(a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.isContentEditable)) || !!document.querySelector("#modal.show");
  };

  function refrescar(aviso) {
    if (escribiendo()) {
      try { renderSidebar(); } catch { /* sin barra */ }
      showToast(aviso);
    } else {
      render();
      showToast(aviso);
    }
  }

  // Estado que ven las operaciones compartidas: el proyecto abierto + seudónimos + colores elegidos.
  const estadoOps = () => ({
    materials, savedCodes,
    pseudoDict: Array.isArray(pseudoDict) ? pseudoDict : [],
    colores: window.FaroHerramientas ? window.FaroHerramientas.colores() : {},
    memos: window.FaroHerramientas ? window.FaroHerramientas.memos() : {}
  });

  // Seudónimos de FARO en todo lo que sale hacia afuera (Google Docs, informes).
  const seud = (t) => (Array.isArray(pseudoDict) && pseudoDict.length ? pseudonymize(String(t ?? "")) : String(t ?? ""));

  // ---------- Operaciones que llegan de afuera ----------

  chrome.runtime.onMessage.addListener((msg, _sender, responder) => {
    if (msg?.tipo !== "faro-aplicar-op") return false;
    if (!listo()) { responder({ noLista: true }); return false; }
    (async () => {
      const salida = FaroOps.aplicar(estadoOps(), msg.op);
      if (salida.cambioMemos && window.FaroHerramientas) await window.FaroHerramientas.guardarMemos();
      if (salida.cambio && !salida.resultado?.error) {
        await persist(true);
        const r = salida.resultado || {};
        const texto = msg.op.tipo === "doc-codificar"
          ? L(`Desde Google Docs: «${r.codigo}» aplicado ✓`, `From Google Docs: “${r.codigo}” applied ✓`)
          : msg.op.tipo === "capturas"
            ? L("Llegaron capturas del panel ✓", "Captures arrived from the panel ✓")
            : L("Llegaron cambios desde Google Docs ✓", "Changes arrived from Google Docs ✓");
        refrescar(texto);
      }
      responder({ resultado: salida.resultado });
    })().catch((e) => responder({ resultado: { error: String(e.message || e) } }));
    return true;
  });

  // ---------- Abrir un material desde Docs (#mat=ID) ----------

  async function irAMaterialDelHash() {
    if (location.hash === "#google") { window.history.replaceState(null, "", location.pathname); abrirVentana(); return; }
    const m = location.hash.match(/^#mat=(.+)$/);
    if (!m) return;
    const id = decodeURIComponent(m[1]);
    window.history.replaceState(null, "", location.pathname); // FARO tiene su propia variable «history»
    const mat = materials.find((x) => x.id === id);
    if (!mat) return;
    activeMatId = mat.id;
    go("codificar");
  }
  window.addEventListener("hashchange", () => { if (listo()) irAMaterialDelHash(); });

  // ---------- Proyecto completo (mismo contenido que «Respaldar / Descargar datos») ----------

  function datosProyecto() {
    return {
      _app: "faro", _v: 27, date: new Date().toISOString(), project, materials, folders, savedCodes, codeGroups,
      savedAnalyses, recomendaciones, deepNotes, deepWorks, deepMemos, cats, actores, actorLinks, refs, attrDefs, aiLog, pseudoDict,
      // Extras de la extensión (colores de códigos y registro de decisiones): FARO web los ignora al importar.
      faroExt: window.FaroHerramientas ? window.FaroHerramientas.extras() : undefined
    };
  }

  const nombreArchivo = () => {
    const tema = String(project?.tema || "").trim().replace(/[\\/:*?"<>|]+/g, " ").slice(0, 60);
    return `FARO — ${tema || L("mi proyecto", "my project")}.json`;
  };

  let claveDrive = null; // contraseña de cifrado, solo en memoria mientras la pestaña está abierta

  async function subirProyecto({ silencioso = false } = {}) {
    const pref = await chrome.storage.local.get(["drive:cifrar"]);
    let texto = JSON.stringify(datosProyecto());
    if (pref["drive:cifrar"]) {
      if (!claveDrive) {
        if (silencioso) return null;
        const p = await askPassword({
          title: L("Contraseña para Drive", "Password for Drive"), confirm: true,
          okLabel: L("Cifrar y guardar", "Encrypt and save"),
          note: L("La copia en Drive va a quedar cifrada. <strong>Si olvidás la contraseña, no se puede recuperar.</strong>", "The Drive copy will be encrypted. <strong>If you forget the password, it can't be recovered.</strong>")
        });
        if (p === null) return null;
        claveDrive = p;
      }
      texto = JSON.stringify(Object.assign({ _app: "faro", _v: 27 }, await encryptText(claveDrive, texto)));
    }
    const f = await enviar({ tipo: "drive-guardar", json: texto, nombre: nombreArchivo() });
    await chrome.storage.local.set({ "drive:ultimo": { fecha: new Date().toISOString(), link: f.webViewLink || "", nombre: f.name } });
    return f;
  }

  // Autoguardado en Drive: después de que FARO guarda en el navegador, sube una copia (como mucho cada 30 s).
  let temporizadorDrive = null;
  const persistOriginal = window.persist;
  window.persist = async function (...args) {
    const r = await persistOriginal.apply(this, args);
    programarDrive();
    return r;
  };
  async function programarDrive() {
    const p = await chrome.storage.local.get(["drive:auto"]);
    if (!p["drive:auto"]) return;
    clearTimeout(temporizadorDrive);
    temporizadorDrive = setTimeout(async () => {
      try { await subirProyecto({ silencioso: true }); marcarBoton("ok"); }
      catch (e) { marcarBoton("error", e.message); }
    }, 30000);
  }

  async function abrirDesdeDrive(archivo) {
    let d;
    try { d = JSON.parse(await enviar({ tipo: "drive-descargar", id: archivo.id })); }
    catch { showToast(t("toast.invalid.backup")); return; }
    if (d && d._enc) {
      let ok = false;
      for (let i = 0; i < 5 && !ok; i++) {
        const pass = await askPassword({ title: L("Proyecto cifrado", "Encrypted project"), note: L("Escribí la contraseña con la que se guardó en Drive.", "Type the password it was saved to Drive with."), okLabel: L("Descifrar", "Decrypt") });
        if (pass === null) return;
        try { d = JSON.parse(await decryptText(pass, d)); ok = true; claveDrive = pass; }
        catch { showToast(L("Contraseña incorrecta", "Wrong password")); }
      }
      if (!ok) return;
    }
    let limpio;
    try {
      if (!d || typeof d !== "object" || (!Array.isArray(d.materials) && !d.project)) throw new Error("forma");
      limpio = sanitizeBackup(d);
    } catch { showToast(t("toast.invalid.backup")); return; }
    confirmModal(t("confirm.import.title"), t("confirm.import.body"), async () => {
      const snap = snapState();
      try {
        applyStateObj(limpio); purgeWithdrawn();
        if (d.faroExt && window.FaroHerramientas) await window.FaroHerramientas.restaurarExtras(d.faroExt);
        await persist();
        await enviar({ tipo: "drive-usar-respaldo", id: archivo.id });
        go("home"); offerUndo(t("toast.imported"), snap);
      } catch (e) {
        console.error(e); applyStateObj(JSON.parse(snap)); await persist(); render();
        showToast(L("No se pudo abrir el proyecto; tu trabajo quedó como estaba.", "Couldn't open the project; your work was left as it was."));
      }
    });
  }

  // ---------- Resultados como Google Docs ----------

  const parrafos = (texto) => String(texto || "").split(/\n+/).filter((x) => x.trim()).map((x) => `<p>${esc(x)}</p>`).join("");
  const encabezado = (titulo) =>
    `<h1>${esc(titulo)}</h1><p><i>${esc(project?.tema || "")}${project?.tema ? " · " : ""}FARO · ${esc(new Date().toLocaleDateString(lang === "en" ? "en-GB" : "es-AR"))}</i></p>`;

  const EXPORTES = {
    codigos: {
      etiqueta: () => L("Libro de códigos", "Codebook"),
      vacio: () => savedCodes.length === 0,
      html() {
        const usos = {};
        for (const m of materials) for (const a of m.anns || []) {
          if (a.kind !== "code" || a.lost) continue;
          (usos[a.codeId] = usos[a.codeId] || []).push({ quote: seud(a.quote), mat: seud(m.name) });
        }
        const lista = savedCodes.slice().sort((a, b) => String(a.code).localeCompare(String(b.code), lang));
        return encabezado(this.etiqueta()) + lista.map((c) => {
          const u = usos[c.id] || [];
          const ejemplos = u.slice(0, 5).map((x) => `<li>«${esc(x.quote.length > 400 ? x.quote.slice(0, 400) + "…" : x.quote)}» — <i>${esc(x.mat)}</i></li>`).join("");
          return `<h2>${esc(c.code)}</h2><p><i>${u.length} ${L(u.length === 1 ? "fragmento" : "fragmentos", u.length === 1 ? "fragment" : "fragments")}</i></p>`
            + parrafos(codeDescText(c)) + (ejemplos ? `<ul>${ejemplos}</ul>` : "");
        }).join("");
      }
    },
    analisis: {
      etiqueta: () => L("Análisis", "Analyses"),
      vacio: () => savedAnalyses.length === 0,
      html() {
        return encabezado(this.etiqueta()) + savedAnalyses.map((a) => {
          const frags = (typeof anaFrags === "function" ? anaFrags(a) : (a.frags || []))
            .map((f) => `<li>«${esc(seud(f.quote || ""))}» — <i>${esc(seud(f.matName || ""))}</i></li>`).join("");
          return `<h2>${esc(seud(a.title || L("Análisis", "Analysis")))}</h2><p><i>${esc(a.date || "")}</i></p>${renderMd(seud(a.body || ""))}`
            + (frags ? `<h3>${L("Fragmentos", "Fragments")}</h3><ul>${frags}</ul>` : "");
        }).join("");
      }
    },
    recomendaciones: {
      etiqueta: () => L("Recomendaciones y preguntas", "Recommendations and questions"),
      vacio: () => recomendaciones.length === 0,
      html() {
        return encabezado(this.etiqueta()) + recomendaciones.map((r) =>
          `<h2>${esc(seud(r.title || ""))}</h2>${renderMd(seud(r.body || ""))}`
          + (r.quote ? `<p>«${esc(seud(r.quote))}» — <i>${esc(seud(r.matName || ""))}</i></p>` : "")).join("");
      }
    },
    referencias: {
      etiqueta: () => L("Referencias (APA 7)", "References (APA 7)"),
      vacio: () => refs.length === 0,
      html() {
        const items = refs.map((r) => { try { return formatRef(r).apa; } catch { return ""; } })
          .filter(Boolean)
          .sort((a, b) => a.replace(/<[^>]+>/g, "").localeCompare(b.replace(/<[^>]+>/g, ""), lang));
        return encabezado(this.etiqueta()) + items.map((x) => `<p>${x}</p>`).join("");
      }
    }
  };

  async function crearDoc(clave) {
    const e = EXPORTES[clave];
    if (e.vacio()) { showToast(L(`Todavía no hay nada en «${e.etiqueta()}».`, `There's nothing in “${e.etiqueta()}” yet.`)); return; }
    showToast(L("Creando el Google Doc…", "Creating the Google Doc…"));
    const titulo = `FARO · ${e.etiqueta()}${project?.tema ? " — " + project.tema : ""}`.slice(0, 200);
    const html = `<!doctype html><html><head><meta charset="utf-8"></head><body>${e.html()}</body></html>`;
    const f = await enviar({ tipo: "drive-crear-doc", titulo, html });
    if (f.webViewLink) window.open(f.webViewLink, "_blank", "noopener");
    showToast(L("Google Doc creado en tu carpeta FARO de Drive ✓", "Google Doc created in your FARO Drive folder ✓"));
  }

  // ---------- Docs vinculados ----------

  const docsVinculados = () => materials.filter((m) => m.attrs && m.attrs[FaroOps.CLAVE_DOC]);

  async function actualizarDesdeDoc(mat) {
    const docId = mat.attrs[FaroOps.CLAVE_DOC];
    const d = await enviar({ tipo: "docs-texto", docId });
    const op = FaroOps.prepararOp({ tipo: "doc-importar", docId, titulo: d.titulo, texto: d.texto });
    const { resultado } = FaroOps.aplicar(estadoOps(), op);
    await persist(true);
    render();
    showToast(resultado.cambiado
      ? (resultado.perdidas
        ? L(`Texto actualizado. ${resultado.perdidas} fragmento(s) ya no están en el Doc y quedaron marcados.`, `Text updated. ${resultado.perdidas} fragment(s) are no longer in the Doc and were flagged.`)
        : L("Texto actualizado desde Google Docs ✓", "Text updated from Google Docs ✓"))
      : L("El Doc no cambió.", "The Doc hasn't changed."));
  }

  // ---------- Ventana «Google Docs y Drive» ----------

  function marcarBoton(estado, detalle) {
    const b = document.getElementById("faro-google-btn");
    if (!b) return;
    b.classList.toggle("faro-g-error", estado === "error");
    b.title = estado === "error"
      ? L("No se pudo guardar en Drive: ", "Couldn't save to Drive: ") + (detalle || "")
      : L("Google Docs y Drive", "Google Docs and Drive");
  }

  function errorAmigable(e) {
    const c = e?.codigo;
    if (c === "sin-client-id") return L("Falta configurar el Client ID.", "The Client ID isn't set up.");
    if (c === "requiere-login" || c === "sin-token") return L("Tenés que volver a conectar tu cuenta de Google.", "You need to reconnect your Google account.");
    if (c === "faltan-permisos") return L("Hay que aceptar todos los permisos que pide FARO.", "You need to accept all the permissions FARO asks for.");
    if (c === "cancelado" || c === "denegado") return L("Se canceló el inicio de sesión.", "Sign-in was cancelled.");
    if (c === "client-id-invalido") return L("Ese Client ID no es válido: tiene la forma 123456789-abc.apps.googleusercontent.com", "That Client ID isn't valid: it looks like 123456789-abc.apps.googleusercontent.com");
    if (c === "clave-selector-invalida") return L("La clave de API del selector empieza con AIza.", "The Picker API key starts with AIza.");
    if (c === "state-invalido") return L("La respuesta de Google no era de FARO. Probá conectar de nuevo.", "Google's response wasn't for FARO. Try connecting again.");
    if (c === "sin-permiso") return L("Google no dio permiso (¿la API de Drive o de Docs no está habilitada en tu proyecto de Google Cloud?).", "Google denied access (is the Drive or Docs API enabled in your Google Cloud project?).");
    return e?.message || String(e);
  }

  const fechaCorta = (iso) => { try { return new Date(iso).toLocaleString(lang === "en" ? "en-GB" : "es-AR", { dateStyle: "short", timeStyle: "short" }); } catch { return iso; } };

  async function abrirVentana(opciones = {}) {
    let est;
    try { est = await enviar({ tipo: "google-estado" }); }
    catch (e) { showToast(errorAmigable(e)); return; }
    const pref = await chrome.storage.local.get(["drive:auto", "drive:cifrar", "drive:ultimo"]);
    const guia = chrome.runtime.getURL("guia-google.html");
    let cuerpo = "";

    const uris = [est.redirectExtension, est.redirectWeb].filter(Boolean);
    const filaUri = (u, i) => `<div style="display:flex;gap:.4rem;margin-bottom:.35rem"><input class="field-in" readonly value="${esc(u)}" style="flex:1;font-family:'IBM Plex Mono',monospace;font-size:.75rem"/><button class="btn outline sm" data-copiar="${i}">${L("Copiar", "Copy")}</button></div>`;

    const configurar = !est.clientId || opciones.configurar === true;
    if (configurar) {
      cuerpo = `
        <p class="fg-texto">${L("Conectá tu cuenta de Google para <strong>resaltar en el Doc</strong> lo que codificás, <strong>guardar tu proyecto en Drive</strong> y <strong>crear Google Docs</strong> con tus resultados. Se configura una sola vez.", "Connect your Google account to <strong>highlight in the Doc</strong> what you code, <strong>save your project to Drive</strong> and <strong>create Google Docs</strong> from your results. You set it up once.")}</p>
        <p class="fg-texto"><a href="${guia}" target="_blank" rel="noopener">${L("Abrir la guía paso a paso (15 minutos)", "Open the step-by-step guide (15 minutes)")} ↗</a></p>
        <div class="field-row"><label class="field-label">${L(uris.length > 1 ? "URIs de redireccionamiento (agregá las dos en Google Cloud)" : "URI de redireccionamiento (agregala en Google Cloud)", uris.length > 1 ? "Redirect URIs (add both in Google Cloud)" : "Redirect URI (add it in Google Cloud)")}</label>
          ${uris.map(filaUri).join("")}</div>
        <div class="field-row" style="margin-top:.8rem"><label class="field-label">Client ID</label>
          <input class="field-in" id="fg-client" placeholder="123456789-abc.apps.googleusercontent.com" value="${esc(est.clientIdPropio ? est.clientId : "")}" spellcheck="false" autocomplete="off"/></div>
        <div class="field-row" style="margin-top:.6rem"><label class="field-label">${L("Clave de API del selector de Google", "Google Picker API key")}</label>
          <input class="field-in" id="fg-clave" placeholder="AIza…" value="${esc(est.clientIdPropio ? est.claveSelector : "")}" spellcheck="false" autocomplete="off"/>
          <div class="fg-nota" style="margin-top:.3rem">${L("Sirve para que cada persona le dé acceso a FARO a un Doc puntual (permiso por archivo).", "Lets each person give FARO access to one specific Doc (per-file permission).")}</div></div>
        ${est.hayPredeterminado ? `<p class="fg-nota">${L("Dejalo vacío para usar el acceso de FARO que viene incorporado.", "Leave it empty to use FARO's built-in access.")}</p>` : ""}`;
    } else if (!est.conectado) {
      cuerpo = `
        <p class="fg-texto">${L("Conectá tu cuenta para resaltar en Google Docs y usar Drive desde FARO.", "Connect your account to highlight in Google Docs and use Drive from FARO.")}</p>
        ${est.flujoPestana ? `<p class="fg-texto">${L("En este navegador, Google se abre en una pestaña nueva. Iniciá sesión, aceptá los permisos y la pestaña se cierra sola. La conexión dura una hora; después, FARO te la vuelve a pedir.", "In this browser, Google opens in a new tab. Sign in, accept the permissions and the tab closes by itself. The connection lasts one hour; after that FARO asks again.")}</p>` : ""}
        <div id="fg-espera"></div>
        <button class="btn green" id="fg-conectar">${L("Conectar con Google", "Connect with Google")}</button>
        <p class="fg-nota">${est.clientIdPropio ? `Client ID: <code>${esc(est.clientId.slice(0, 18))}…</code>` : L("Usa el acceso de Google incorporado en FARO.", "Uses FARO's built-in Google access.")} · <a href="#" id="fg-cambiar">${est.clientIdPropio ? L("cambiar", "change") : L("usar mi propio Client ID", "use my own Client ID")}</a></p>`;
    } else {
      const ultimo = pref["drive:ultimo"];
      const vinc = docsVinculados();
      cuerpo = `
        <div class="tip" style="margin-bottom:1rem">✓ ${L("Conectado como", "Connected as")} <strong>${esc(est.email)}</strong> · <a href="#" id="fg-desconectar">${L("desconectar", "disconnect")}</a></div>

        <div class="field-label" style="margin-bottom:.3rem">${L("Proyecto en Drive", "Project in Drive")}</div>
        <div class="tip" style="margin-bottom:.5rem">${ultimo ? L(`Última copia: ${fechaCorta(ultimo.fecha)}`, `Last copy: ${fechaCorta(ultimo.fecha)}`) + (ultimo.link ? ` · <a href="${esc(ultimo.link)}" target="_blank" rel="noopener">${L("ver en Drive", "view in Drive")} ↗</a>` : "") : L("Todavía no guardaste el proyecto en Drive.", "You haven't saved the project to Drive yet.")}</div>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:.5rem">
          <button class="btn green sm" id="fg-guardar">${L("Guardar ahora en Drive", "Save to Drive now")}</button>
          <button class="btn outline sm" id="fg-abrir">${L("Abrir un proyecto de Drive…", "Open a project from Drive…")}</button>
        </div>
        <label style="display:flex;gap:.4rem;align-items:center;font-size:.8rem;margin:.3rem 0"><input type="checkbox" id="fg-auto" ${pref["drive:auto"] ? "checked" : ""}/> ${L("Guardar automáticamente en Drive mientras trabajo", "Automatically save to Drive while I work")}</label>
        <label style="display:flex;gap:.4rem;align-items:center;font-size:.8rem;margin:.3rem 0 1rem"><input type="checkbox" id="fg-cifrar" ${pref["drive:cifrar"] ? "checked" : ""}/> ${L("Cifrar la copia de Drive con contraseña (recomendado si hay datos sensibles)", "Encrypt the Drive copy with a password (recommended for sensitive data)")}</label>
        <div id="fg-lista"></div>

        <div class="field-label" style="margin:.6rem 0 .3rem">${L("Crear un Google Doc con…", "Create a Google Doc with…")}</div>
        <div style="display:flex;gap:.4rem;flex-wrap:wrap;margin-bottom:1rem">
          ${Object.entries(EXPORTES).map(([k, e]) => `<button class="btn outline sm" data-exportar="${k}" ${e.vacio() ? "disabled" : ""}>${esc(e.etiqueta())}</button>`).join("")}
        </div>

        <div class="field-label" style="margin-bottom:.3rem">${L("Google Docs vinculados", "Linked Google Docs")}</div>
        ${vinc.length ? `<div class="mat-list">${vinc.map((m) => `
          <div class="mat-item" style="display:flex;align-items:center;gap:.5rem">
            <div class="mat-info" style="flex:1;min-width:0"><div class="mat-name">${esc(m.name)}</div><div class="mat-meta">${(m.anns || []).filter((a) => a.kind === "code" && !a.lost).length} ${L("fragmentos codificados", "coded fragments")}</div></div>
            <a class="btn outline sm" href="https://docs.google.com/document/d/${encodeURIComponent(m.attrs[FaroOps.CLAVE_DOC])}/edit" target="_blank" rel="noopener">${L("Abrir Doc", "Open Doc")} ↗</a>
            <button class="btn outline sm" data-actualizar="${esc(m.id)}">${L("Actualizar texto", "Update text")}</button>
          </div>`).join("")}</div>`
          : `<div class="tip">${L("Abrí cualquier Google Doc: vas a ver el botón FARO abajo a la derecha para importarlo y codificarlo.", "Open any Google Doc: you'll see the FARO button at the bottom right to import and code it.")}</div>`}`;
    }

    openModal(`<div class="modal-head"><div class="modal-title">${L("Google Docs y Drive", "Google Docs and Drive")}</div><button class="modal-close" id="m-close">✕</button></div>
      <div class="modal-body fg">${cuerpo}</div>
      ${configurar ? `<div class="modal-foot"><button class="btn outline" id="m-cancel">${L("Cancelar", "Cancel")}</button><button class="btn green" id="fg-guardar-client">${L("Guardar", "Save")}</button></div>` : ""}`);

    const $ = (id) => document.getElementById(id);
    $("m-close").onclick = () => closeModal();
    $("m-cancel")?.addEventListener("click", () => closeModal());

    const conManejo = (fn) => async (ev) => {
      ev?.preventDefault?.();
      const b = ev?.currentTarget;
      if (b && b.tagName === "BUTTON") b.disabled = true;
      try { await fn(ev); }
      catch (e) { showToast("⚠ " + errorAmigable(e)); }
      finally { if (b && b.tagName === "BUTTON" && document.body.contains(b)) b.disabled = false; }
    };

    document.querySelectorAll("[data-copiar]").forEach((b) => b.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(uris[Number(b.dataset.copiar)]); showToast(L("Copiado ✓", "Copied ✓")); }
      catch { showToast(L("Mantené apretado el texto para copiarlo.", "Long-press the text to copy it.")); }
    }));
    $("fg-guardar-client")?.addEventListener("click", conManejo(async () => {
      await enviar({ tipo: "google-config", clientId: $("fg-client").value, claveSelector: $("fg-clave").value });
      closeModal(); abrirVentana();
    }));
    $("fg-conectar")?.addEventListener("click", conManejo(async () => {
      try {
        await enviar({ tipo: "google-conectar" });
      } catch (e) {
        if (e.codigo !== "esperando-pestana") throw e;
        // Google se abrió en otra pestaña: cuando vuelvas a FARO, la ventana se actualiza sola.
        $("fg-espera").innerHTML = `<div class="warn-box" style="margin-bottom:.8rem">${L("Se abrió Google en una pestaña nueva. Iniciá sesión y aceptá los permisos; al terminar, volvé a esta pestaña.", "Google opened in a new tab. Sign in and accept the permissions; when you're done, come back to this tab.")}</div>`;
        const alVolver = async () => {
          if (document.visibilityState !== "visible") return;
          document.removeEventListener("visibilitychange", alVolver);
          const nuevo = await enviar({ tipo: "google-estado" }).catch(() => null);
          if (nuevo?.conectado) { closeModal(); abrirVentana(); showToast(L("Cuenta de Google conectada ✓", "Google account connected ✓")); }
          else document.addEventListener("visibilitychange", alVolver);
        };
        document.addEventListener("visibilitychange", alVolver);
        return;
      }
      closeModal(); abrirVentana();
      showToast(L("Cuenta de Google conectada ✓", "Google account connected ✓"));
    }));
    $("fg-cambiar")?.addEventListener("click", (ev) => { ev.preventDefault(); closeModal(); abrirVentana({ configurar: true }); });
    $("fg-desconectar")?.addEventListener("click", conManejo(async () => {
      await enviar({ tipo: "google-desconectar" });
      closeModal(); abrirVentana();
    }));
    $("fg-guardar")?.addEventListener("click", conManejo(async () => {
      const f = await subirProyecto();
      if (f) { showToast(L("Proyecto guardado en Drive ✓", "Project saved to Drive ✓")); closeModal(); abrirVentana(); marcarBoton("ok"); }
    }));
    $("fg-auto")?.addEventListener("change", async (e) => {
      await chrome.storage.local.set({ "drive:auto": e.target.checked });
      if (e.target.checked) showToast(L("Cada cambio se va a copiar a Drive (como mucho cada 30 segundos).", "Every change will be copied to Drive (at most every 30 seconds)."));
    });
    $("fg-cifrar")?.addEventListener("change", async (e) => {
      await chrome.storage.local.set({ "drive:cifrar": e.target.checked });
      if (!e.target.checked) claveDrive = null;
    });
    $("fg-abrir")?.addEventListener("click", conManejo(async () => {
      const archivos = await enviar({ tipo: "drive-listar" });
      const caja = $("fg-lista");
      if (!archivos.length) { caja.innerHTML = `<div class="tip" style="margin-bottom:1rem">${L("No hay proyectos guardados en tu carpeta FARO de Drive.", "There are no projects in your FARO Drive folder.")}</div>`; return; }
      caja.innerHTML = `<div class="mat-list" style="margin-bottom:1rem">${archivos.map((f) => `
        <div class="mat-item" style="display:flex;align-items:center;gap:.5rem"><div class="mat-info" style="flex:1"><div class="mat-name">${esc(f.name)}</div><div class="mat-meta">${esc(fechaCorta(f.modifiedTime))}</div></div>
        <button class="btn outline sm" data-abrir-drive="${esc(f.id)}">${L("Abrir", "Open")}</button></div>`).join("")}</div>`;
      caja.querySelectorAll("[data-abrir-drive]").forEach((b) => b.addEventListener("click", conManejo(async () => {
        const f = archivos.find((x) => x.id === b.dataset.abrirDrive);
        closeModal(true);
        await abrirDesdeDrive(f);
      })));
    }));
    document.querySelectorAll("[data-exportar]").forEach((b) => b.addEventListener("click", conManejo(() => crearDoc(b.dataset.exportar))));
    document.querySelectorAll("[data-actualizar]").forEach((b) => b.addEventListener("click", conManejo(async () => {
      const m = materials.find((x) => x.id === b.dataset.actualizar);
      if (m) { await actualizarDesdeDoc(m); closeModal(); abrirVentana(); }
    })));
  }

  function agregarBoton() {
    if (document.getElementById("faro-google-btn")) return;
    const ancla = document.getElementById("search-btn");
    if (!ancla) return;
    const b = document.createElement("button");
    b.className = "theme-btn";
    b.id = "faro-google-btn";
    b.textContent = "G";
    b.style.fontWeight = "600";
    b.title = L("Google Docs y Drive", "Google Docs and Drive");
    b.setAttribute("aria-label", b.title);
    b.addEventListener("click", abrirVentana);
    ancla.before(b);
    const estilo = document.createElement("style");
    estilo.textContent = "#faro-google-btn.faro-g-error{border-color:#c4513b;color:#c4513b}"
      + ".fg .fg-texto{font-size:.9rem;line-height:1.55;color:var(--text);margin:0 0 .8rem}"
      + ".fg .fg-nota{font-size:.78rem;color:var(--text3);margin-top:1rem}"
      + ".fg .tip{font-style:normal;font-family:inherit;font-size:.84rem;color:var(--text2)}"
      + ".fg .field-label{font-size:.8rem}";
    document.head.append(estilo);
  }

  (async () => {
    await esperarListo();
    agregarBoton();
    irAMaterialDelHash();
  })();

  // Para pruebas
  window.__faroExt = { EXPORTES, datosProyecto, docsVinculados, abrirVentana, enviar, errorAmigable, seud, esperarListo };
})();
