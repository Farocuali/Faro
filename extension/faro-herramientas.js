// FARO · herramientas de análisis de la extensión (corre dentro de faro.html, después de faro-ext.js)
// Botón «＋» del encabezado:
//   - Acuerdo entre codificadoras: κ de Cohen (2 personas) y α de Krippendorff (2 o más).
//   - Saturación: códigos nuevos por material, en orden.
//   - Registro de decisiones: historial del libro de códigos (crear, renombrar, redefinir, fusionar, borrar) + notas.
//   - Colores de códigos: un color por código, el mismo en FARO, Google Docs y el complemento.
// Usa las globales de FARO (materials, savedCodes, openModal, L, esc, idbGet, idbSet…) y window.__faroExt.

(() => {
  "use strict";

  const K_COLORES = FaroOps.CLAVE_COLORES;     // { "código en minúsculas": "#rrggbb" }
  const K_REGISTRO = "faroExt:registro";       // [{ fecha, tipo, codigo, antes, despues, detalle, origen }]
  const K_MEMOS = FaroOps.CLAVE_MEMOS;          // { annId: "memo" }
  const K_ACUERDO = "faroExt:ultimoAcuerdo";   // resumen del último cálculo de acuerdo (para el anexo)
  const K_FOTO = "faroExt:registroFoto";       // { codigos: {id: {code, desc, incl, excl, ejemplo}}, anns: {annId: codeId} }
  const MAX_REGISTRO = 5000;

  let colores = {};
  let memos = {};
  let ultimoAcuerdo = null;
  let registro = [];
  let foto = null;

  const ext = () => window.__faroExt;
  const fechaHora = (iso) => { try { return new Date(iso).toLocaleString(lang === "en" ? "en-GB" : "es-AR", { dateStyle: "short", timeStyle: "short" }); } catch { return iso; } };
  const nombreDe = (c) => String(c?.code || "").trim();
  const claveCodigo = (n) => String(n || "").trim().toLowerCase();
  const descargar = (nombre, texto, tipo) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([texto], { type: tipo }));
    a.download = nombre; document.body.appendChild(a); a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(a.href); }, 200);
  };
  const csvCelda = (v) => { const x = v === null || v === undefined ? "" : String(v); return /[",\n;]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; };

  // ============================================================
  // Colores de códigos
  // ============================================================

  const colorDe = (nombre) => colores[claveCodigo(nombre)] || FaroOps.colorPorDefecto(nombre);

  function pintarMarcas() {
    if (!Array.isArray(materials)) return;
    const etiquetas = new Map();
    for (const m of materials) for (const a of m.anns || []) {
      if (a.kind !== "code") continue;
      const c = savedCodes.find((x) => x.id === a.codeId);
      etiquetas.set(a.id, nombreDe(c) || a.label || "");
    }
    for (const mk of document.querySelectorAll("mark.coded[data-ann]")) {
      const ids = mk.dataset.ann.split(" ");
      const nombres = ids.map((id) => etiquetas.get(id)).filter(Boolean);
      if (!nombres.length) continue;
      const col = colorDe(nombres[0]);
      if (mk.dataset.faroColor === col + nombres.length) continue;
      mk.dataset.faroColor = col + nombres.length;
      mk.style.backgroundColor = col;
      mk.style.color = "#1d2433";
      mk.style.boxShadow = nombres.length > 1 ? `inset 0 -2px 0 ${colorDe(nombres[1])}` : "";
      const notas = ids.map((id) => memos[id]).filter(Boolean);
      if (notas.length) { mk.title = nombres.join(" · ") + "\n\n✎ " + notas.join("\n✎ "); mk.style.borderBottom = "2px dotted #1f3a5f"; }
    }
  }
  let pintando = false;
  const observador = new MutationObserver(() => {
    if (pintando) return;
    pintando = true;
    // setTimeout y no requestAnimationFrame: en pestañas en segundo plano rAF no corre y el pintado quedaba trabado.
    setTimeout(() => { try { pintarMarcas(); } finally { pintando = false; } }, 30);
  });

  async function guardarColores() {
    await idbSet("kv", K_COLORES, colores);
    pintarMarcas();
  }

  function abrirColores() {
    const usos = {};
    for (const m of materials) for (const a of m.anns || []) if (a.kind === "code" && !a.lost) { const c = savedCodes.find((x) => x.id === a.codeId); const k = claveCodigo(nombreDe(c) || a.label); usos[k] = (usos[k] || 0) + 1; }
    const lista = savedCodes.slice().sort((a, b) => (usos[claveCodigo(b.code)] || 0) - (usos[claveCodigo(a.code)] || 0) || String(a.code).localeCompare(String(b.code), lang));
    openModal(`<div class="modal-head"><div class="modal-title">${L("Colores de códigos", "Code colours")}</div><button class="modal-close" id="m-close">✕</button></div>
      <div class="modal-body fg">
        <p class="fg-texto">${L("Cada código tiene un color, el mismo acá, en el resaltado de Google Docs y en el complemento. Cambiarlo no repinta lo que ya está resaltado en los Docs: se usa desde el próximo fragmento.", "Each code has a colour, the same here, in Google Docs highlighting and in the add-on. Changing it doesn't repaint what's already highlighted in Docs: it applies from the next fragment.")}</p>
        ${lista.length ? `<div class="mat-list">${lista.map((c) => `
          <div class="mat-item" style="display:flex;align-items:center;gap:.6rem">
            <input type="color" value="${esc(colorDe(c.code))}" data-codigo="${esc(c.code)}" aria-label="${esc(L("Color de", "Colour of") + " " + c.code)}" style="width:2.2rem;height:1.8rem;border:0;background:none;padding:0;cursor:pointer"/>
            <div class="mat-info" style="flex:1"><div class="mat-name">${esc(c.code)}</div><div class="mat-meta">${usos[claveCodigo(c.code)] || 0} ${L("fragmentos", "fragments")}</div></div>
            ${colores[claveCodigo(c.code)] ? `<button class="btn outline sm" data-restaurar="${esc(c.code)}">${L("Restaurar", "Reset")}</button>` : ""}
          </div>`).join("")}</div>` : `<div class="tip">${L("Todavía no hay códigos.", "No codes yet.")}</div>`}
      </div>`);
    document.getElementById("m-close").onclick = () => closeModal();
    document.querySelectorAll("input[type=color][data-codigo]").forEach((inp) => inp.addEventListener("change", async () => {
      colores[claveCodigo(inp.dataset.codigo)] = inp.value.toUpperCase();
      await guardarColores();
      closeModal(); abrirColores();
    }));
    document.querySelectorAll("[data-restaurar]").forEach((b) => b.addEventListener("click", async () => {
      delete colores[claveCodigo(b.dataset.restaurar)];
      await guardarColores();
      closeModal(); abrirColores();
    }));
  }

  // ============================================================
  // Registro de decisiones (audit trail)
  // ============================================================

  const CAMPOS_DEF = ["desc", "incl", "excl", "ejemplo"];

  function tomarFoto() {
    const codigos = {};
    for (const c of savedCodes) codigos[c.id] = { code: c.code, ...Object.fromEntries(CAMPOS_DEF.map((k) => [k, c[k] || ""])) };
    const anns = {};
    for (const m of materials) for (const a of m.anns || []) if (a.kind === "code") anns[a.id] = a.codeId;
    return { codigos, anns };
  }

  // Compara dos fotos del libro de códigos y devuelve los cambios como eventos del registro.
  function diferencias(antes, ahora, origen) {
    const ev = [];
    const fecha = new Date().toISOString();
    for (const [id, c] of Object.entries(ahora.codigos)) {
      const v = antes.codigos[id];
      if (!v) { ev.push({ fecha, tipo: "creado", codigo: c.code, origen }); continue; }
      if (v.code !== c.code) ev.push({ fecha, tipo: "renombrado", codigo: c.code, antes: v.code, despues: c.code, origen });
      const cambiados = CAMPOS_DEF.filter((k) => (v[k] || "") !== (c[k] || ""));
      if (cambiados.length) ev.push({ fecha, tipo: "definicion", codigo: c.code, detalle: cambiados.join(", "), antes: cambiados.map((k) => v[k]).join(" | "), despues: cambiados.map((k) => c[k]).join(" | "), origen });
    }
    for (const [id, v] of Object.entries(antes.codigos)) {
      if (ahora.codigos[id]) continue;
      // ¿Sus fragmentos pasaron a otro código? Entonces fue una fusión.
      const destinos = {};
      let total = 0;
      for (const [annId, codeId] of Object.entries(antes.anns)) {
        if (codeId !== id) continue;
        total++;
        const nuevo = ahora.anns[annId];
        if (nuevo && nuevo !== id && ahora.codigos[nuevo]) destinos[nuevo] = (destinos[nuevo] || 0) + 1;
      }
      const principal = Object.entries(destinos).sort((a, b) => b[1] - a[1])[0];
      if (principal) ev.push({ fecha, tipo: "fusionado", codigo: v.code, despues: ahora.codigos[principal[0]].code, detalle: String(principal[1]), origen });
      else ev.push({ fecha, tipo: "borrado", codigo: v.code, detalle: String(total), origen });
    }
    return ev;
  }

  async function registrar(eventos) {
    if (!eventos.length) return;
    registro = registro.concat(eventos).slice(-MAX_REGISTRO);
    await idbSet("kv", K_REGISTRO, registro);
  }

  async function actualizarRegistro(origen) {
    const ahora = tomarFoto();
    if (foto) await registrar(diferencias(foto, ahora, origen));
    foto = ahora;
    await idbSet("kv", K_FOTO, foto);
  }

  const TIPOS = {
    creado: () => L("Código creado", "Code created"),
    renombrado: () => L("Renombrado", "Renamed"),
    definicion: () => L("Definición cambiada", "Definition changed"),
    fusionado: () => L("Fusionado", "Merged"),
    borrado: () => L("Borrado", "Deleted"),
    nota: () => L("Nota de decisión", "Decision note"),
    inicio: () => L("Inicio del registro", "Log started")
  };
  const ORIGENES = { faro: () => L("en FARO", "in FARO"), externo: () => L("desde Docs o el panel", "from Docs or the panel") };

  const frag = (n) => (Number(n) === 1 ? L("1 fragmento", "1 fragment") : L(`${n} fragmentos`, `${n} fragments`));
  const NOMBRE_CAMPO = { desc: () => L("descripción", "description"), incl: () => L("cuándo aplicarlo", "when to apply"), excl: () => L("cuándo no aplicarlo", "when not to apply"), ejemplo: () => L("ejemplo", "example") };
  const campos = (lista) => String(lista || "").split(", ").map((k) => (NOMBRE_CAMPO[k] ? NOMBRE_CAMPO[k]() : k)).join(", ");

  function describir(e) {
    switch (e.tipo) {
      case "renombrado": return `«${e.antes}» → «${e.despues}»`;
      case "fusionado": return L(`«${e.codigo}» se fusionó en «${e.despues}» (${frag(e.detalle)})`, `“${e.codigo}” merged into “${e.despues}” (${frag(e.detalle)})`);
      case "borrado": return L(`«${e.codigo}» (tenía ${frag(e.detalle)})`, `“${e.codigo}” (had ${frag(e.detalle)})`);
      case "definicion": return L(`«${e.codigo}»: ${campos(e.detalle)}`, `“${e.codigo}”: ${campos(e.detalle)}`);
      case "nota": return e.detalle;
      case "inicio": return L("A partir de acá se registran los cambios del libro de códigos.", "Codebook changes are logged from here on.");
      default: return `«${e.codigo}»`;
    }
  }

  function registroCsv() {
    const filas = [["fecha", "tipo", "codigo", "antes", "despues", "detalle", "origen"]];
    for (const e of registro) filas.push([e.fecha, e.tipo, e.codigo || "", e.antes || "", e.despues || "", e.detalle || "", e.origen || ""]);
    return "﻿" + filas.map((f) => f.map(csvCelda).join(",")).join("\n");
  }

  function registroHtml() {
    return `<h1>${L("Registro de decisiones del libro de códigos", "Codebook decision log")}</h1>
      <p><i>${esc(project?.tema || "")} · FARO · ${esc(new Date().toLocaleDateString(lang === "en" ? "en-GB" : "es-AR"))}</i></p>
      <table border="1" cellpadding="4"><tr><th>${L("Fecha", "Date")}</th><th>${L("Cambio", "Change")}</th><th>${L("Detalle", "Detail")}</th></tr>
      ${registro.map((e) => `<tr><td>${esc(fechaHora(e.fecha))}</td><td>${esc(TIPOS[e.tipo] ? TIPOS[e.tipo]() : e.tipo)}</td><td>${esc(ext().seud(describir(e)))}${e.tipo === "definicion" && e.despues ? `<br><i>${esc(ext().seud(e.despues))}</i>` : ""}</td></tr>`).join("")}</table>`;
  }

  function abrirRegistro(filtro = "") {
    const f = claveCodigo(filtro);
    const visibles = registro.slice().reverse().filter((e) => !f || claveCodigo(e.codigo).includes(f) || claveCodigo(e.despues).includes(f) || claveCodigo(e.detalle).includes(f));
    openModal(`<div class="modal-head"><div class="modal-title">${L("Registro de decisiones", "Decision log")}</div><button class="modal-close" id="m-close">✕</button></div>
      <div class="modal-body fg">
        <p class="fg-texto">${L("FARO anota solo cada cambio del libro de códigos: cuándo se creó, renombró, redefinió, fusionó o borró cada código. Sumá notas con el porqué: sirve como anexo metodológico de la tesis.", "FARO logs every codebook change by itself: when each code was created, renamed, redefined, merged or deleted. Add notes with the why: it works as a methodological appendix.")}</p>
        <div class="field-row"><label class="field-label">${L("Nota de decisión", "Decision note")}</label>
          <textarea class="field-in" id="rg-nota" rows="2" placeholder="${esc(L("Ej.: fusioné «tierra» y «territorio» porque las entrevistadas no los distinguen.", "E.g.: merged “land” and “territory” because interviewees don't distinguish them."))}"></textarea></div>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin:.4rem 0 1rem">
          <button class="btn green sm" id="rg-agregar">${L("Agregar nota", "Add note")}</button>
          <input class="field-in" id="rg-filtro" placeholder="${esc(L("Filtrar por código", "Filter by code"))}" value="${esc(filtro)}" style="flex:1;min-width:140px"/>
        </div>
        ${visibles.length ? `<div style="max-height:46vh;overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:.8rem">
          ${visibles.map((e) => `<tr style="border-bottom:1px solid var(--border);vertical-align:top">
            <td style="white-space:nowrap;padding:.35rem .5rem .35rem 0;color:var(--text3)">${esc(fechaHora(e.fecha))}</td>
            <td style="padding:.35rem .5rem;font-weight:600">${esc(TIPOS[e.tipo] ? TIPOS[e.tipo]() : e.tipo)}</td>
            <td style="padding:.35rem 0">${esc(describir(e))}${e.tipo === "definicion" && e.despues ? `<div class="tip">${esc(e.despues)}</div>` : ""}${e.origen === "externo" ? `<div class="tip">${ORIGENES.externo()}</div>` : ""}</td></tr>`).join("")}
        </table></div>` : `<div class="tip">${L("Todavía no hay cambios registrados.", "No changes logged yet.")}</div>`}
        <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:1rem">
          <button class="btn outline sm" id="rg-csv">${L("Descargar CSV", "Download CSV")}</button>
          <button class="btn outline sm" id="rg-doc">${L("Crear Google Doc (anexo)", "Create Google Doc (appendix)")}</button>
        </div>
      </div>`);
    const $ = (id) => document.getElementById(id);
    $("m-close").onclick = () => closeModal();
    $("rg-agregar").addEventListener("click", async () => {
      const texto = $("rg-nota").value.trim();
      if (!texto) return;
      await registrar([{ fecha: new Date().toISOString(), tipo: "nota", detalle: texto, origen: "faro" }]);
      closeModal(); abrirRegistro($("rg-filtro")?.value || "");
    });
    let t;
    $("rg-filtro").addEventListener("input", (e) => { clearTimeout(t); t = setTimeout(() => { closeModal(); abrirRegistro(e.target.value); document.getElementById("rg-filtro")?.focus(); }, 350); });
    $("rg-csv").addEventListener("click", () => descargar(`faro-registro-${new Date().toISOString().slice(0, 10)}.csv`, registroCsv(), "text/csv;charset=utf-8"));
    $("rg-doc").addEventListener("click", () => crearDocGoogle(L("Registro de decisiones", "Decision log"), registroHtml()));
  }

  async function crearDocGoogle(titulo, cuerpo) {
    try {
      showToast(L("Creando el Google Doc…", "Creating the Google Doc…"));
      const f = await ext().enviar({ tipo: "drive-crear-doc", titulo: `FARO · ${titulo}${project?.tema ? " — " + project.tema : ""}`.slice(0, 200), html: `<!doctype html><html><head><meta charset="utf-8"></head><body>${cuerpo}</body></html>` });
      if (f.webViewLink) window.open(f.webViewLink, "_blank", "noopener");
    } catch (e) { showToast("⚠ " + ext().errorAmigable(e)); }
  }

  // ============================================================
  // Saturación
  // ============================================================

  // FARO guarda la fecha como dd/mm/aa (es-AR). Si no se puede leer, se respeta el orden de carga.
  function fechaMaterial(m, i) {
    const x = String(m.date || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (!x) return { t: Infinity, i };
    const anio = x[3].length === 2 ? 2000 + Number(x[3]) : Number(x[3]);
    return { t: new Date(anio, Number(x[2]) - 1, Number(x[1])).getTime(), i };
  }

  function calcularSaturacion(tipo, orden) {
    const lista = materials.map((m, i) => ({ m, ...fechaMaterial(m, i) }))
      .filter(({ m }) => (tipo === "todos" || m.type === tipo) && (m.anns || []).some((a) => a.kind === "code" && !a.lost));
    if (orden === "fecha") lista.sort((a, b) => a.t - b.t || a.i - b.i);
    const vistos = new Set();
    return lista.map(({ m }) => {
      const nombres = new Set();
      for (const a of m.anns || []) {
        if (a.kind !== "code" || a.lost) continue;
        const c = savedCodes.find((x) => x.id === a.codeId);
        const n = nombreDe(c) || a.label;
        if (n) nombres.add(n);
      }
      const nuevos = [...nombres].filter((n) => !vistos.has(claveCodigo(n)));
      nuevos.forEach((n) => vistos.add(claveCodigo(n)));
      return { material: m.name, fecha: m.date || "", usados: nombres.size, nuevos, acumulado: vistos.size };
    });
  }

  function graficoSaturacion(serie) {
    const W = 620, H = 240, M = { l: 36, r: 36, t: 14, b: 40 };
    const n = serie.length;
    const maxNuevos = Math.max(1, ...serie.map((s) => s.nuevos.length));
    const maxAcum = Math.max(1, ...serie.map((s) => s.acumulado));
    const ancho = (W - M.l - M.r) / n;
    const x = (i) => M.l + ancho * i + ancho / 2;
    const yN = (v) => H - M.b - (v / maxNuevos) * (H - M.t - M.b);
    const yA = (v) => H - M.b - (v / maxAcum) * (H - M.t - M.b);
    const barras = serie.map((s, i) => `<rect x="${(x(i) - ancho * 0.32).toFixed(1)}" y="${yN(s.nuevos.length).toFixed(1)}" width="${(ancho * 0.64).toFixed(1)}" height="${(H - M.b - yN(s.nuevos.length)).toFixed(1)}" rx="2" fill="var(--amber, #e8a33d)" opacity=".85"><title>${esc(s.material)}: ${s.nuevos.length} ${L("nuevos", "new")}</title></rect>`).join("");
    const linea = serie.map((s, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${yA(s.acumulado).toFixed(1)}`).join(" ");
    const puntos = serie.map((s, i) => `<circle cx="${x(i).toFixed(1)}" cy="${yA(s.acumulado).toFixed(1)}" r="3" fill="var(--green-dark, #1e3a2f)"><title>${esc(s.material)}: ${s.acumulado} ${L("acumulados", "cumulative")}</title></circle>`).join("");
    const etiquetas = n <= 14 ? serie.map((s, i) => `<text x="${x(i).toFixed(1)}" y="${H - M.b + 14}" font-size="10" text-anchor="middle" fill="currentColor" opacity=".7">${i + 1}</text>`).join("") : "";
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(L("Códigos nuevos por material y acumulados", "New codes per material and cumulative"))}" style="color:var(--text2);max-width:100%">
      <line x1="${M.l}" y1="${H - M.b}" x2="${W - M.r}" y2="${H - M.b}" stroke="currentColor" opacity=".3"/>
      <text x="${M.l - 6}" y="${M.t + 8}" font-size="10" text-anchor="end" fill="var(--amber, #e8a33d)">${maxNuevos}</text>
      <text x="${W - M.r + 6}" y="${M.t + 8}" font-size="10" fill="var(--green-dark, #1e3a2f)">${maxAcum}</text>
      ${barras}<path d="${linea}" fill="none" stroke="var(--green-dark, #1e3a2f)" stroke-width="2"/>${puntos}${etiquetas}
      <text x="${(W / 2).toFixed(0)}" y="${H - 8}" font-size="10" text-anchor="middle" fill="currentColor" opacity=".7">${L("materiales, en orden", "materials, in order")}</text>
    </svg>
    <div class="tip" style="display:flex;gap:1rem;flex-wrap:wrap"><span><b style="color:var(--amber, #e8a33d)">■</b> ${L("códigos nuevos en ese material (eje izquierdo)", "new codes in that material (left axis)")}</span><span><b style="color:var(--green-dark, #1e3a2f)">●</b> ${L("códigos acumulados (eje derecho)", "cumulative codes (right axis)")}</span></div>`;
  }

  function abrirSaturacion(tipo = "todos", orden = "fecha") {
    const serie = calcularSaturacion(tipo, orden);
    const ultimos = serie.slice(-3);
    const sinNuevos = ultimos.length === 3 && ultimos.every((s) => s.nuevos.length === 0);
    const opt = (v, t, sel) => `<option value="${v}" ${v === sel ? "selected" : ""}>${t}</option>`;
    openModal(`<div class="modal-head"><div class="modal-title">${L("Saturación", "Saturation")}</div><button class="modal-close" id="m-close">✕</button></div>
      <div class="modal-body fg">
        <p class="fg-texto">${L("Cuántos códigos nuevos aparecen en cada material codificado. Cuando los materiales nuevos casi no agregan códigos, la curva se aplana: es un indicio para discutir la saturación, no una prueba. La saturación es un juicio teórico sobre las categorías, no solo un conteo.", "How many new codes each coded material adds. When new materials barely add codes, the curve flattens: it's evidence to discuss saturation, not proof. Saturation is a theoretical judgement about categories, not just a count.")}</p>
        <div style="display:flex;gap:.6rem;flex-wrap:wrap;margin-bottom:.8rem">
          <select class="field-in" id="sat-tipo" style="width:auto">${opt("todos", L("Todos los materiales", "All materials"), tipo)}${opt("entrevistas", L("Entrevistas", "Interviews"), tipo)}${opt("notas-campo", L("Notas de campo", "Field notes"), tipo)}${opt("documentos", L("Documentos", "Documents"), tipo)}</select>
          <select class="field-in" id="sat-orden" style="width:auto">${opt("fecha", L("Por fecha del material", "By material date"), orden)}${opt("carga", L("Por orden de carga", "By order added"), orden)}</select>
        </div>
        ${serie.length < 2 ? `<div class="tip">${L("Hacen falta al menos dos materiales codificados.", "At least two coded materials are needed.")}</div>` : `
          ${graficoSaturacion(serie)}
          ${sinNuevos ? `<div class="warn-box" style="margin:.6rem 0">${L("Los últimos tres materiales no sumaron códigos nuevos.", "The last three materials added no new codes.")}</div>` : ""}
          <div style="max-height:30vh;overflow:auto;margin-top:.6rem"><table style="width:100%;border-collapse:collapse;font-size:.8rem">
            <tr style="text-align:left;border-bottom:1px solid var(--border)"><th>#</th><th>${L("Material", "Material")}</th><th>${L("Fecha", "Date")}</th><th>${L("Nuevos", "New")}</th><th>${L("Acum.", "Cum.")}</th></tr>
            ${serie.map((s, i) => `<tr style="border-bottom:1px solid var(--border);vertical-align:top"><td>${i + 1}</td><td>${esc(ext().seud(s.material))}</td><td>${esc(s.fecha)}</td><td title="${esc(s.nuevos.join(", "))}">${s.nuevos.length}${s.nuevos.length ? `<div class="tip">${esc(s.nuevos.slice(0, 6).join(", "))}${s.nuevos.length > 6 ? "…" : ""}</div>` : ""}</td><td>${s.acumulado}</td></tr>`).join("")}
          </table></div>
          <div style="display:flex;gap:.5rem;margin-top:.8rem"><button class="btn outline sm" id="sat-csv">${L("Descargar CSV", "Download CSV")}</button></div>`}
      </div>`);
    const $ = (id) => document.getElementById(id);
    $("m-close").onclick = () => closeModal();
    const rehacer = () => { const t = $("sat-tipo").value, o = $("sat-orden").value; closeModal(); abrirSaturacion(t, o); };
    $("sat-tipo").addEventListener("change", rehacer);
    $("sat-orden").addEventListener("change", rehacer);
    $("sat-csv")?.addEventListener("click", () => {
      const filas = [["orden", "material", "fecha", "codigos_usados", "codigos_nuevos", "acumulado", "nuevos"]]
        .concat(serie.map((s, i) => [i + 1, ext().seud(s.material), s.fecha, s.usados, s.nuevos.length, s.acumulado, s.nuevos.join("; ")]));
      descargar(`faro-saturacion-${new Date().toISOString().slice(0, 10)}.csv`, "﻿" + filas.map((f) => f.map(csvCelda).join(",")).join("\n"), "text/csv;charset=utf-8");
    });
  }

  // ============================================================
  // Acuerdo entre codificadoras (κ con 2 personas, α con 2 o más)
  // ============================================================

  const pct = (x) => (x === null || x === undefined ? "—" : Math.round(x * 100) + "%");
  const num = (x) => (x === null || x === undefined ? "—" : x.toFixed(2).replace(".", lang === "en" ? "." : ","));
  const INTERP_EN = { "pobre": "poor", "leve": "slight", "aceptable": "fair", "moderado": "moderate", "sustancial": "substantial", "casi perfecto": "almost perfect", "—": "—" };
  const interp = (k) => { const x = FaroAcuerdo.interpretar(k); return lang === "en" ? INTERP_EN[x] : x; };
  const notaAlfa = () => L("Krippendorff (2004) recomienda α ≥ 0,80 para sacar conclusiones y acepta 0,667 ≤ α < 0,80 solo para conclusiones provisorias.", "Krippendorff (2004) recommends α ≥ .80 to draw conclusions and accepts .667 ≤ α < .80 only for tentative conclusions.");

  async function leerRespaldo(archivo) {
    const d = JSON.parse(await archivo.text());
    if (d && d._enc) {
      for (let i = 0; i < 5; i++) {
        const pass = await askPassword({ title: L("Respaldo cifrado", "Encrypted backup") + ": " + archivo.name, note: L("Escribí la contraseña de ese respaldo.", "Type that backup's password."), okLabel: L("Descifrar", "Decrypt") });
        if (pass === null) return null;
        try { return JSON.parse(await decryptText(pass, d)); } catch { showToast(L("Contraseña incorrecta", "Wrong password")); }
      }
      return null;
    }
    if (!d || !Array.isArray(d.materials)) throw new Error(L(`«${archivo.name}» no es un respaldo de FARO.`, `“${archivo.name}” isn't a FARO backup.`));
    return d;
  }

  function informeDos(r, yo, otra) {
    const seud = ext().seud;
    const filas = r.codigos.map((c) => `<tr><td>${esc(c.codigo)}</td><td>${num(c.kappa)}</td><td>${esc(interp(c.kappa))}</td><td>${pct(c.acuerdo)}</td><td>${c.a}</td><td>${c.b}</td><td>${c.ab}</td></tr>`).join("");
    const des = r.desacuerdos.slice(0, 100).map((d) => `<li><b>${esc(d.codigo)}</b> — ${esc(d.quien === "A" ? yo : otra)} ${L("solamente", "only")} · <i>${esc(seud(d.material))}</i>: «${esc(seud(d.texto.length > 300 ? d.texto.slice(0, 300) + "…" : d.texto))}»</li>`).join("");
    return `<h1>${L("Acuerdo entre codificadoras", "Inter-coder agreement")}</h1>
      <p><i>${esc(yo)} · ${esc(otra)} · ${esc(new Date().toLocaleDateString(lang === "en" ? "en-GB" : "es-AR"))}</i></p>
      <p><b>κ ${L("global", "overall")}: ${num(r.global.kappa)}</b> (${esc(interp(r.global.kappa))}) · ${L("acuerdo sobre lo codificado", "agreement on coded text")}: ${pct(r.global.acuerdo)} · ${r.materiales.length} ${L("materiales comparados", "materials compared")}</p>
      <p>${L("Método: κ de Cohen a nivel de carácter por código y material (el mismo cálculo que la consulta de comparación de NVivo); los totales suman las tablas de todos los materiales, es decir, ponderan por extensión. «Acuerdo sobre lo codificado» = caracteres codificados por ambas / codificados por al menos una. Interpretación de Landis y Koch (1977).", "Method: Cohen's κ at character level per code and material (the same calculation as NVivo's coding comparison query); totals pool the tables of all materials, i.e. weight by length. “Agreement on coded text” = characters coded by both / coded by at least one. Landis & Koch (1977) interpretation.")}</p>
      <table border="1" cellpadding="4"><tr><th>${L("Código", "Code")}</th><th>κ</th><th>${L("Nivel", "Level")}</th><th>${L("Acuerdo sobre lo codificado", "Agreement on coded")}</th><th>${L("Solo", "Only")} ${esc(yo)}</th><th>${L("Solo", "Only")} ${esc(otra)}</th><th>${L("Ambas", "Both")}</th></tr>${filas}</table>
      ${des ? `<h2>${L("Desacuerdos", "Disagreements")}</h2><ul>${des}</ul>` : ""}`;
  }

  function informeVarios(r, nombres) {
    return `<h1>${L("Acuerdo entre codificadoras", "Inter-coder agreement")}</h1>
      <p><i>${esc(nombres.join(" · "))} · ${esc(new Date().toLocaleDateString(lang === "en" ? "en-GB" : "es-AR"))}</i></p>
      <p><b>α ${L("de Krippendorff global", "Krippendorff's overall")}: ${num(r.alfa)}</b> · ${r.personas} ${L("personas", "people")} · ${r.materiales} ${L("materiales comparados", "materials compared")}</p>
      <p>${L("Método: α de Krippendorff para datos nominales; cada carácter de cada material es una unidad y, para cada código, cada persona lo codificó o no.", "Method: Krippendorff's α for nominal data; each character of each material is a unit and, for each code, each person either coded it or not.")} ${notaAlfa()}</p>
      <table border="1" cellpadding="4"><tr><th>${L("Código", "Code")}</th><th>α</th>${nombres.map((n) => `<th>${esc(n)}</th>`).join("")}</tr>
      ${r.codigos.map((c) => `<tr><td>${esc(c.codigo)}</td><td>${num(c.alfa)}</td>${c.porPersona.map((v) => `<td>${v}</td>`).join("")}</tr>`).join("")}</table>
      <h2>${L("κ de Cohen por pares", "Pairwise Cohen's κ")}</h2>
      <ul>${r.pares.map((p) => `<li>${esc(nombres[p.a])} – ${esc(nombres[p.b])}: ${num(p.kappa)}</li>`).join("")}</ul>`;
  }

  function abrirAcuerdo() {
    openModal(`<div class="modal-head"><div class="modal-title">${L("Acuerdo entre codificadoras", "Inter-coder agreement")}</div><button class="modal-close" id="m-close">✕</button></div>
      <div class="modal-body fg">
        <p class="fg-texto">${L("Compará tu codificación con la de otras personas sobre los mismos materiales. Pediles su respaldo de FARO («Respaldar / Descargar datos») y elegilos acá: con una persona se calcula κ de Cohen y α de Krippendorff; con dos o más, α y κ por pares. No se modifica nada de tu proyecto.", "Compare your coding with other people's on the same materials. Ask for their FARO backups (“Backup / Download data”) and pick them here: with one person you get Cohen's κ and Krippendorff's α; with two or more, α and pairwise κ. Nothing in your project changes.")}</p>
        <div style="display:flex;gap:.6rem;flex-wrap:wrap;margin-bottom:.8rem">
          <div class="field-row" style="flex:1;min-width:140px"><label class="field-label">${L("Tu nombre", "Your name")}</label><input class="field-in" id="ka-yo" value="${esc(L("Yo", "Me"))}"/></div>
          <div class="field-row" style="flex:1;min-width:140px"><label class="field-label">${L("La otra persona (si es una sola)", "The other person (if just one)")}</label><input class="field-in" id="ka-otra" placeholder="${esc(L("Nombre", "Name"))}"/></div>
        </div>
        <div class="field-row"><label class="field-label">${L("Respaldos de las otras personas (.json, uno o varios)", "Other people's backups (.json, one or more)")}</label><input type="file" id="ka-archivo" accept=".json,application/json" multiple/></div>
        <div id="ka-resultado" style="margin-top:1rem"></div>
      </div>`);
    const $ = (id) => document.getElementById(id);
    $("m-close").onclick = () => closeModal();
    $("ka-archivo").addEventListener("change", async (ev) => {
      const archivos = [...ev.target.files];
      if (!archivos.length) return;
      const caja = $("ka-resultado");
      const seud = ext().seud;
      try {
        const otros = [];
        for (const f of archivos) { const d = await leerRespaldo(f); if (!d) return; otros.push(d); }
        const yo = $("ka-yo").value.trim() || L("Yo", "Me");
        const nombresOtros = archivos.map((f, i) => (archivos.length === 1 && $("ka-otra").value.trim()) || f.name.replace(/\.json$/i, "") || `P${i + 2}`);
        const nombres = [yo, ...nombresOtros];
        const proyectos = [{ materials, savedCodes }, ...otros];
        const varios = FaroAcuerdo.compararVarios(proyectos);
        if (!varios.materiales) {
          caja.innerHTML = `<div class="warn-box">${L("No hay materiales en común para comparar. Tienen que ser los mismos (el mismo Google Doc, la misma página web o el mismo nombre), con el mismo texto, en todos los respaldos.", "There are no materials in common. They must be the same (same Google Doc, web page or name) with the same text in every backup.")}</div>`;
          return;
        }
        const tarjeta = (titulo, valor, pie) => `<div><div class="field-label">${titulo}</div><div style="font-size:1.8rem;font-weight:600">${valor}</div>${pie ? `<div class="tip">${pie}</div>` : ""}</div>`;
        let html, informe;
        if (otros.length === 1) {
          const r = FaroAcuerdo.comparar(proyectos[0], proyectos[1]);
          const otra = nombresOtros[0];
          informe = () => informeDos(r, yo, otra);
          guardarUltimoAcuerdo({ fecha: new Date().toISOString(), nombres: [yo, otra], kappa: r.global.kappa, alfa: varios.alfa, acuerdo: r.global.acuerdo, materiales: r.materiales.length,
            codigos: r.codigos.map((c) => ({ codigo: c.codigo, kappa: c.kappa, alfa: (varios.codigos.find((x) => claveCodigo(x.codigo) === claveCodigo(c.codigo)) || {}).alfa ?? null, acuerdo: c.acuerdo })) });
          const motivos = { "texto-distinto": L("el texto no es idéntico", "the text isn't identical"), "solo-a": L("solo lo tenés vos", "only you have it"), "solo-b": L("solo lo tiene la otra persona", "only the other person has it") };
          html = `
            <div style="display:flex;gap:1.4rem;align-items:baseline;flex-wrap:wrap;padding:.8rem 1rem;border:1px solid var(--border);border-radius:10px;margin-bottom:.8rem">
              ${tarjeta("κ " + L("global", "overall"), num(r.global.kappa), esc(interp(r.global.kappa)))}
              ${tarjeta("α " + L("de Krippendorff", "Krippendorff"), num(varios.alfa), "")}
              ${tarjeta(L("Acuerdo sobre lo codificado", "Agreement on coded text"), pct(r.global.acuerdo), "")}
              ${tarjeta(L("Materiales comparados", "Materials compared"), r.materiales.length, "")}
            </div>
            <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:.8rem">
              <tr style="text-align:left;border-bottom:1px solid var(--border)"><th>${L("Código", "Code")}</th><th>κ</th><th>α</th><th>${L("Acuerdo", "Agreement")}</th><th>${L("Solo", "Only")} ${esc(yo)}</th><th>${L("Solo", "Only")} ${esc(otra)}</th></tr>
              ${r.codigos.map((c) => { const a = varios.codigos.find((x) => claveCodigo(x.codigo) === claveCodigo(c.codigo)); return `<tr style="border-bottom:1px solid var(--border)"><td>${esc(c.codigo)}</td><td title="${esc(interp(c.kappa))}">${num(c.kappa)}</td><td>${num(a?.alfa)}</td><td>${pct(c.acuerdo)}</td><td>${c.a}</td><td>${c.b}</td></tr>`; }).join("")}
            </table></div>
            <p class="tip" style="margin-top:.4rem">${L("Ordenados de menor a mayor acuerdo. «Solo…» = caracteres que codificó una sola persona.", "Sorted from lowest to highest agreement. “Only…” = characters coded by one person only.")} ${notaAlfa()}</p>
            ${r.noComparables.length ? `<details style="margin:.6rem 0"><summary class="tip">${r.noComparables.length} ${L("materiales no comparados", "materials not compared")}</summary><ul class="tip">${r.noComparables.map((n) => `<li>${esc(seud(n.nombre))}: ${esc(motivos[n.motivo])}</li>`).join("")}</ul></details>` : ""}
            ${r.desacuerdos.length ? `<details style="margin:.6rem 0"><summary class="field-label" style="cursor:pointer">${L("Ver desacuerdos", "See disagreements")} (${r.desacuerdos.length})</summary><ul style="font-size:.8rem;max-height:240px;overflow:auto">${r.desacuerdos.slice(0, 200).map((d) => `<li><b>${esc(d.codigo)}</b> · ${esc(d.quien === "A" ? yo : otra)} · <i>${esc(seud(d.material))}</i>: «${esc(seud(d.texto.length > 200 ? d.texto.slice(0, 200) + "…" : d.texto))}»</li>`).join("")}</ul></details>` : ""}`;
          var csvTexto = () => FaroAcuerdo.csv(r, yo, otra);
        } else {
          informe = () => informeVarios(varios, nombres);
          guardarUltimoAcuerdo({ fecha: new Date().toISOString(), nombres, kappa: null, alfa: varios.alfa, acuerdo: null, materiales: varios.materiales,
            codigos: varios.codigos.map((c) => ({ codigo: c.codigo, kappa: null, alfa: c.alfa, acuerdo: null })) });
          html = `
            <div style="display:flex;gap:1.4rem;align-items:baseline;flex-wrap:wrap;padding:.8rem 1rem;border:1px solid var(--border);border-radius:10px;margin-bottom:.8rem">
              ${tarjeta("α " + L("de Krippendorff", "Krippendorff"), num(varios.alfa), "")}
              ${tarjeta(L("Personas", "People"), varios.personas, "")}
              ${tarjeta(L("Materiales comparados", "Materials compared"), varios.materiales, "")}
            </div>
            <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:.8rem">
              <tr style="text-align:left;border-bottom:1px solid var(--border)"><th>${L("Código", "Code")}</th><th>α</th>${nombres.map((n) => `<th>${esc(n)}</th>`).join("")}</tr>
              ${varios.codigos.map((c) => `<tr style="border-bottom:1px solid var(--border)"><td>${esc(c.codigo)}</td><td>${num(c.alfa)}</td>${c.porPersona.map((v) => `<td>${v}</td>`).join("")}</tr>`).join("")}
            </table></div>
            <p class="tip" style="margin-top:.4rem">${L("Las columnas con nombres muestran cuántos caracteres codificó cada persona con ese código.", "Name columns show how many characters each person coded with that code.")} ${notaAlfa()}</p>
            <div class="field-label" style="margin-top:.8rem">${L("κ de Cohen por pares", "Pairwise Cohen's κ")}</div>
            <ul style="font-size:.85rem;margin:.3rem 0">${varios.pares.map((p) => `<li>${esc(nombres[p.a])} – ${esc(nombres[p.b])}: <b>${num(p.kappa)}</b> <span class="tip">${esc(interp(p.kappa))}</span></li>`).join("")}</ul>`;
          var csvTexto = () => "﻿" + [["codigo", "alfa", ...nombres]].concat(varios.codigos.map((c) => [c.codigo, c.alfa, ...c.porPersona]), [["(todos)", varios.alfa]]).map((f) => f.map((v) => csvCelda(typeof v === "number" && !Number.isInteger(v) ? Math.round(v * 1000) / 1000 : v)).join(",")).join("\n");
        }
        caja.innerHTML = html + `<div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.8rem">
            <button class="btn outline sm" id="ka-csv">${L("Descargar CSV", "Download CSV")}</button>
            <button class="btn outline sm" id="ka-doc">${L("Crear Google Doc con el informe", "Create a Google Doc with the report")}</button></div>`;
        $("ka-csv").addEventListener("click", () => descargar(`faro-acuerdo-${new Date().toISOString().slice(0, 10)}.csv`, csvTexto(), "text/csv;charset=utf-8"));
        $("ka-doc").addEventListener("click", () => crearDocGoogle(L("Acuerdo entre codificadoras", "Inter-coder agreement") + " — " + nombres.join(" / "), informe()));
      } catch (e) {
        caja.innerHTML = `<div class="warn-box">${esc(e.message || String(e))}</div>`;
      } finally { ev.target.value = ""; }
    });
  }

  async function guardarUltimoAcuerdo(r) {
    ultimoAcuerdo = r;
    try { await idbSet("kv", K_ACUERDO, r); } catch { /* opcional */ }
  }

  // ============================================================
  // Memos por fragmento
  // ============================================================

  async function guardarMemos() { await idbSet("kv", K_MEMOS, memos); pintarMarcas(); }

  function fragmentosCodificados() {
    const out = [];
    for (const m of materials) for (const a of m.anns || []) {
      if (a.kind !== "code" || a.lost) continue;
      const c = savedCodes.find((x) => x.id === a.codeId);
      out.push({ m, a, codigo: nombreDe(c) || a.label || "" });
    }
    return out;
  }

  function abrirMemos(filtroCodigo = "", soloConMemo = false) {
    const todos = fragmentosCodificados();
    const codigos = [...new Set(todos.map((f) => f.codigo))].sort((x, y) => x.localeCompare(y, lang));
    const lista = todos.filter((f) => (!filtroCodigo || f.codigo === filtroCodigo) && (!soloConMemo || memos[f.a.id]));
    const opt = (v, t, sel) => `<option value="${esc(v)}" ${v === sel ? "selected" : ""}>${esc(t)}</option>`;
    openModal(`<div class="modal-head"><div class="modal-title">${L("Memos de fragmentos", "Fragment memos")}</div><button class="modal-close" id="m-close">✕</button></div>
      <div class="modal-body fg">
        <p class="fg-texto">${L("Una nota analítica pegada a cada fragmento codificado: lo que pensaste al codificarlo. Se ven al pasar el mouse sobre el fragmento (subrayado punteado), en «Citar en tu texto» y en el anexo.", "An analytic note attached to each coded fragment: what you thought when coding it. Shown when hovering the fragment (dotted underline), in “Cite in your text” and in the appendix.")}</p>
        <div style="display:flex;gap:.6rem;flex-wrap:wrap;margin-bottom:.8rem">
          <select class="field-in" id="mm-codigo" style="width:auto">${opt("", L("Todos los códigos", "All codes"), filtroCodigo)}${codigos.map((c) => opt(c, c, filtroCodigo)).join("")}</select>
          <label style="display:flex;gap:.4rem;align-items:center;font-size:.8rem"><input type="checkbox" id="mm-solo" ${soloConMemo ? "checked" : ""}/> ${L("Solo con memo", "Only with a memo")}</label>
        </div>
        ${lista.length ? `<div style="max-height:52vh;overflow:auto">${lista.map((f) => `
          <div style="border:1px solid var(--border);border-left:3px solid ${esc(colorDe(f.codigo))};border-radius:8px;padding:.6rem .7rem;margin-bottom:.5rem">
            <div class="tip" style="margin-bottom:.2rem"><b>${esc(f.codigo)}</b> · ${esc(f.m.name)}</div>
            <div style="font-size:.85rem;margin-bottom:.4rem">«${esc(f.a.quote.length > 400 ? f.a.quote.slice(0, 400) + "…" : f.a.quote)}»</div>
            <textarea class="field-in" data-memo="${esc(f.a.id)}" rows="2" placeholder="${esc(L("Memo analítico…", "Analytic memo…"))}" style="width:100%">${esc(memos[f.a.id] || "")}</textarea>
          </div>`).join("")}</div>` : `<div class="tip">${L("No hay fragmentos con ese filtro.", "No fragments match that filter.")}</div>`}
      </div>`);
    const $ = (id) => document.getElementById(id);
    $("m-close").onclick = () => closeModal();
    const rehacer = () => { const c = $("mm-codigo").value, so = $("mm-solo").checked; closeModal(); abrirMemos(c, so); };
    $("mm-codigo").addEventListener("change", rehacer);
    $("mm-solo").addEventListener("change", rehacer);
    const timers = {};
    document.querySelectorAll("textarea[data-memo]").forEach((ta) => ta.addEventListener("input", () => {
      clearTimeout(timers[ta.dataset.memo]);
      timers[ta.dataset.memo] = setTimeout(async () => {
        const v = ta.value.trim();
        if (v) memos[ta.dataset.memo] = v; else delete memos[ta.dataset.memo];
        await guardarMemos();
      }, 500);
    }));
  }

  // ============================================================
  // Anexo de codificación (para la tesis)
  // ============================================================

  function anexoHtml(opciones) {
    const seud = ext().seud;
    const frs = fragmentosCodificados();
    const porCodigo = new Map();
    for (const f of frs) {
      const k = claveCodigo(f.codigo);
      if (!porCodigo.has(k)) porCodigo.set(k, { frags: [], mats: new Set() });
      porCodigo.get(k).frags.push(f); porCodigo.get(k).mats.add(f.m.id);
    }
    const totalMats = new Set(frs.map((f) => f.m.id)).size;
    const codigos = savedCodes.slice().sort((a, b) => String(a.code).localeCompare(String(b.code), lang));
    const fechaHoy = new Date().toLocaleDateString(lang === "en" ? "en-GB" : "es-AR");
    const p = (t) => `<p>${esc(t)}</p>`;
    let h = `<h1>${L("Anexo: proceso de codificación", "Appendix: coding process")}</h1>
      <p><i>${esc(project?.tema || "")}${project?.tema ? " · " : ""}${L("Generado con FARO el", "Generated with FARO on")} ${esc(fechaHoy)}</i></p>
      <p>${(() => { const pl = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
        return L(`El corpus codificado incluye ${pl(totalMats, "material", "materiales")} y ${pl(frs.length, "fragmento codificado", "fragmentos codificados")} con ${pl(porCodigo.size, "código", "códigos")}.`,
          `The coded corpus includes ${pl(totalMats, "material", "materials")} and ${pl(frs.length, "fragment", "fragments")} coded with ${pl(porCodigo.size, "code", "codes")}.`); })()}${Array.isArray(pseudoDict) && pseudoDict.length ? " " + L("Los nombres propios se reemplazaron por seudónimos.", "Proper names were replaced with pseudonyms.") : ""}</p>`;

    h += `<h2>1. ${L("Libro de códigos", "Codebook")}</h2>`;
    for (const c of codigos) {
      const info = porCodigo.get(claveCodigo(c.code));
      const ejemplo = info ? info.frags[0] : null;
      h += `<h3>${esc(c.code)}</h3>`;
      if (c.desc) h += p(c.desc);
      if (c.incl) h += `<p><b>${L("Cuándo aplicarlo:", "When to apply:")}</b> ${esc(c.incl)}</p>`;
      if (c.excl) h += `<p><b>${L("Cuándo no aplicarlo:", "When not to apply:")}</b> ${esc(c.excl)}</p>`;
      if (!c.desc && !c.incl && !c.excl) h += `<p><i>${L("Sin definición registrada.", "No definition recorded.")}</i></p>`;
      if (c.ejemplo) h += `<p><b>${L("Ejemplo:", "Example:")}</b> ${esc(seud(c.ejemplo))}</p>`;
      else if (ejemplo) h += `<p><b>${L("Ejemplo del corpus:", "Example from the corpus:")}</b> «${esc(seud(ejemplo.a.quote.length > 350 ? ejemplo.a.quote.slice(0, 350) + "…" : ejemplo.a.quote))}» (${esc(seud(ejemplo.m.name))})</p>`;
    }

    h += `<h2>2. ${L("Frecuencias", "Frequencies")}</h2>
      <table border="1" cellpadding="4"><tr><th>${L("Código", "Code")}</th><th>${L("Fragmentos", "Fragments")}</th><th>${L("Materiales", "Materials")}</th><th>${L("% de materiales", "% of materials")}</th></tr>
      ${codigos.map((c) => { const i = porCodigo.get(claveCodigo(c.code)); const n = i ? i.frags.length : 0, mm = i ? i.mats.size : 0;
        return `<tr><td>${esc(c.code)}</td><td>${n}</td><td>${mm}</td><td>${totalMats ? Math.round(mm / totalMats * 100) : 0}%</td></tr>`; }).join("")}</table>`;

    const decisiones = registro.filter((e) => e.tipo !== "inicio");
    h += `<h2>3. ${L("Decisiones sobre el libro de códigos", "Codebook decisions")}</h2>`;
    h += decisiones.length ? `<table border="1" cellpadding="4"><tr><th>${L("Fecha", "Date")}</th><th>${L("Cambio", "Change")}</th><th>${L("Detalle", "Detail")}</th></tr>
      ${decisiones.map((e) => `<tr><td>${esc(new Date(e.fecha).toLocaleDateString(lang === "en" ? "en-GB" : "es-AR"))}</td><td>${esc(TIPOS[e.tipo] ? TIPOS[e.tipo]() : e.tipo)}</td><td>${esc(seud(describir(e)))}</td></tr>`).join("")}</table>`
      : `<p><i>${L("No hay cambios registrados.", "No changes recorded.")}</i></p>`;

    h += `<h2>4. ${L("Acuerdo entre codificadoras", "Inter-coder agreement")}</h2>`;
    if (ultimoAcuerdo) {
      const a = ultimoAcuerdo;
      h += `<p>${L(`Codificación comparada entre ${a.nombres.join(", ")} (${new Date(a.fecha).toLocaleDateString("es-AR")}), sobre ${a.materiales} materiales en común.`, `Coding compared between ${a.nombres.join(", ")} (${new Date(a.fecha).toLocaleDateString("en-GB")}), over ${a.materiales} shared materials.`)}
        ${a.kappa !== null ? `κ ${L("de Cohen global", "Cohen's overall")}: <b>${num(a.kappa)}</b> (${esc(interp(a.kappa))}). ` : ""}α ${L("de Krippendorff global", "Krippendorff's overall")}: <b>${num(a.alfa)}</b>.</p>
        <p>${L("Método: unidades a nivel de carácter, por código y material; κ de Cohen (interpretación de Landis y Koch, 1977) y α de Krippendorff para datos nominales (Krippendorff, 2004).", "Method: character-level units, per code and material; Cohen's κ (Landis & Koch, 1977 interpretation) and Krippendorff's α for nominal data (Krippendorff, 2004).")}</p>
        <table border="1" cellpadding="4"><tr><th>${L("Código", "Code")}</th>${a.kappa !== null ? "<th>κ</th>" : ""}<th>α</th></tr>
        ${a.codigos.map((c) => `<tr><td>${esc(c.codigo)}</td>${a.kappa !== null ? `<td>${num(c.kappa)}</td>` : ""}<td>${num(c.alfa)}</td></tr>`).join("")}</table>`;
    } else {
      h += `<p><i>${L("No se calculó el acuerdo entre codificadoras (menú ＋ → Acuerdo entre codificadoras).", "Inter-coder agreement wasn't computed (＋ menu → Inter-coder agreement).")}</i></p>`;
    }

    if (opciones.memos) {
      const conMemo = frs.filter((f) => memos[f.a.id]);
      h += `<h2>5. ${L("Memos analíticos", "Analytic memos")}</h2>`;
      h += conMemo.length ? conMemo.map((f) => `<p><b>${esc(f.codigo)}</b> · ${esc(seud(f.m.name))}<br>«${esc(seud(f.a.quote.length > 300 ? f.a.quote.slice(0, 300) + "…" : f.a.quote))}»<br><i>✎ ${esc(seud(memos[f.a.id]))}</i></p>`).join("")
        : `<p><i>${L("No hay memos.", "No memos.")}</i></p>`;
    }
    return h;
  }

  function abrirAnexo() {
    openModal(`<div class="modal-head"><div class="modal-title">${L("Anexo de codificación", "Coding appendix")}</div><button class="modal-close" id="m-close">✕</button></div>
      <div class="modal-body fg">
        <p class="fg-texto">${L("Arma de una vez el anexo metodológico de tu tesis: libro de códigos con definiciones y un ejemplo real, frecuencias, decisiones sobre los códigos y acuerdo entre codificadoras. Con seudónimos si tenés diccionario.", "Builds your thesis' methodological appendix at once: codebook with definitions and a real example, frequencies, codebook decisions and inter-coder agreement. With pseudonyms if you have a dictionary.")}</p>
        <label style="display:flex;gap:.4rem;align-items:center;font-size:.85rem;margin:.4rem 0 1rem"><input type="checkbox" id="ax-memos"/> ${L("Incluir los memos analíticos", "Include analytic memos")}</label>
        ${ultimoAcuerdo ? "" : `<div class="tip" style="margin-bottom:.8rem">${L("Todavía no calculaste el acuerdo entre codificadoras: esa sección va a quedar vacía.", "You haven't computed inter-coder agreement yet: that section will be empty.")}</div>`}
        <div style="display:flex;gap:.5rem;flex-wrap:wrap">
          <button class="btn green sm" id="ax-doc">${L("Crear Google Doc", "Create Google Doc")}</button>
          <button class="btn outline sm" id="ax-word">${L("Descargar para Word", "Download for Word")}</button>
          <button class="btn outline sm" id="ax-ver">${L("Vista previa", "Preview")}</button>
        </div>
        <style>#ax-previa h1{font-size:1.25rem;margin:.2rem 0 .4rem}#ax-previa h2{font-size:1.05rem;margin:1.1rem 0 .4rem}#ax-previa h3{font-size:.95rem;margin:.8rem 0 .2rem}#ax-previa p{margin:.25rem 0;font-size:.85rem}#ax-previa table{border-collapse:collapse;font-size:.82rem;margin:.4rem 0}#ax-previa td,#ax-previa th{border:1px solid var(--border);padding:.25rem .5rem;text-align:left}</style>
        <div id="ax-previa" style="margin-top:1rem;max-height:40vh;overflow:auto;border:1px solid var(--border);border-radius:8px;padding:.6rem 1rem" hidden></div>
      </div>`);
    const $ = (id) => document.getElementById(id);
    $("m-close").onclick = () => closeModal();
    const html = () => anexoHtml({ memos: $("ax-memos").checked });
    $("ax-ver").addEventListener("click", () => { const pv = $("ax-previa"); pv.innerHTML = html(); pv.hidden = false; });
    $("ax-doc").addEventListener("click", () => crearDocGoogle(L("Anexo de codificación", "Coding appendix"), html()));
    $("ax-word").addEventListener("click", () => {
      const doc = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>FARO</title></head><body>${html()}</body></html>`;
      descargar(`faro-anexo-codificacion-${new Date().toISOString().slice(0, 10)}.doc`, "\ufeff" + doc, "application/msword");
    });
  }

  // ============================================================
  // Menú «＋» del encabezado
  // ============================================================

  function abrirMenu() {
    const items = [
      ["acuerdo", "κ", L("Acuerdo entre codificadoras", "Inter-coder agreement"), L("κ de Cohen y α de Krippendorff con los respaldos de otras personas.", "Cohen's κ and Krippendorff's α with other people's backups.")],
      ["saturacion", "↗", L("Saturación", "Saturation"), L("Códigos nuevos por material: ¿se aplana la curva?", "New codes per material: is the curve flattening?")],
      ["registro", "✎", L("Registro de decisiones", "Decision log"), L("Historial del libro de códigos y notas con el porqué.", "Codebook history and notes on the why.")],
      ["anexo", "▤", L("Anexo de codificación", "Coding appendix"), L("Libro de códigos, frecuencias, decisiones y acuerdo, listo para la tesis.", "Codebook, frequencies, decisions and agreement, ready for the thesis.")],
      ["memos", "✎", L("Memos de fragmentos", "Fragment memos"), L("Notas analíticas pegadas a cada fragmento codificado.", "Analytic notes attached to each coded fragment.")],
      ["colores", "◐", L("Colores de códigos", "Code colours"), L("Un color por código en FARO, Google Docs y el complemento.", "One colour per code in FARO, Google Docs and the add-on.")]
    ];
    openModal(`<div class="modal-head"><div class="modal-title">${L("Herramientas de análisis", "Analysis tools")}</div><button class="modal-close" id="m-close">✕</button></div>
      <div class="modal-body fg"><div class="mat-list">${items.map(([id, sym, t, d]) => `
        <button class="mat-item" data-herramienta="${id}" style="display:flex;gap:.8rem;align-items:center;text-align:left;width:100%;cursor:pointer;background:none;border:1px solid var(--border);border-radius:8px;padding:.7rem .8rem;margin-bottom:.4rem;color:inherit;font:inherit">
          <span style="font-size:1.3rem;width:1.6rem;text-align:center">${sym}</span>
          <span class="mat-info"><span class="mat-name" style="display:block">${t}</span><span class="mat-meta">${d}</span></span>
        </button>`).join("")}</div></div>`);
    document.getElementById("m-close").onclick = () => closeModal();
    const acciones = { acuerdo: abrirAcuerdo, saturacion: () => abrirSaturacion(), registro: () => abrirRegistro(), colores: abrirColores, anexo: abrirAnexo, memos: () => abrirMemos() };
    document.querySelectorAll("[data-herramienta]").forEach((b) => b.addEventListener("click", () => { closeModal(); acciones[b.dataset.herramienta](); }));
  }

  function agregarBoton() {
    if (document.getElementById("faro-mas-btn")) return;
    const ancla = document.getElementById("faro-google-btn") || document.getElementById("search-btn");
    if (!ancla) return;
    const b = document.createElement("button");
    b.className = "theme-btn";
    b.id = "faro-mas-btn";
    b.textContent = "＋";
    b.style.fontWeight = "600";
    b.title = L("Herramientas de análisis", "Analysis tools");
    b.setAttribute("aria-label", b.title);
    b.addEventListener("click", abrirMenu);
    ancla.before(b);
  }

  // ============================================================
  // Inicio
  // ============================================================

  window.FaroHerramientas = {
    colores: () => colores,
    memos: () => memos,
    guardarMemos,
    extras: () => ({ colores, registro, memos }),
    async restaurarExtras(x) {
      if (x && x.colores && typeof x.colores === "object") { colores = x.colores; await idbSet("kv", K_COLORES, colores); }
      if (x && Array.isArray(x.registro)) { registro = x.registro.slice(-MAX_REGISTRO); await idbSet("kv", K_REGISTRO, registro); }
      if (x && x.memos && typeof x.memos === "object") { memos = x.memos; await idbSet("kv", K_MEMOS, memos); }
    },
    abrirAcuerdo, abrirSaturacion, abrirRegistro, abrirColores, abrirMemos, abrirAnexo, anexoHtml, calcularSaturacion, diferencias
  };

  (async () => {
    await ext().esperarListo();
    try {
      colores = (await idbGet("kv", K_COLORES)) || {};
      registro = (await idbGet("kv", K_REGISTRO)) || [];
      memos = (await idbGet("kv", K_MEMOS)) || {};
      ultimoAcuerdo = (await idbGet("kv", K_ACUERDO)) || null;
      foto = (await idbGet("kv", K_FOTO)) || null;
    } catch { /* base recién creada */ }
    // Cambios hechos con FARO cerrado (desde Docs o el panel) se detectan al abrir.
    if (!foto) {
      foto = tomarFoto();
      await idbSet("kv", K_FOTO, foto);
      await registrar([{ fecha: new Date().toISOString(), tipo: "inicio", origen: "faro" }]);
    } else {
      await actualizarRegistro("externo");
    }
    // Después de cada guardado de FARO, registrar lo que cambió en el libro de códigos.
    const persistAnterior = window.persist;
    let llegaDeAfuera = false;
    window.persist = async function (...args) {
      const r = await persistAnterior.apply(this, args);
      try { await actualizarRegistro(llegaDeAfuera ? "externo" : "faro"); } catch (e) { console.error(e); }
      return r;
    };
    chrome.runtime.onMessage.addListener((msg) => { if (msg?.tipo === "faro-aplicar-op") { llegaDeAfuera = true; setTimeout(() => { llegaDeAfuera = false; }, 1500); } return false; });
    agregarBoton();
    observador.observe(document.body, { childList: true, subtree: true });
    pintarMarcas();
  })();
})();
