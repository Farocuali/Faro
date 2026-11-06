const fs = require('fs');
const { RAIZ, ok } = require('./util');
const ctx = {}; new Function('self', fs.readFileSync(RAIZ + '/acuerdo.js', 'utf8'))(ctx);
const A = ctx.FaroAcuerdo;
ok(Math.abs(A.kappa({ ab: 20, a: 5, b: 10, ninguna: 15 }) - 0.4) < 1e-12, 'κ de un caso de manual (0,4)');
ok(A.kappa({ ab: 0, a: 0, b: 0, ninguna: 30 }) === 1, 'si ninguna codificó nada, acuerdo perfecto');
ok(A.interpretar(0.65) === 'sustancial' && A.interpretar(-0.1) === 'pobre', 'interpretación de Landis y Koch');

// proyecto de prueba: mismo Doc, mismos textos, codificaciones distintas
const texto = 'Ana: Antes acá todo era monte. Ahora pasan los camiones de la soja todo el día. El municipio dice que el corredor va a proteger el bosque, pero nadie nos preguntó nada.';
const pos = (s) => { const i = texto.indexOf(s); return [i, i + s.length]; };
const ann = (id, cid, label, s) => { const [a, b] = pos(s); return { id, kind: 'code', codeId: cid, label, quote: s, start: a, end: b }; };
const proyA = { savedCodes: [{ id: 'c1', code: 'extractivismo' }, { id: 'c2', code: 'Estado' }], materials: [
  { id: 'm1', name: 'Entrevista Ana', text: texto, attrs: { 'Google Doc': 'DOC1' }, anns: [
    ann('a1', 'c1', 'extractivismo', 'Ahora pasan los camiones de la soja todo el día.'),
    ann('a2', 'c2', 'Estado', 'El municipio dice que el corredor va a proteger el bosque') ] },
  { id: 'm2', name: 'Otra nota', text: 'texto de A', anns: [{ id: 'x', kind: 'code', codeId: 'c1', label: 'extractivismo', start: 0, end: 5 }] }
] };
const proyB = { savedCodes: [{ id: 'k1', code: 'Extractivismo' }, { id: 'k3', code: 'participación' }], materials: [
  { id: 'n1', name: 'Entrevista Ana (copia)', text: texto + '\n', attrs: { 'Google Doc': 'DOC1' }, anns: [
    ann('b1', 'k1', 'Extractivismo', 'pasan los camiones de la soja'),
    ann('b2', 'k3', 'participación', 'nadie nos preguntó nada.') ] },
  { id: 'n2', name: 'Otra nota', text: 'texto distinto de B', anns: [{ id: 'y', kind: 'code', codeId: 'k1', label: 'x', start: 0, end: 3 }] }
] };
const r = A.comparar(proyA, proyB);
ok(r.materiales.length === 1 && r.materiales[0].nombre === 'Entrevista Ana', 'empareja por Google Doc aunque cambie el nombre');
ok(r.noComparables.length === 1 && r.noComparables[0].motivo === 'texto-distinto', 'no compara materiales con texto distinto');
const ex = r.codigos.find(c => c.codigo.toLowerCase() === 'extractivismo');
ok(ex && ex.ab === 'pasan los camiones de la soja'.length && ex.b === 0, 'empareja códigos sin distinguir mayúsculas');
ok(r.codigos.length === 3, 'incluye códigos que usó solo una persona (κ = 0 o menor)');
const est = r.codigos.find(c => c.codigo === 'Estado');
ok(est.kappa === 0 && est.acuerdo === 0, 'código usado por una sola persona: κ 0, acuerdo 0');
ok(r.desacuerdos.some(d => d.codigo === 'participación' && d.quien === 'B' && d.texto === 'nadie nos preguntó nada.'), 'lista los desacuerdos con la cita y quién codificó');

// Valores de referencia calculados con sklearn.metrics.cohen_kappa_score sobre los mismos vectores por carácter.
ok(Math.abs(ex.kappa - 0.685579) < 1e-6, `κ de «extractivismo» igual a scikit-learn (${ex.kappa.toFixed(6)})`);
ok(Math.abs(r.global.kappa - 0.264255) < 1e-6, `κ global igual a scikit-learn (${r.global.kappa.toFixed(6)})`);
const csv = A.csv(r, 'mic', 'rochi');
ok(csv.startsWith('﻿material,codigo,kappa') && csv.includes('(todos),(todos)'), 'exporta CSV con totales');

// ---------- α de Krippendorff (valores de referencia: paquete «krippendorff» de Python, nivel nominal) ----------
{
  console.log('acuerdo · α de Krippendorff');
  const t3 = 'Ana: Antes acá todo era monte. Ahora pasan los camiones de la soja todo el día. El municipio dice que el corredor va a proteger el bosque, pero nadie nos preguntó nada.';
  const at = (s) => { const i = t3.indexOf(s); return [i, i + s.length]; };
  const proy = (cs) => ({ savedCodes: [], materials: [{ id: 'm', name: 'Ana', text: t3, attrs: { 'Google Doc': 'D' }, anns: cs.map(([l, f], i) => { const [s, e] = at(f); return { id: 'a' + i, kind: 'code', label: l, start: s, end: e, quote: f }; }) }] });
  const P = [
    proy([['extractivismo', 'Ahora pasan los camiones de la soja todo el día.'], ['Estado', 'El municipio dice que el corredor va a proteger el bosque']]),
    proy([['extractivismo', 'pasan los camiones de la soja'], ['participación', 'nadie nos preguntó nada.']]),
    proy([['Extractivismo', 'Ahora pasan los camiones'], ['estado', 'El municipio dice'], ['participación', 'pero nadie nos preguntó nada.']])
  ];
  const r = A.compararVarios(P);
  const ref = { global: 0.40128163086844837, extractivismo: 0.6292656560941454, estado: 0.09896291640477684, 'participación': 0.3897418734050119 };
  ok(Math.abs(r.alfa - ref.global) < 1e-12, `α global igual al paquete krippendorff de Python (${r.alfa.toFixed(6)})`);
  ok(r.codigos.every((c) => Math.abs(c.alfa - ref[c.codigo.toLowerCase()]) < 1e-12), 'α de cada código igual al de Python');
  ok(r.pares.length === 3 && r.personas === 3, 'calcula κ para los tres pares');
  ok(A.alfaDesdeHistograma([10, 0, 0, 0], 3) === 1, 'si nadie codificó nada, α = 1');
}
