// FARO · operaciones compartidas
// Lo usan el service worker (sobre la base de datos de FARO) y la pestaña de FARO (sobre su estado en memoria).
// Cada operación trae sus IDs ya generados, así aplicarla dos veces da el mismo resultado (idempotente).

(function (global) {
  "use strict";

  const DB_NAME = "cuaderno-etno"; // la misma base que usa FARO
  const CLAVE_DOC = "Google Doc";
  const CLAVE_FUENTE = "Fuente";
  const TIPOS = ["notas-campo", "entrevistas", "documentos"];

  const uid = (p) => (p || "id") + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
  const hoy = () => new Date().toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" });

  // Texto de Docs (export) y texto copiado difieren en saltos de línea, BOM y espacios duros.
  function normalizarTexto(t) {
    return String(t || "")
      .replace(/^﻿/, "")
      .replace(/\r\n?/g, "\n")
      .replace(/[   ]/g, " ")
      .replace(/[​‌‍⁠]/g, "")
      .replace(/\u000b/g, "\n");
  }

  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const unificarComillas = (s) => s.replace(/[“”«»]/g, '"').replace(/[‘’]/g, "'");

  // Todas las apariciones de la cita en el texto, tolerando diferencias de espacios y comillas.
  function apariciones(texto, cita) {
    const t = unificarComillas(texto);
    const palabras = unificarComillas(normalizarTexto(cita)).trim().split(/\s+/).filter(Boolean);
    if (!palabras.length) return [];
    const re = new RegExp(palabras.map(escRe).join("\\s+"), "g");
    const out = [];
    let m;
    while ((m = re.exec(t))) {
      out.push({ start: m.index, end: m.index + m[0].length });
      if (m[0].length === 0) re.lastIndex++;
    }
    return out;
  }

  function buscarCita(texto, cita, cerca) {
    const ap = apariciones(texto, cita);
    if (!ap.length) return null;
    if (typeof cerca !== "number") return ap[0];
    return ap.reduce((a, b) => (Math.abs(b.start - cerca) < Math.abs(a.start - cerca) ? b : a));
  }

  function buscarCodigo(codigos, nombre) {
    const n = String(nombre || "").trim().toLowerCase();
    return codigos.find((c) => String(c.code || "").trim().toLowerCase() === n);
  }

  function asegurarCodigo(estado, nombre, idNuevo) {
    let c = buscarCodigo(estado.savedCodes, nombre);
    if (!c) {
      c = estado.savedCodes.find((x) => x.id === idNuevo);
      if (!c) {
        c = { id: idNuevo || uid("cod"), code: String(nombre).trim(), date: hoy(), desc: "", incl: "", excl: "", ejemplo: "" };
        estado.savedCodes.push(c);
      }
    }
    return c;
  }

  const materialDeDoc = (estado, docId) =>
    estado.materials.find((m) => m.attrs && m.attrs[CLAVE_DOC] === docId);

  // Si el Doc cambió desde que se importó, actualiza el texto y reubica las anotaciones por su cita.
  function reanclar(material, textoNuevo) {
    textoNuevo = normalizarTexto(textoNuevo);
    if (material.text === textoNuevo) return { cambiado: false, perdidas: 0 };
    let perdidas = 0;
    for (const a of material.anns || []) {
      const pos = a.quote ? buscarCita(textoNuevo, a.quote, a.start) : null;
      if (pos) { a.start = pos.start; a.end = pos.end; delete a.lost; }
      else { a.lost = true; perdidas++; }
    }
    material.text = textoNuevo;
    return { cambiado: true, perdidas };
  }

  function importarDoc(estado, op) {
    let m = materialDeDoc(estado, op.docId) || estado.materials.find((x) => x.id === op.ids.mat);
    let resultado = { creado: false, cambiado: false, perdidas: 0 };
    if (!m) {
      m = {
        id: op.ids.mat,
        type: TIPOS.includes(op.matType) ? op.matType : "notas-campo",
        name: String(op.titulo || "Google Doc").slice(0, 300),
        text: normalizarTexto(op.texto),
        folder: null,
        date: hoy(),
        anns: [],
        tags: ["google docs"],
        attrs: { [CLAVE_DOC]: op.docId }
      };
      estado.materials.push(m);
      resultado.creado = true;
    } else {
      if (op.titulo) m.name = String(op.titulo).slice(0, 300);
      Object.assign(resultado, reanclar(m, op.texto));
    }
    return { matId: m.id, material: m, ...resultado };
  }

  function codificar(estado, m, op) {
    const pos = buscarCita(m.text, op.cita, op.cerca);
    if (!pos) return { error: "cita-no-encontrada" };
    const codigo = asegurarCodigo(estado, op.codigo, op.ids.cod);
    let ann = m.anns.find((a) => a.id === op.ids.ann)
      || m.anns.find((a) => a.kind === "code" && a.codeId === codigo.id && a.start === pos.start && a.end === pos.end);
    const yaEstaba = !!ann;
    if (!ann) {
      ann = {
        id: op.ids.ann, kind: "code", codeId: codigo.id, label: codigo.code,
        quote: m.text.slice(pos.start, pos.end), start: pos.start, end: pos.end,
        annMode: "codificar", date: hoy()
      };
      m.anns.push(ann);
    }
    return { matId: m.id, annId: ann.id, codeId: codigo.id, codigo: codigo.code, start: ann.start, end: ann.end, yaEstaba };
  }

  // El Doc manda: las marcas (rangos con nombre "faro|…") se reflejan tal cual en FARO.
  // Las anotaciones respaldadas por el Doc tienen id "doc_…"; si su rango ya no está, se quitan.
  function sincronizarDoc(estado, op) {
    const r = importarDoc(estado, op);
    const m = r.material;
    const vistos = new Set();
    let nuevas = 0, movidas = 0;
    for (const mk of op.marcas || []) {
      vistos.add(mk.annId);
      const codigo = asegurarCodigo(estado, mk.codigo, op.ids.cods?.[mk.codigo]);
      const ann = m.anns.find((a) => a.id === mk.annId);
      const quote = m.text.slice(mk.start, mk.end);
      if (ann) {
        if (ann.start !== mk.start || ann.end !== mk.end) movidas++;
        Object.assign(ann, { start: mk.start, end: mk.end, quote, codeId: codigo.id, label: codigo.code });
        delete ann.lost;
      } else {
        m.anns.push({ id: mk.annId, kind: "code", codeId: codigo.id, label: codigo.code, quote, start: mk.start, end: mk.end, annMode: "codificar", date: hoy() });
        nuevas++;
      }
    }
    const antes = m.anns.length;
    m.anns = m.anns.filter((a) => !(String(a.id).startsWith("doc_") && !vistos.has(a.id)));
    return { matId: m.id, creado: r.creado, cambiado: r.cambiado, perdidas: r.perdidas, nuevas, movidas, quitadas: antes - m.anns.length, total: (op.marcas || []).length };
  }

  function resumenDoc(estado, docId) {
    const m = materialDeDoc(estado, docId);
    if (!m) return { existe: false };
    const porCodigo = {};
    for (const a of m.anns) if (a.kind === "code" && !a.lost) porCodigo[a.label] = (porCodigo[a.label] || 0) + 1;
    const memos = estado.memos || {};
    const fragmentos = m.anns.filter((a) => a.kind === "code").map((a) => ({ annId: a.id, codigo: a.label, quote: a.quote, enDoc: String(a.id).startsWith("doc_"), lost: !!a.lost, memo: memos[a.id] || "" }));
    return { existe: true, matId: m.id, nombre: m.name, tipo: m.type, total: Object.values(porCodigo).reduce((x, y) => x + y, 0), porCodigo, fragmentos };
  }

  // ---------- Libro de códigos, colores y seudónimos (lectura) ----------

  const CLAVE_COLORES = "faroExt:colores"; // { "nombre en minúsculas": "#rrggbb" }
  const CLAVE_MEMOS = "faroExt:memos";     // { "id de anotación": "memo analítico" }
  const PALETA = ["#FFE399", "#CCEBFF", "#D9F2CC", "#FFD6DB", "#E6D9FF", "#FFE6C7", "#CCF2ED", "#F2F2BF"];
  // Mismo cálculo que el complemento de Docs y que google.js: el color por defecto no depende de dónde se codifique.
  function colorPorDefecto(nombre) {
    let h = 0;
    for (const ch of String(nombre).toLowerCase()) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    return PALETA[h % PALETA.length];
  }
  const colorDe = (estado, nombre) => (estado.colores || {})[String(nombre).trim().toLowerCase()] || colorPorDefecto(nombre);

  function usosPorCodigo(estado) {
    const usos = {};
    for (const m of estado.materials) for (const a of m.anns || []) {
      if (a.kind !== "code" || a.lost) continue;
      const c = estado.savedCodes.find((x) => x.id === a.codeId);
      const k = String((c && c.code) || a.label || "").trim().toLowerCase();
      if (k) usos[k] = (usos[k] || 0) + 1;
    }
    return usos;
  }

  // Códigos del proyecto con su definición, color y cantidad de usos (los más usados primero).
  function listaCodigos(estado) {
    const usos = usosPorCodigo(estado);
    const codigos = estado.savedCodes.map((c) => ({
      code: c.code, desc: c.desc || "", incl: c.incl || "", excl: c.excl || "", ejemplo: c.ejemplo || "",
      color: colorDe(estado, c.code), usos: usos[String(c.code).trim().toLowerCase()] || 0
    })).sort((a, b) => b.usos - a.usos || String(a.code).localeCompare(String(b.code)));
    return { codigos };
  }

  // Seudonimización igual a la de FARO web (pseudonymize): nombre completo, sin importar tildes ni mayúsculas.
  const CLASES = { a: "aáàâäãå", e: "eéèêë", i: "iíìîï", o: "oóòôöõ", u: "uúùûü", n: "nñ", c: "cç", y: "yýÿ" };
  function reNombre(nombre) {
    const base = String(nombre).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const cuerpo = [...base].map((ch) => {
      const k = ch.toLowerCase();
      if (CLASES[k]) return "[" + CLASES[k] + CLASES[k].toUpperCase() + "]";
      if (/\s/.test(ch)) return "\\s+";
      return escRe(ch);
    }).join("");
    return new RegExp("(?<![\\p{L}\\p{N}])" + cuerpo + "(?![\\p{L}\\p{N}])", "giu");
  }
  function diccionario(estado) {
    return (estado.pseudoDict || [])
      .map((p, i) => ({ real: String(p.real || "").normalize("NFC").trim(), alias: String(p.alias || "").replace(/[[\]]/g, "").trim() || "P" + (i + 1) }))
      .filter((p) => p.real)
      .sort((a, b) => b.real.length - a.real.length);
  }
  function seudonimizar(texto, dict) {
    let out = String(texto).normalize("NFC");
    for (const { real, alias } of dict) out = out.replace(reNombre(real), `[${alias}]`);
    return out;
  }

  // Fragmentos de todo el proyecto con un código, listos para citar (con seudónimos si hay diccionario).
  function citas(estado, op) {
    const buscado = String(op.codigo || "").trim().toLowerCase();
    const dict = diccionario(estado);
    const salida = [];
    for (const m of estado.materials) for (const a of m.anns || []) {
      if (a.kind !== "code" || a.lost) continue;
      const c = estado.savedCodes.find((x) => x.id === a.codeId);
      if (String((c && c.code) || a.label || "").trim().toLowerCase() !== buscado) continue;
      salida.push({
        quote: dict.length ? seudonimizar(a.quote, dict) : a.quote,
        fuente: dict.length ? seudonimizar(m.name, dict) : m.name,
        tipo: m.type, fecha: m.date || "", matId: m.id, annId: a.id,
        memo: (estado.memos || {})[a.id] ? (dict.length ? seudonimizar(estado.memos[a.id], dict) : estado.memos[a.id]) : ""
      });
    }
    return { citas: salida, seudonimos: dict.length };
  }

  // ¿Cuántos nombres reales del diccionario aparecen en el material de este Doc?
  function nombresReales(estado, op) {
    const m = materialDeDoc(estado, op.docId);
    const dict = diccionario(estado);
    if (!m || !dict.length) return { cantidad: 0, hayDiccionario: dict.length > 0 };
    const cantidad = dict.filter((p) => reNombre(p.real).test(String(m.text).normalize("NFC"))).length;
    return { cantidad, hayDiccionario: true };
  }

  // Capturas del panel: un material por página web, cada fragmento separado y con sus códigos.
  function importarCapturas(estado, op) {
    const SEP = "\n\n— — —\n\n";
    const resultado = {};
    for (const c of op.capturas) {
      const clave = String(c.url || c.titulo || "sin-fuente").slice(0, 200);
      let m = estado.materials.find((x) => x.attrs && x.attrs[CLAVE_FUENTE] === clave && (x.tags || []).includes("captura web"));
      if (!m) {
        m = {
          id: op.ids.mats[c.id], type: "notas-campo",
          name: String("Web · " + (c.titulo || clave)).slice(0, 300),
          text: "", folder: null, date: hoy(), anns: [],
          tags: ["captura web"], attrs: { [CLAVE_FUENTE]: clave }
        };
        if (!estado.materials.some((x) => x.id === m.id)) estado.materials.push(m);
        else m = estado.materials.find((x) => x.id === m.id);
      }
      const texto = normalizarTexto(c.texto).trim();
      const encabezado = `[${new Date(c.fecha).toLocaleDateString("es-AR")}]\n`;
      const yaEn = m.text.indexOf(encabezado + texto); // idempotente aunque el fragmento no tenga códigos
      let start, end;
      if (yaEn !== -1) { start = yaEn + encabezado.length; end = start + texto.length; }
      else {
        const previo = m.text ? m.text + SEP : "";
        start = previo.length + encabezado.length;
        m.text = previo + encabezado + texto;
        end = start + texto.length;
      }
      (c.codigos || []).forEach((nombre, i) => {
        const annId = op.ids.anns[c.id][i];
        if (m.anns.some((a) => a.id === annId)) return;
        const cod = asegurarCodigo(estado, nombre, op.ids.cods[nombre]);
        m.anns.push({ id: annId, kind: "code", codeId: cod.id, label: cod.code, quote: m.text.slice(start, end), start, end, annMode: "codificar", date: hoy() });
      });
      resultado[c.id] = { matId: m.id, start, end };
    }
    return { capturas: resultado };
  }

  function codificarRango(estado, op) {
    const m = estado.materials.find((x) => x.id === op.matId);
    if (!m) return { error: "material-no-encontrado" };
    const codigo = asegurarCodigo(estado, op.codigo, op.ids.cod);
    if (!m.anns.some((a) => a.id === op.ids.ann || (a.kind === "code" && a.codeId === codigo.id && a.start === op.start && a.end === op.end))) {
      m.anns.push({ id: op.ids.ann, kind: "code", codeId: codigo.id, label: codigo.code, quote: m.text.slice(op.start, op.end), start: op.start, end: op.end, annMode: "codificar", date: hoy() });
    }
    return { matId: m.id, codeId: codigo.id };
  }

  function quitarCodigoRango(estado, op) {
    const m = estado.materials.find((x) => x.id === op.matId);
    if (!m) return { error: "material-no-encontrado" };
    const n = String(op.codigo).trim().toLowerCase();
    m.anns = m.anns.filter((a) => !(a.kind === "code" && a.start === op.start && a.end === op.end && String(a.label).trim().toLowerCase() === n));
    return { matId: m.id };
  }

  // Completa los IDs nuevos que una operación puede necesitar (lo hace el service worker antes de repartirla).
  function prepararOp(op) {
    op = JSON.parse(JSON.stringify(op));
    if (op.tipo === "capturas") {
      op.ids = { mats: {}, anns: {}, cods: {} };
      for (const c of op.capturas) {
        op.ids.mats[c.id] = uid("mat");
        op.ids.anns[c.id] = (c.codigos || []).map(() => uid("ann"));
        for (const n of c.codigos || []) op.ids.cods[n] = op.ids.cods[n] || uid("cod");
      }
    } else {
      op.ids = { mat: uid("mat"), ann: uid("ann"), cod: uid("cod"), cods: {} };
      for (const mk of op.marcas || []) op.ids.cods[mk.codigo] = op.ids.cods[mk.codigo] || uid("cod");
    }
    return op;
  }

  // Aplica la operación sobre {materials, savedCodes}. Devuelve {resultado, cambio}.
  function aplicar(estado, op) {
    switch (op.tipo) {
      case "doc-importar": {
        const r = importarDoc(estado, op);
        return { cambio: true, resultado: { matId: r.matId, creado: r.creado, cambiado: r.cambiado, perdidas: r.perdidas } };
      }
      case "doc-codificar": {
        const r = importarDoc(estado, op);
        const c = codificar(estado, r.material, op);
        return { cambio: true, resultado: { ...c, docNuevo: r.creado, perdidas: r.perdidas } };
      }
      case "doc-sincronizar":
        return { cambio: true, resultado: sincronizarDoc(estado, op) };
      case "doc-resumen":
        return { cambio: false, resultado: resumenDoc(estado, op.docId) };
      case "codigos":
        return { cambio: false, resultado: listaCodigos(estado) };
      case "citas":
        return { cambio: false, resultado: citas(estado, op) };
      case "memo-guardar": {
        estado.memos = estado.memos || {};
        const texto = String(op.texto || "").trim().slice(0, 20000);
        if (texto) estado.memos[op.annId] = texto; else delete estado.memos[op.annId];
        return { cambio: false, cambioMemos: true, resultado: { annId: op.annId, memo: texto } };
      }
      case "nombres-reales":
        return { cambio: false, resultado: nombresReales(estado, op) };
      case "capturas":
        return { cambio: true, resultado: importarCapturas(estado, op) };
      case "codificar-rango":
        return { cambio: true, resultado: codificarRango(estado, op) };
      case "quitar-ann": {
        const m = estado.materials.find((x) => x.id === op.matId);
        if (!m) return { cambio: false, resultado: { error: "material-no-encontrado" } };
        m.anns = m.anns.filter((a) => a.id !== op.annId);
        return { cambio: true, resultado: { matId: m.id } };
      }
      case "quitar-codigo-rango":
        return { cambio: true, resultado: quitarCodigoRango(estado, op) };
      default:
        return { cambio: false, resultado: { error: "operacion-desconocida" } };
    }
  }

  // ---------- Acceso directo a la base de FARO (cuando no hay una pestaña de FARO abierta) ----------

  function abrirDB() {
    return new Promise((ok, ko) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
        if (!db.objectStoreNames.contains("files")) db.createObjectStore("files");
      };
      req.onsuccess = () => ok(req.result);
      req.onerror = () => ko(req.error);
    });
  }

  async function aplicarEnDB(op) {
    const db = await abrirDB();
    try {
      return await new Promise((ok, ko) => {
        const tx = db.transaction("kv", "readwrite");
        const st = tx.objectStore("kv");
        const valores = {};
        const CLAVES = ["materials", "savedCodes", "_migrated", "keyMode", "pseudoDict", CLAVE_COLORES, CLAVE_MEMOS];
        let pendientes = CLAVES.length;
        let salida;
        const leer = (k) => {
          const r = st.get(k);
          r.onsuccess = () => {
            valores[k] = r.result;
            if (--pendientes === 0) seguir();
          };
        };
        const seguir = () => {
          const estado = {
            materials: Array.isArray(valores.materials) ? valores.materials : [],
            savedCodes: Array.isArray(valores.savedCodes) ? valores.savedCodes : [],
            pseudoDict: Array.isArray(valores.pseudoDict) ? valores.pseudoDict : [],
            colores: valores[CLAVE_COLORES] && typeof valores[CLAVE_COLORES] === "object" ? valores[CLAVE_COLORES] : {},
            memos: valores[CLAVE_MEMOS] && typeof valores[CLAVE_MEMOS] === "object" ? valores[CLAVE_MEMOS] : {}
          };
          estado.materials.forEach((m) => { if (!Array.isArray(m.anns)) m.anns = []; });
          salida = aplicar(estado, op);
          if (salida.cambio) {
            st.put(estado.materials, "materials");
            st.put(estado.savedCodes, "savedCodes");
            // Base nueva: que FARO no intente migrar datos viejos de localStorage y pise estos.
            if (!valores._migrated) st.put(true, "_migrated");
          }
          if (salida.cambioMemos) st.put(estado.memos, CLAVE_MEMOS);
        };
        CLAVES.forEach(leer);
        tx.oncomplete = () => ok(salida.resultado);
        tx.onerror = () => ko(tx.error);
        tx.onabort = () => ko(tx.error || new Error("abort"));
      });
    } finally {
      db.close();
    }
  }

  async function leerKV(claves) {
    const db = await abrirDB();
    try {
      return await new Promise((ok, ko) => {
        const tx = db.transaction("kv", "readonly");
        const st = tx.objectStore("kv");
        const out = {};
        claves.forEach((k) => { const r = st.get(k); r.onsuccess = () => { out[k] = r.result; }; });
        tx.oncomplete = () => ok(out);
        tx.onerror = () => ko(tx.error);
      });
    } finally {
      db.close();
    }
  }

  global.FaroOps = {
    aplicar, prepararOp, aplicarEnDB, leerKV,
    normalizarTexto, buscarCita, apariciones, reanclar, uid, hoy,
    seudonimizar, colorPorDefecto, CLAVE_COLORES, CLAVE_MEMOS,
    CLAVE_DOC, CLAVE_FUENTE, TIPOS
  };
})(typeof self !== "undefined" ? self : globalThis);
