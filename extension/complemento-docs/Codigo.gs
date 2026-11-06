/**
 * FARO para Google Docs — complemento (Apps Script)
 *
 * Codifica la selección del Doc sin copiar: cada fragmento codificado se guarda como un rango con nombre
 *   "faro|<id>|<código con encodeURIComponent>"
 * (la misma convención que usa la extensión FARO), y se resalta con el color del código.
 * La extensión lee esos rangos al sincronizar, así que lo codificado acá aparece en FARO completo.
 *
 * Permisos: solo el documento abierto (documents.currentonly) y la barra lateral.
 */

var PREFIJO = 'faro|';
var PALETA = ['#FFE399', '#CCEBFF', '#D9F2CC', '#FFD6DB', '#E6D9FF', '#FFE6C7', '#CCF2ED', '#F2F2BF'];
var MAX_SUGERENCIAS = 200;

// ---------- Menú y barra lateral ----------

function onOpen(e) {
  DocumentApp.getUi().createAddonMenu()
    .addItem(esEspanol_() ? 'Abrir FARO' : 'Open FARO', 'mostrarBarra')
    .addToUi();
}

function onInstall(e) {
  onOpen(e);
}

function mostrarBarra() {
  var plantilla = HtmlService.createTemplateFromFile('Barra');
  plantilla.idioma = esEspanol_() ? 'es' : 'en';
  DocumentApp.getUi().showSidebar(plantilla.evaluate().setTitle('FARO'));
}

function esEspanol_() {
  try { return /^es/i.test(Session.getActiveUserLocale() || ''); } catch (e) { return true; }
}

// ---------- Utilidades ----------

function colorDeCodigo(nombre) {
  var h = 0;
  var s = String(nombre).toLowerCase();
  for (var i = 0; i < s.length; ) {
    var cp = s.codePointAt(i);
    h = (h * 31 + cp) >>> 0;
    i += cp > 0xffff ? 2 : 1;
  }
  return PALETA[h % PALETA.length];
}

function nombreRango_(id, codigo) {
  return PREFIJO + id + '|' + encodeURIComponent(codigo);
}

function leerNombre_(nombre) {
  var partes = String(nombre).split('|');
  if (partes.length < 3 || partes[0] !== 'faro') return null;
  try { return { id: partes[1], codigo: decodeURIComponent(partes.slice(2).join('|')) }; } catch (e) { return null; }
}

function nuevoId_() {
  return 'doc_' + Utilities.getUuid().replace(/-/g, '').slice(0, 14);
}

function textoDeRango_(rango) {
  return rango.getRangeElements().map(function (re) {
    var el = re.getElement();
    if (re.isPartial()) return el.asText().getText().substring(re.getStartOffset(), re.getEndOffsetInclusive() + 1);
    return el.editAsText ? el.editAsText().getText() : (el.getText ? el.getText() : '');
  }).join('\n');
}

function pintar_(rango, color) {
  rango.getRangeElements().forEach(function (re) {
    var el = re.getElement();
    if (re.isPartial()) el.asText().setBackgroundColor(re.getStartOffset(), re.getEndOffsetInclusive(), color);
    else if (el.editAsText) el.editAsText().setBackgroundColor(color);
  });
}

/**
 * Color con el que ya está resaltado un código en este Doc (por ejemplo, el que se eligió en FARO).
 * Si el código todavía no está en el Doc, se usa el color de la paleta (el mismo que calcula FARO).
 */
function colorEnDoc_(doc, codigo) {
  var k = String(codigo).toLowerCase();
  var lista = rangosFaro_(doc);
  for (var i = 0; i < lista.length; i++) {
    var info = leerNombre_(lista[i].getName());
    if (!info || info.codigo.toLowerCase() !== k) continue;
    var re = lista[i].getRange().getRangeElements()[0];
    if (!re) continue;
    var el = re.getElement();
    var texto = re.isPartial() ? el.asText() : (el.editAsText ? el.editAsText() : null);
    if (!texto) continue;
    var color = texto.getBackgroundColor(re.isPartial() ? re.getStartOffset() : 0);
    if (color) return color;
  }
  return colorDeCodigo(codigo);
}

function rangosFaro_(doc) {
  return doc.getNamedRanges().filter(function (nr) { return nr.getName().indexOf(PREFIJO) === 0; });
}

// ---------- Funciones que llama la barra lateral ----------

/** Texto seleccionado ahora mismo (o vacío). */
function leerSeleccion() {
  var sel = DocumentApp.getActiveDocument().getSelection();
  if (!sel) return { texto: '' };
  return { texto: textoDeRango_(sel).trim() };
}

