// FARO · Captura — panel lateral
// Sin JS inline: todo se conecta con addEventListener (requisito de las extensiones MV3).

const PREFIJO = 'cap:';
const { t } = FaroI18n;

const lista = document.getElementById('lista');
const filtro = document.getElementById('filtro');
const contador = document.getElementById('contador');
const barraCodigos = document.getElementById('codigos');
const vacio = document.getElementById('vacio');
const sinResultados = document.getElementById('sin-resultados');
const plantilla = document.getElementById('plantilla-captura');
const botonExportar = document.getElementById('exportar');
const botonBorrarTodo = document.getElementById('borrar-todo');
const botonPasar = document.getElementById('pasar-faro');

// Habla con el service worker de la extensión (que reparte al proyecto de FARO).
async function enviarExt(msg) {
  const r = await chrome.runtime.sendMessage(msg);
  if (!r) throw new Error(t('Sin respuesta de FARO'));
  if (!r.ok) throw new Error(r.error?.mensaje || 'Error');
  return r.r;
}

const fmtFecha = new Intl.DateTimeFormat(FaroI18n.locale, { dateStyle: 'short', timeStyle: 'short' });

let capturas = [];
let codigoActivo = null;
let resaltar = null;
const temporizadoresMemo = new Map();

// ---------- Almacenamiento ----------

async function cargar() {
  const todo = await chrome.storage.local.get(null);
  capturas = Object.entries(todo)
    .filter(([clave]) => clave.startsWith(PREFIJO))
    .map(([, valor]) => valor);
  ordenar();
  render();
}

function ordenar() {
  capturas.sort((a, b) => b.fecha.localeCompare(a.fecha));
}

function buscar(id) {
  return capturas.find((c) => c.id === id);
}

function guardar(captura) {
  return chrome.storage.local.set({ [PREFIJO + captura.id]: captura });
}

function borrar(id) {
  return chrome.storage.local.remove(PREFIJO + id);
}

chrome.storage.onChanged.addListener((cambios, area) => {
  if (area !== 'local') return;
  let hubo = false;
  for (const [clave, { newValue }] of Object.entries(cambios)) {
    if (!clave.startsWith(PREFIJO)) continue;
    hubo = true;
    const id = clave.slice(PREFIJO.length);
    const i = capturas.findIndex((c) => c.id === id);
    if (newValue === undefined) {
      if (i !== -1) capturas.splice(i, 1);
    } else if (i === -1) {
      capturas.push(newValue);
      resaltar = id;
    } else {
      capturas[i] = newValue;
    }
  }
  if (!hubo) return;
  ordenar();
  render();
});

// ---------- Render ----------

function coincide(c, consulta) {
  if (codigoActivo && !c.codigos.includes(codigoActivo)) return false;
  if (!consulta) return true;
  const pajar = [c.texto, c.titulo, c.url, c.memo, ...c.codigos].join('\n').toLowerCase();
  return pajar.includes(consulta);
}

function urlSegura(url) {
  return /^(https?|file):/i.test(url || '') ? url : null;
}

function nombreFuente(c) {
  if (c.titulo) return c.titulo;
  try { return new URL(c.url).hostname; } catch { return t('Fuente sin título'); }
}

function crearTarjeta(c) {
  const nodo = plantilla.content.firstElementChild.cloneNode(true);
  nodo.dataset.id = c.id;
  nodo.querySelector('.texto').textContent = c.texto;

  const fuente = nodo.querySelector('.fuente');
  fuente.textContent = nombreFuente(c);
  fuente.title = c.url;
  const href = urlSegura(c.url);
  if (href) fuente.href = href;

  const fecha = nodo.querySelector('.fecha');
  fecha.dateTime = c.fecha;
  fecha.textContent = fmtFecha.format(new Date(c.fecha));

  const chips = nodo.querySelector('.chips');
  for (const codigo of c.codigos) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.append(codigo);
    const quitar = document.createElement('button');
    quitar.type = 'button';
    quitar.textContent = '×';
    quitar.dataset.accion = 'quitar-codigo';
    quitar.dataset.codigo = codigo;
    quitar.setAttribute('aria-label', t('Quitar código {c}', { c: codigo }));
    chip.append(quitar);
    chips.append(chip);
  }

  nodo.querySelector('[data-campo="memo"]').value = c.memo || '';
  nodo.querySelector('.en-faro').hidden = !c.enFaro;
  if (c.id === resaltar) nodo.classList.add('nueva');
  return nodo;
}

