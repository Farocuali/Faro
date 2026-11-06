const { RAIZ, ok } = require('./util');
const fs = require('fs'), vm = require('vm');
// --- simulación mínima de DocumentApp ---
function Texto(s) { this.s = s; this.colores = []; }
Texto.prototype = { getText() { return this.s; }, asText() { return this; }, editAsText() { return this; },
  getBackgroundColor(o) { for (let k = this.colores.length - 1; k >= 0; k--) { const [a, b, c] = this.colores[k]; if (o >= a && o <= b) return c; } return null; },
  setBackgroundColor(a, b, c) { if (arguments.length === 1) this.colores.push([0, this.s.length - 1, a]); else this.colores.push([a, b, c]); return this; }, getParent() { return null; } };
function ElemRango(el, ini, fin, parcial) { this.el = el; this.ini = ini; this.fin = fin; this.parcial = parcial; }
ElemRango.prototype = { getElement() { return this.el; }, isPartial() { return this.parcial; }, getStartOffset() { return this.ini; }, getEndOffsetInclusive() { return this.fin; } };
function Rango(elems) { this.elems = elems; }
Rango.prototype = { getRangeElements() { return this.elems; } };
const p1 = new Texto('Ana: Antes acá todo era monte. Ahora pasan los camiones de la soja.');
const p2 = new Texto('El municipio dice que el corredor va a proteger el bosque.');
let seleccion = null; const rangos = []; let seleccionado = null; const props = {};
const doc = {
  getSelection: () => seleccion,
  addNamedRange: (n, r) => { const nr = { n, r, getName() { return n; }, getRange() { return r; }, remove() { rangos.splice(rangos.indexOf(nr), 1); } }; rangos.push(nr); return nr; },
  getNamedRanges: () => rangos.slice(),
  setSelection: (r) => { seleccionado = r; }
};
const ctx = {
  DocumentApp: { getActiveDocument: () => doc, getUi: () => ({}) },
  Session: { getActiveUserLocale: () => 'es' },
  Utilities: { getUuid: () => require('crypto').randomUUID() },
  PropertiesService: { getUserProperties: () => ({ getProperty: (k) => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
  HtmlService: {}, module: { exports: {} }, console
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('' + RAIZ + '/complemento-docs/Codigo.gs', 'utf8'), ctx);
const A = ctx.module.exports;

// selección parcial dentro de p1: "Ahora pasan los camiones de la soja."
const i = p1.s.indexOf('Ahora'); seleccion = new Rango([new ElemRango(p1, i, p1.s.length - 1, true)]);
ok(A.leerSeleccion().texto === 'Ahora pasan los camiones de la soja.', 'lee el texto seleccionado (parcial)');
let r = A.codificar(['extractivismo', 'paisaje'], true);
ok(rangos.length === 2 && rangos.every(nr => /^faro\|doc_[0-9a-f]{14}\|/.test(nr.getName())), 'crea un rango con nombre «faro|doc_…|código» por código');
ok(r.fragmentos.length === 2 && r.fragmentos[0].texto === 'Ahora pasan los camiones de la soja.', 'lista los fragmentos con su texto');
ok(p1.colores.length === 1 && p1.colores[0][0] === i && p1.colores[0][2] === A.colorDeCodigo('extractivismo'), 'resalta solo el tramo seleccionado con el color del primer código');
A.codificar(['Extractivismo'], true);
ok(rangos.length === 2, 'no duplica el mismo código sobre el mismo texto');
// selección de párrafo completo con código con «|» y acentos
seleccion = new Rango([new ElemRango(p2, 0, 0, false)]);
A.codificar(['Estado | municipio'], false);
const nom = rangos[2].getName();
ok(A.leerNombre_(nom).codigo === 'Estado | municipio' && p2.colores.length === 0, 'códigos con «|» y acentos se codifican bien; sin resaltar si se desmarca');
ok(JSON.parse(props.faro_codigos)[0] === 'Estado | municipio', 'recuerda los últimos códigos usados');
r = A.listar();
ok(r.sugerencias.includes('paisaje') && r.sugerencias.includes('Estado | municipio'), 'sugiere códigos del Doc y recientes');
const id = A.leerNombre_(rangos[0].getName()).id;
A.irA(id);
ok(seleccionado === rangos[0].getRange(), '«ver en el Doc» selecciona el fragmento');
r = A.quitar(id);
ok(rangos.length === 2 && r.fragmentos.length === 2, 'quitar borra el rango con nombre');
// un código que ya tiene color en el Doc (elegido en FARO) mantiene ese color
p2.colores.length = 0; p1.colores.push([0, 3, '#123456']);
const rFaro = { n: 'faro|doc_y|territorio', r: new Rango([new ElemRango(p1, 0, 3, true)]), getName() { return this.n; }, getRange() { return this.r; }, remove() {} };
rangos.push(rFaro);
seleccion = new Rango([new ElemRango(p2, 0, 5, true)]);
A.codificar(['Territorio'], true);
ok(p2.colores.at(-1)[2] === '#123456', 'reutiliza el color que el código ya tiene en el Doc');

// mismo color que la extensión
const ext = {}; new Function('self', 'chrome', 'fetch', fs.readFileSync('' + RAIZ + '/faro-ops.js', 'utf8'))(ext, {}, null);
new Function('self', 'chrome', 'fetch', fs.readFileSync('' + RAIZ + '/google.js', 'utf8'))(ext, { storage: { local: {}, session: {} } }, null);
const hex = (c) => '#' + [c.red, c.green, c.blue].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
const codigos = ['territorio', 'extractivismo', 'paisaje', 'Estado | municipio', 'género', 'cuidado', 'frontera', '🌱 semillas'];
ok(codigos.every(c => hex(ext.Google.colorDeCodigo(c)) === A.colorDeCodigo(c)), 'cada código tiene el mismo color en el complemento y en la extensión');
ok(ext.Google.leerNombreRango(ext.Google.nombreRango('doc_x', 'Estado | municipio')).codigo === 'Estado | municipio' && ext.Google.nombreRango('doc_x', 'paisaje') === A.nombreRango_('doc_x', 'paisaje'), 'la extensión y el complemento usan el mismo formato de nombre');
