// FARO · acuerdo entre codificadoras
// Compara dos proyectos de FARO (el tuyo y el respaldo de otra persona) sobre los mismos materiales.
//
// Método (el de la consulta de comparación de NVivo): para cada material y cada código, cada carácter del texto está codificado o no
// por cada persona. Con esa tabla 2×2 se calcula:
//   - κ de Cohen: (po − pe) / (1 − pe)
//   - acuerdo sobre lo codificado: caracteres que ambas codificaron / caracteres que codificó al menos una
//     (no cuenta el texto que ninguna codificó, que infla κ cuando se codifica poco).
// Los totales por código y el global suman las tablas de todos los materiales (equivale a ponderar por extensión;
// NVivo no calcula totales y sugiere ponderar a mano así o por igual).
// Materiales: se emparejan por Google Doc, por fuente web o por nombre, y solo se comparan si el texto es idéntico.
// Códigos: se emparejan por nombre, sin distinguir mayúsculas.

(function (global) {
  "use strict";

  const norm = (s) => String(s || "").trim().toLowerCase();
  const textoNorm = (s) => String(s || "").replace(/^﻿/, "").replace(/\r\n?/g, "\n").trim();

  function claveMaterial(m) {
    const a = m.attrs || {};
    if (a["Google Doc"]) return "doc:" + a["Google Doc"];
    if (a["Fuente"]) return "web:" + a["Fuente"];
    return "nombre:" + norm(m.name);
  }

  function etiqueta(ann, codigos) {
    const c = codigos.find((x) => x.id === ann.codeId);
    return (c && c.code) || ann.label || "";
  }

  function marcasPorCodigo(material, codigos, largo) {
    const porCodigo = new Map();
    for (const a of material.anns || []) {
      if (a.kind !== "code" || a.lost) continue;
      const nombre = etiqueta(a, codigos);
      if (!nombre) continue;
      const k = norm(nombre);
      if (!porCodigo.has(k)) porCodigo.set(k, { nombre, bits: new Uint8Array(largo) });
      const bits = porCodigo.get(k).bits;
      const s = Math.max(0, a.start | 0), e = Math.min(largo, a.end | 0);
      for (let i = s; i < e; i++) bits[i] = 1;
    }
    return porCodigo;
  }

  const tablaVacia = () => ({ ab: 0, a: 0, b: 0, ninguna: 0 });
  function sumar(t, u) { t.ab += u.ab; t.a += u.a; t.b += u.b; t.ninguna += u.ninguna; return t; }

  function kappa(t) {
    const n = t.ab + t.a + t.b + t.ninguna;
    if (!n) return null;
    const po = (t.ab + t.ninguna) / n;
    const pA = (t.ab + t.a) / n, pB = (t.ab + t.b) / n;
    const pe = pA * pB + (1 - pA) * (1 - pB);
    if (pe >= 1) return 1; // ambas codificaron todo o nada: acuerdo perfecto
    return (po - pe) / (1 - pe);
  }
  const acuerdoCodificado = (t) => (t.ab + t.a + t.b ? t.ab / (t.ab + t.a + t.b) : null);

  // Interpretación de Landis y Koch (1977).
  function interpretar(k) {
    if (k === null || k === undefined) return "—";
    if (k < 0) return "pobre";
    if (k <= 0.2) return "leve";
    if (k <= 0.4) return "aceptable";
    if (k <= 0.6) return "moderado";
    if (k <= 0.8) return "sustancial";
    return "casi perfecto";
  }

  function tramos(bitsA, bitsB, texto) {
    const out = [];
    let i = 0;
    const n = texto.length;
    while (i < n) {
      const x = bitsA ? bitsA[i] : 0, y = bitsB ? bitsB[i] : 0;
      if (x === y) { i++; continue; }
      const quien = x ? "A" : "B";
      let j = i;
      while (j < n && ((bitsA ? bitsA[j] : 0) === x) && ((bitsB ? bitsB[j] : 0) === y)) j++;
      const fragmento = texto.slice(i, j);
      if (fragmento.trim()) out.push({ quien, start: i, end: j, texto: fragmento });
      i = j;
    }
    return out;
  }

  function comparar(proyA, proyB, { maxDesacuerdos = 500 } = {}) {
    const codA = proyA.savedCodes || [], codB = proyB.savedCodes || [];
    const indiceB = new Map();
    for (const m of proyB.materials || []) indiceB.set(claveMaterial(m), m);

    const materiales = [];
    const noComparables = [];
    const porCodigo = new Map();
    const global = tablaVacia();
    const desacuerdos = [];

    for (const mA of proyA.materials || []) {
      const mB = indiceB.get(claveMaterial(mA));
      const tieneCodigos = (m) => (m.anns || []).some((a) => a.kind === "code" && !a.lost);
      if (!mB) { if (tieneCodigos(mA)) noComparables.push({ nombre: mA.name, motivo: "solo-a" }); continue; }
      indiceB.delete(claveMaterial(mA));
      const texto = textoNorm(mA.text);
      if (texto !== textoNorm(mB.text)) { noComparables.push({ nombre: mA.name, motivo: "texto-distinto" }); continue; }
      // Las posiciones se calculan sobre el texto original de cada uno: si difieren solo en espacios de borde, se compensa.
      const desplA = String(mA.text || "").indexOf(texto), desplB = String(mB.text || "").indexOf(texto);
      const ajustar = (m, d) => ({ ...m, anns: (m.anns || []).map((a) => ({ ...a, start: a.start - d, end: a.end - d })) });
      const cA = marcasPorCodigo(ajustar(mA, desplA), codA, texto.length);
      const cB = marcasPorCodigo(ajustar(mB, desplB), codB, texto.length);
      const claves = new Set([...cA.keys(), ...cB.keys()]);
      if (!claves.size) continue;
      const filas = [];
      for (const k of claves) {
        const bA = cA.get(k)?.bits, bB = cB.get(k)?.bits;
        const t = tablaVacia();
        for (let i = 0; i < texto.length; i++) {
          const x = bA ? bA[i] : 0, y = bB ? bB[i] : 0;
          if (x && y) t.ab++; else if (x) t.a++; else if (y) t.b++; else t.ninguna++;
        }
        const nombre = (cA.get(k) || cB.get(k)).nombre;
        filas.push({ codigo: nombre, ...t, kappa: kappa(t), acuerdo: acuerdoCodificado(t) });
        if (!porCodigo.has(k)) porCodigo.set(k, { codigo: nombre, tabla: tablaVacia(), materiales: 0 });
        const pc = porCodigo.get(k);
        sumar(pc.tabla, t); pc.materiales++;
        sumar(global, t);
        if (desacuerdos.length < maxDesacuerdos) {
          for (const tr of tramos(bA, bB, texto)) {
            if (desacuerdos.length >= maxDesacuerdos) break;
            desacuerdos.push({ material: mA.name, codigo: nombre, ...tr });
          }
        }
      }
      const tm = filas.reduce((acc, f) => sumar(acc, f), tablaVacia());
      materiales.push({ nombre: mA.name, largo: texto.length, filas, kappa: kappa(tm), acuerdo: acuerdoCodificado(tm) });
    }
    for (const mB of indiceB.values()) {
      if ((mB.anns || []).some((a) => a.kind === "code" && !a.lost)) noComparables.push({ nombre: mB.name, motivo: "solo-b" });
    }

    const codigos = [...porCodigo.values()]
      .map((c) => ({ codigo: c.codigo, materiales: c.materiales, ...c.tabla, kappa: kappa(c.tabla), acuerdo: acuerdoCodificado(c.tabla) }))
      .sort((x, y) => (x.kappa ?? 2) - (y.kappa ?? 2) || x.codigo.localeCompare(y.codigo));

    return {
      global: { ...global, kappa: kappa(global), acuerdo: acuerdoCodificado(global), interpretacion: interpretar(kappa(global)) },
      codigos, materiales, noComparables, desacuerdos
    };
  }

  function csv(resultado, nombreA, nombreB) {
    const q = (v) => {
      const s = v === null || v === undefined ? "" : typeof v === "number" ? String(Math.round(v * 1000) / 1000) : String(v);
      return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const filas = [["material", "codigo", "kappa", "acuerdo_codificado", `solo_${nombreA}`, `solo_${nombreB}`, "ambas", "ninguna"]];
    for (const m of resultado.materiales) for (const f of m.filas) filas.push([m.nombre, f.codigo, f.kappa, f.acuerdo, f.a, f.b, f.ab, f.ninguna]);
    for (const c of resultado.codigos) filas.push(["(todos)", c.codigo, c.kappa, c.acuerdo, c.a, c.b, c.ab, c.ninguna]);
    const g = resultado.global;
    filas.push(["(todos)", "(todos)", g.kappa, g.acuerdo, g.a, g.b, g.ab, g.ninguna]);
    return "﻿" + filas.map((f) => f.map(q).join(",")).join("\n");
  }

  // ---------- Alfa de Krippendorff (dos o más codificadoras) ----------
  // Datos nominales binarios: para cada material y código, cada carácter es una unidad y cada persona le asigna
  // 1 (codificado) o 0. Con m codificadoras por unidad, si j de ellas lo codificaron, la unidad aporta a la matriz
  // de coincidencias o01 = j·(m−j)/(m−1). Entonces α = 1 − (n − 1)·o01 / (n0·n1), con n = total de valores emparejables.
  // Se acumula un histograma de j por código (y global) en vez de recorrer pares de personas.

  function alfaDesdeHistograma(h, m) {
    let n0 = 0, n1 = 0, o01 = 0;
    for (let j = 0; j <= m; j++) {
      if (!h[j]) continue;
      n1 += h[j] * j;
      n0 += h[j] * (m - j);
      o01 += h[j] * j * (m - j) / (m - 1);
    }
    const n = n0 + n1;
    if (!n || !n0 || !n1) return n ? 1 : null; // sin variación: todas codificaron igual
    return 1 - (n - 1) * o01 / (n0 * n1);
  }

  // proyectos: [{materials, savedCodes}, …] (el primero es el tuyo). Solo cuentan los materiales que tienen todas
  // las personas con el mismo texto.
  function compararVarios(proyectos) {
    const m = proyectos.length;
    if (m < 2) throw new Error("hacen-falta-dos");
    const indices = proyectos.map((p) => { const i = new Map(); for (const x of p.materials || []) i.set(claveMaterial(x), x); return i; });
    const porCodigo = new Map();
    const global = new Array(m + 1).fill(0);
    let comparados = 0;
    const noComparables = [];
    for (const [clave, m0] of indices[0]) {
      const mats = indices.map((i) => i.get(clave));
      if (mats.some((x) => !x)) continue;
      const texto = textoNorm(m0.text);
      if (mats.some((x) => textoNorm(x.text) !== texto)) { noComparables.push({ nombre: m0.name, motivo: "texto-distinto" }); continue; }
      const marcas = mats.map((x, k) => {
        const d = String(x.text || "").indexOf(texto);
        const aj = { ...x, anns: (x.anns || []).map((a) => ({ ...a, start: a.start - d, end: a.end - d })) };
        return marcasPorCodigo(aj, proyectos[k].savedCodes || [], texto.length);
      });
      const claves = new Set(marcas.flatMap((mc) => [...mc.keys()]));
      if (!claves.size) continue;
      comparados++;
      for (const k of claves) {
        const bits = marcas.map((mc) => mc.get(k)?.bits);
        if (!porCodigo.has(k)) porCodigo.set(k, { codigo: (marcas.find((mc) => mc.get(k)) || new Map()).get(k).nombre, h: new Array(m + 1).fill(0), porPersona: new Array(m).fill(0) });
        const pc = porCodigo.get(k);
        for (let i = 0; i < texto.length; i++) {
          let j = 0;
          for (let p = 0; p < m; p++) if (bits[p] && bits[p][i]) { j++; pc.porPersona[p]++; }
          pc.h[j]++; global[j]++;
        }
      }
    }
    const codigos = [...porCodigo.values()]
      .map((c) => ({ codigo: c.codigo, alfa: alfaDesdeHistograma(c.h, m), porPersona: c.porPersona }))
      .sort((x, y) => (x.alfa ?? 2) - (y.alfa ?? 2) || x.codigo.localeCompare(y.codigo));
    // κ por pares, para ver quién se aleja del resto.
    const pares = [];
    for (let a = 0; a < m; a++) for (let b = a + 1; b < m; b++) {
      const r = comparar(proyectos[a], proyectos[b], { maxDesacuerdos: 0 });
      pares.push({ a, b, kappa: r.global.kappa });
    }
    return { personas: m, materiales: comparados, alfa: alfaDesdeHistograma(global, m), codigos, pares, noComparables };
  }

  global.FaroAcuerdo = { comparar, compararVarios, alfaDesdeHistograma, kappa, acuerdoCodificado, interpretar, csv, tramos };
})(typeof self !== "undefined" ? self : globalThis);