function renderCodigos() {
  const cuenta = new Map();
  for (const c of capturas) for (const cod of c.codigos) cuenta.set(cod, (cuenta.get(cod) || 0) + 1);
  if (codigoActivo && !cuenta.has(codigoActivo)) codigoActivo = null;

  const botones = [...cuenta.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'))
    .map(([cod, n]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'filtro-codigo';
      b.dataset.codigo = cod;
      b.setAttribute('aria-pressed', String(cod === codigoActivo));
      b.textContent = `${cod} · ${n}`;
      return b;
    });
  barraCodigos.replaceChildren(...botones);
}

function render() {
  // Conserva el foco y lo que se está escribiendo si llega un cambio a mitad de la edición.
  const activo = document.activeElement;
  let foco = null;
  if (activo && lista.contains(activo) && activo.dataset.campo) {
    foco = {
      id: activo.closest('.captura').dataset.id,
      campo: activo.dataset.campo,
      valor: activo.value,
      ini: activo.selectionStart,
      fin: activo.selectionEnd
    };
  }

  renderCodigos();
  const consulta = filtro.value.trim().toLowerCase();
  const visibles = capturas.filter((c) => coincide(c, consulta));
  lista.replaceChildren(...visibles.map(crearTarjeta));

  vacio.hidden = capturas.length > 0;
  sinResultados.hidden = capturas.length === 0 || visibles.length > 0;
  contador.textContent = capturas.length === 0
    ? ''
    : visibles.length === capturas.length
      ? t(capturas.length === 1 ? '{n} fragmento' : '{n} fragmentos', { n: capturas.length })
      : t('{a} de {b}', { a: visibles.length, b: capturas.length });
  botonExportar.disabled = capturas.length === 0;
  const pendientes = capturas.filter((c) => !c.enFaro).length;
  botonPasar.disabled = pendientes === 0;
  botonPasar.textContent = pendientes ? t('Pasar a FARO ({n})', { n: pendientes }) : t('Todo en FARO ✓');
  botonBorrarTodo.disabled = capturas.length === 0;

  if (foco) {
    const el = lista.querySelector(`.captura[data-id="${foco.id}"] [data-campo="${foco.campo}"]`);
    if (el) {
      el.value = foco.valor;
      el.focus();
      try { el.setSelectionRange(foco.ini, foco.fin); } catch { /* sin selección */ }
    }
  }

  if (resaltar) {
    const nueva = lista.querySelector(`.captura[data-id="${resaltar}"]`);
    if (nueva) nueva.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    resaltar = null;
  }
}

// ---------- Interacción ----------

lista.addEventListener('click', async (e) => {
  const boton = e.target.closest('button[data-accion]');
  if (!boton) return;
  const id = boton.closest('.captura').dataset.id;
  const c = buscar(id);
  if (!c) return;

  if (boton.dataset.accion === 'borrar') {
    if (confirm(t('¿Borrar este fragmento?'))) await borrar(id);
  } else if (boton.dataset.accion === 'biblio') {
    // biblio.js escucha este evento y prepara la consulta.
    document.dispatchEvent(new CustomEvent('faro:biblio-desde-fragmento', { detail: { ...c } }));
    mostrarPestana('biblio');
  } else if (boton.dataset.accion === 'quitar-codigo') {
    await guardar({ ...c, codigos: c.codigos.filter((x) => x !== boton.dataset.codigo) });
    if (c.enFaro) {
      enviarExt({ tipo: 'op', op: { tipo: 'quitar-codigo-rango', ...c.enFaro, codigo: boton.dataset.codigo } }).catch(console.error);
    }
  }
});

lista.addEventListener('keydown', async (e) => {
  const campo = e.target;
  if (campo.dataset.campo !== 'codigo' || e.key !== 'Enter') return;
  e.preventDefault();
  const id = campo.closest('.captura').dataset.id;
  const c = buscar(id);
  const nuevos = campo.value.split(',').map((s) => s.trim()).filter(Boolean);
  campo.value = '';
  if (!c || nuevos.length === 0) return;
  const codigos = [...new Set([...c.codigos, ...nuevos])];
  await guardar({ ...c, codigos });
  if (c.enFaro) {
    for (const codigo of nuevos.filter((n) => !c.codigos.includes(n))) {
      enviarExt({ tipo: 'op', op: { tipo: 'codificar-rango', ...c.enFaro, codigo } }).catch(console.error);
    }
  }
});

lista.addEventListener('input', (e) => {
  const campo = e.target;
  if (campo.dataset.campo !== 'memo') return;
  const id = campo.closest('.captura').dataset.id;
  clearTimeout(temporizadoresMemo.get(id));
  temporizadoresMemo.set(id, setTimeout(() => {
    temporizadoresMemo.delete(id);
    const c = buscar(id);
    if (c && c.memo !== campo.value) guardar({ ...c, memo: campo.value });
  }, 500));
});

barraCodigos.addEventListener('click', (e) => {
  const b = e.target.closest('.filtro-codigo');
  if (!b) return;
  codigoActivo = codigoActivo === b.dataset.codigo ? null : b.dataset.codigo;
  render();
});

filtro.addEventListener('input', render);

botonExportar.addEventListener('click', () => {
  const datos = {
    formato: 'faro-captura',
    version: 1,
    exportado: new Date().toISOString(),
    capturas
  };
  const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `faro-capturas-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

botonBorrarTodo.addEventListener('click', async () => {
  if (!confirm(t('¿Borrar los {n} fragmentos? Exportalos antes si los querés conservar.', { n: capturas.length }))) return;
  await chrome.storage.local.remove(capturas.map((c) => PREFIJO + c.id));
});

// ---------- FARO completo ----------

document.getElementById('abrir-faro').addEventListener('click', () => {
  enviarExt({ tipo: 'abrir-faro' }).catch(console.error);
});

botonPasar.addEventListener('click', async () => {
  const pendientes = capturas.filter((c) => !c.enFaro);
  if (!pendientes.length) return;
  botonPasar.disabled = true;
  botonPasar.textContent = t('Pasando…');
  try {
    const r = await enviarExt({
      tipo: 'op',
      op: { tipo: 'capturas', capturas: pendientes.map(({ id, texto, url, titulo, fecha, codigos }) => ({ id, texto, url, titulo, fecha, codigos })) }
    });
    const cambios = {};
    for (const c of pendientes) {
      const destino = r.capturas?.[c.id];
      if (destino) cambios[PREFIJO + c.id] = { ...c, enFaro: destino };
    }
    await chrome.storage.local.set(cambios);
  } catch (e) {
    alert(t('No se pudieron pasar las capturas a FARO: ') + e.message);
    render();
  }
});

// ---------- Pestañas ----------

function mostrarPestana(nombre) {
  for (const [n, tab, vista] of [
    ['fragmentos', 'tab-fragmentos', 'vista-fragmentos'],
    ['biblio', 'tab-biblio', 'vista-biblio']
  ]) {
    const activa = n === nombre;
    document.getElementById(tab).setAttribute('aria-selected', String(activa));
    document.getElementById(vista).hidden = !activa;
  }
  window.scrollTo(0, 0);
}

document.getElementById('tab-fragmentos').addEventListener('click', () => mostrarPestana('fragmentos'));
document.getElementById('tab-biblio').addEventListener('click', () => mostrarPestana('biblio'));

FaroI18n.traducir(document);
cargar();
