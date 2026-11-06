# Cuentas y publicación — lista de tareas

Lo técnico ya está hecho. Esto requiere identidad, aceptar términos o pagos, así que lo hace una persona del equipo.
**Todo a nombre de la cuenta de FARO (Faro.cuali@gmail.com)**, con Micaela y Rocío como administradoras.

## 1. Google Cloud (gratis, sin facturación)
- [ ] Crear el proyecto `FARO` con la cuenta de FARO. Agregar a Micaela y Rocío como Propietarias (IAM).
- [ ] Habilitar Google Drive API, Google Docs API y Google Picker API.
- [ ] Google Auth Platform: app `FARO`, público Externo, correo de asistencia de FARO.
  Dominio autorizado: `farocuali.github.io`. Página principal: `https://farocuali.github.io/Faro/`.
  Política de privacidad: `https://farocuali.github.io/Faro/privacidad.html`.
  Google puede pedir que verifiques que el dominio es tuyo (Search Console, subiendo un archivo al repo de GitHub Pages).
  Si no acepta un subdominio de github.io, la alternativa es un dominio propio (por ejemplo, uno .com.ar) apuntando a GitHub Pages.
- [ ] Cliente OAuth (Aplicación web):
  - Origen de JavaScript: `https://farocuali.github.io`
  - URIs de redireccionamiento: `https://legcjiakkmaekkkbpifcelpkpmaemefc.chromiumapp.org/` (desarrollo), `https://farocuali.github.io/Faro/` (Firefox Android) y, cuando existan, `https://<ID-de-la-Chrome-Web-Store>.chromiumapp.org/` y la de Firefox de escritorio (la muestra la guía dentro de la extensión).
- [ ] Clave de API del selector: restricción por sitios `https://farocuali.github.io/*` y `https://docs.google.com/*`; restricción de API: solo Google Picker API.
- [ ] **No** asociar una cuenta de facturación.
- [ ] Cuando todo esté probado: pasar la app a «En producción». Si Google pide verificar la marca, completar ese trámite.

## 2. GitHub (repo farocuali/Faro)
- [x] `privacidad.html` y `acceso.html` ya están en la raíz del repo: GitHub Pages las publica solas.
- [ ] Subir el repo con esta estructura (web en la raíz, extensión en `extension/`).
- [ ] Confirmar la licencia (hoy dice MIT) y los autores en `CITATION.cff`.
- [ ] Conectar Zenodo con GitHub y publicar un *release* `v1.4.0` → DOI.

## 3. Empaquetar con el acceso incorporado
```
python3 herramientas/empaquetar.py --client-id 123456789-xxx.apps.googleusercontent.com --clave-selector AIza...
```

## 4. Tiendas
- [ ] **Chrome Web Store**: cuenta de desarrollador de FARO (pago único de registro). Subir `dist/faro-chrome-web-store.zip` como borrador → copiar el ID → agregar su URI en Google Cloud (paso 1) → reempaquetar si hace falta → completar ficha y privacidad → enviar a revisión.
- [ ] **Microsoft Edge Add-ons** (Partner Center): mismo zip de la Chrome Web Store.
- [ ] **Firefox** (addons.mozilla.org): subir `dist/faro-firefox.xpi`.

## 5. Prueba con tesistas (antes del lanzamiento grande)
- [ ] 10–20 tesistas usando FARO con sus Docs reales durante 2–3 semanas.
- [ ] Reportes por GitHub (plantillas «Algo no funciona» y «Propuesta») o un formulario.