/** Codifica la selección con uno o más códigos. */
function codificar(codigos, resaltar) {
  var doc = DocumentApp.getActiveDocument();
  var sel = doc.getSelection();
  if (!sel) throw new Error(esEspanol_() ? 'Seleccioná un fragmento del Doc.' : 'Select a fragment in the Doc.');
  codigos = (codigos || []).map(function (c) { return String(c).trim(); }).filter(String);
  if (!codigos.length) throw new Error(esEspanol_() ? 'Escribí un código.' : 'Type a code.');
  // Que no queden duplicados exactos (mismo código sobre el mismo texto).
  var texto = textoDeRango_(sel);
  var existentes = rangosFaro_(doc);
  codigos.forEach(function (c) {
    var repetido = existentes.some(function (nr) {
      var info = leerNombre_(nr.getName());
      return info && info.codigo.toLowerCase() === c.toLowerCase() && textoDeRango_(nr.getRange()) === texto;
    });
    if (!repetido) doc.addNamedRange(nombreRango_(nuevoId_(), c), sel);
  });
  if (resaltar !== false) pintar_(sel, colorEnDoc_(doc, codigos[0]));
  recordarCodigos_(codigos);
  return listar();
}

/** Todos los fragmentos codificados del Doc, agrupados por código. */
function listar() {
  var doc = DocumentApp.getActiveDocument();
  var fragmentos = [];
  rangosFaro_(doc).forEach(function (nr) {
    var info = leerNombre_(nr.getName());
    if (!info) return;
    fragmentos.push({ id: info.id, codigo: info.codigo, texto: textoDeRango_(nr.getRange()), color: colorEnDoc_(doc, info.codigo) });
  });
  return { fragmentos: fragmentos, sugerencias: sugerencias_(fragmentos) };
}

/** Selecciona en el Doc el fragmento indicado (para revisarlo). */
function irA(id) {
  var doc = DocumentApp.getActiveDocument();
  var nr = buscar_(doc, id);
  if (!nr) throw new Error(esEspanol_() ? 'Ese fragmento ya no está en el Doc.' : 'That fragment is no longer in the Doc.');
  doc.setSelection(nr.getRange());
  return true;
}

/** Quita un código: borra su rango y repinta lo que quede codificado en ese tramo. */
function quitar(id) {
  var doc = DocumentApp.getActiveDocument();
  var nr = buscar_(doc, id);
  if (!nr) return listar();
  var rango = nr.getRange();
  nr.remove();
  pintar_(rango, null);
  rangosFaro_(doc).forEach(function (otro) {
    var info = leerNombre_(otro.getName());
    if (info && seSuperponen_(rango, otro.getRange())) pintar_(otro.getRange(), colorEnDoc_(doc, info.codigo));
  });
  return listar();
}

function buscar_(doc, id) {
  var lista = rangosFaro_(doc);
  for (var i = 0; i < lista.length; i++) {
    var info = leerNombre_(lista[i].getName());
    if (info && info.id === id) return lista[i];
  }
  return null;
}

function seSuperponen_(a, b) {
  var ea = a.getRangeElements().map(function (re) { return re.getElement(); });
  return b.getRangeElements().some(function (re) {
    var el = re.getElement();
    return ea.some(function (x) { return x === el || (x.getParent && el.getParent && x.getParent() === el.getParent()); });
  });
}

// ---------- Códigos sugeridos (los del Doc + los últimos que usaste) ----------

function recordarCodigos_(codigos) {
  var props = PropertiesService.getUserProperties();
  var lista = [];
  try { lista = JSON.parse(props.getProperty('faro_codigos') || '[]'); } catch (e) { lista = []; }
  codigos.forEach(function (c) {
    lista = lista.filter(function (x) { return x.toLowerCase() !== c.toLowerCase(); });
    lista.unshift(c);
  });
  props.setProperty('faro_codigos', JSON.stringify(lista.slice(0, MAX_SUGERENCIAS)));
}

function sugerencias_(fragmentos) {
  var vistos = {};
  var salida = [];
  var agregar = function (c) { var k = c.toLowerCase(); if (!vistos[k]) { vistos[k] = true; salida.push(c); } };
  fragmentos.forEach(function (f) { agregar(f.codigo); });
  try { JSON.parse(PropertiesService.getUserProperties().getProperty('faro_codigos') || '[]').forEach(agregar); } catch (e) { /* sin historial */ }
  return salida;
}

/** Para pruebas (Node) */
if (typeof module !== 'undefined') {
  module.exports = { colorDeCodigo: colorDeCodigo, leerSeleccion: leerSeleccion, codificar: codificar, listar: listar, irA: irA, quitar: quitar, nombreRango_: nombreRango_, leerNombre_: leerNombre_ };
}
