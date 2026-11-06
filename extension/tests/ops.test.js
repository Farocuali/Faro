// Operaciones sobre el proyecto (faro-ops.js): importar Docs, codificar, reanclar, sincronizar con el Doc y capturas.
const fs = require("fs");
const { archivo, ok } = require("./util");
const ctx = {};
new Function("self", fs.readFileSync(archivo("faro-ops.js"), "utf8"))(ctx);
const F = ctx.FaroOps;
const estado = () => ({ materials: [], savedCodes: [] });
const aplicar = (e, op) => F.aplicar(e, F.prepararOp(op)).resultado;

console.log("faro-ops");
const TXT = "﻿Entrevista\r\n\r\nAna: “nadie nos preguntó”.\r\nEl corredor va a proteger el bosque.\r\n";
let e = estado();
let r = aplicar(e, { tipo: "doc-codificar", docId: "D1", titulo: "Entrevista", texto: TXT, cita: '"nadie nos\npreguntó"', codigo: "participación" });
const m = e.materials[0];
ok(m.text.startsWith("Entrevista\n\nAna") && !m.text.includes("\r"), "normaliza el texto del Doc (sin BOM ni \\r)");
ok(r.codigo === "participación" && m.text.slice(r.start, r.end) === "“nadie nos preguntó”", "ubica la cita aunque cambien comillas y saltos de línea");
r = aplicar(e, { tipo: "doc-codificar", docId: "D1", texto: TXT, cita: "nadie nos preguntó", codigo: "PARTICIPACIÓN" });
ok(e.savedCodes.length === 1, "reutiliza códigos sin distinguir mayúsculas");

// reanclar: el Doc cambió
const TXT2 = "Entrevista (3/11)\n\nNota agregada.\n\nAna: “nadie nos preguntó”.\nEl corredor va a proteger el bosque.\n";
r = aplicar(e, { tipo: "doc-importar", docId: "D1", texto: TXT2 });
ok(r.cambiado && r.perdidas === 0 && m.anns.every((a) => m.text.slice(a.start, a.end) === a.quote), "si el Doc cambia, reubica las anotaciones");
r = aplicar(e, { tipo: "doc-importar", docId: "D1", texto: "Otro texto completamente distinto." });
ok(r.perdidas === m.anns.length && m.anns.every((a) => a.lost), "marca como perdidas las que ya no están");

// sincronizar con rangos con nombre (el Doc manda)
e = estado();
const T3 = "Ana: Antes acá todo era monte. Ahora pasan los camiones.";
const i = T3.indexOf("Ahora");
r = aplicar(e, { tipo: "doc-sincronizar", docId: "D2", titulo: "Ana", texto: T3, marcas: [
  { annId: "doc_a", codigo: "extractivismo", start: i, end: T3.length },
  { annId: "doc_b", codigo: "paisaje", start: 5, end: 30 }] });
ok(r.creado && r.nuevas === 2 && e.materials[0].anns.length === 2 && e.savedCodes.length === 2, "sincronizar crea el material y las anotaciones del Doc");
r = aplicar(e, { tipo: "doc-sincronizar", docId: "D2", texto: "Intro. " + T3, marcas: [{ annId: "doc_a", codigo: "extractivismo", start: i + 7, end: T3.length + 7 }] });
const anns = e.materials[0].anns;
ok(r.quitadas === 1 && anns.length === 1 && anns[0].start === i + 7 && anns[0].quote === "Ahora pasan los camiones.", "si se quitó un código en el Doc, se quita en FARO; si se movió, se actualiza");
aplicar(e, { tipo: "codificar-rango", matId: e.materials[0].id, start: 0, end: 6, codigo: "propio" });
r = aplicar(e, { tipo: "doc-sincronizar", docId: "D2", texto: "Intro. " + T3, marcas: [{ annId: "doc_a", codigo: "extractivismo", start: i + 7, end: T3.length + 7 }] });
ok(e.materials[0].anns.some((a) => a.label === "propio"), "las anotaciones hechas en FARO (no en el Doc) se conservan");
r = aplicar(e, { tipo: "doc-resumen", docId: "D2" });
ok(r.total === 2 && r.fragmentos.some((f) => f.enDoc) && r.fragmentos.some((f) => !f.enDoc), "el resumen distingue lo guardado en el Doc");

// capturas web: un material por página, idempotente
e = estado();
const caps = [
  { id: "a", texto: "El corredor conecta reservas.", url: "https://d.com/n", titulo: "Diario", fecha: "2026-11-04T12:00:00Z", codigos: ["conservación"] },
  { id: "b", texto: "Los productores rechazan.", url: "https://d.com/n", titulo: "Diario", fecha: "2026-11-04T12:05:00Z", codigos: [] }];
const op = F.prepararOp({ tipo: "capturas", capturas: caps });
F.aplicar(e, op); F.aplicar(e, op);
ok(e.materials.length === 1 && e.materials[0].text.split("— — —").length === 2 && e.materials[0].anns.length === 1, "capturas: un material por página y aplicar dos veces no duplica");

// citas para la tesis, seudónimos y libro de códigos enriquecido
{
  const e2 = estado();
  e2.pseudoDict = [{ real: "Ana Pérez", alias: "Vecina 1" }, { real: "Santi", alias: "" }];
  e2.colores = { "extractivismo": "#AA0000" };
  const T = "Entrevista a Ana Pérez\n\nAna Pérez: pasan los camiones. Santi dijo que no.";
  aplicar(e2, { tipo: "doc-codificar", docId: "D9", titulo: "Entrevista Ana Pérez", texto: T, cita: "Ana Pérez: pasan los camiones.", codigo: "extractivismo" });
  aplicar(e2, { tipo: "doc-codificar", docId: "D9", texto: T, cita: "Santi dijo que no.", codigo: "Extractivismo" });
  e2.savedCodes[0].desc = "Avance de la frontera agropecuaria";
  const c = F.aplicar(e2, { tipo: "citas", codigo: "EXTRACTIVISMO" }).resultado;
  ok(c.citas.length === 2 && c.seudonimos === 2, "citas: junta los fragmentos de todo el proyecto");
  ok(c.citas[0].quote === "[Vecina 1]: pasan los camiones." && c.citas[0].fuente === "Entrevista [Vecina 1]", "citas: reemplaza nombres reales por seudónimos (también en la fuente)");
  ok(c.citas[1].quote === "[P2] dijo que no.", "citas: alias vacío recibe uno automático, nunca el nombre real");
  const l = F.aplicar(e2, { tipo: "codigos" }).resultado.codigos[0];
  ok(l.code === "extractivismo" && l.usos === 2 && l.color === "#AA0000" && l.desc.startsWith("Avance"), "códigos: con usos, color elegido y definición");
  ok(F.aplicar(e2, { tipo: "nombres-reales", docId: "D9" }).resultado.cantidad === 2, "detecta nombres reales del diccionario en el Doc");
}
