<p align="center"><img src="icons/icon128.png" alt="FARO" width="96"></p>

# FARO · Fichero Analítico de Registro y Observación

[![Pruebas](https://github.com/farocuali/Faro/actions/workflows/pruebas.yml/badge.svg)](https://github.com/farocuali/Faro/actions/workflows/pruebas.yml)
[![Licencia: MIT](https://img.shields.io/badge/licencia-MIT-1f3a5f.svg)](LICENSE)
<!-- Cuando Zenodo asigne el DOI, reemplazá esta línea por el badge que te da Zenodo. -->

**[English](#english) · [Español](#español)**

---

## English

FARO is a free tool for **qualitative and ethnographic research** that runs entirely in the browser. This repository contains the **browser extension** (Chrome, Edge, Brave and Firefox) and the **Google Docs add-on**, which bring the full FARO web app into the places where researchers actually write.

### What it does

- **Full FARO** in its own tab: research memo, field notes, interviews (audio transcription), bibliography, coding with a codebook, thick description, in-depth work, code networks, citations (APA 7 / Chicago, DOI, ISBN, BibTeX, RIS, Zotero), bibliography recommendation and REFI-QDA export (ATLAS.ti, NVivo, MAXQDA).
- **Code in Google Docs.** A FARO panel inside every Doc: select → copy → type the code. With Google connected, codes are **stored inside the Doc as named ranges** (`faro|<id>|<code>`), so they follow the text when it is edited, and are highlighted with a consistent colour per code.
- **Google Docs add-on** (`complemento-docs/`): code by **selecting**, without copying. Same storage convention, so both tools interoperate.
- **Digital ethnography.** Capture fragments from any web page (right-click → *Send to FARO*), with URL and date for citation, code them and send them to the project.
- **Cite in your thesis.** From the Docs panel, pick a code and copy any of its fragments from the whole project as a ready-to-paste quote with its source and date (pseudonymised).
- **Saturation.** New codes per material over time, to discuss theoretical saturation.
- **Decision log.** FARO records every codebook change (created, renamed, redefined, merged, deleted) plus your own notes: a methodological appendix.
- **Pseudonyms.** FARO's pseudonym dictionary is applied to citations, Google Docs exports and reports; the Docs panel warns when a Doc contains real names.
- **Code colours** chosen once and used in FARO, Google Docs and the add-on; code definitions shown while coding; Alt+Shift+1…9 for favourite codes; movable, minimisable Docs panel.
- **Inter-coder agreement.** Krippendorff's α for two or more coders (validated against the Python `krippendorff` package) and pairwise Cohen's κ. Compare your coding with a colleague's backup: Cohen's κ at character level per code and material (as NVivo's coding comparison query), pooled across materials, agreement on coded text, and the list of disagreements with quotes. Export to CSV or Google Docs.
- **Verified bibliography.** Gemini with Google Search grounding, using FARO's anti-hallucination prompt; each recommended work is checked against CrossRef.
- **Drive.** Save and open the project in a *FARO* Drive folder (optionally encrypted), automatic backups, and Google Docs with the codebook, analyses, recommendations or references.
- **Bilingual** interface (Spanish / English, following the browser language).

### Privacy

No FARO servers, accounts, ads or analytics. Projects live in the browser and, if the user chooses, in their own Drive. Google access uses only the **per-file** permission (`drive.file`, non-sensitive): FARO sees the files it creates and the Docs each person explicitly shares with it through Google's picker (`acceso.html`), nothing else. See the [privacy policy](https://farocuali.github.io/Faro/privacidad.html).

### Install to try it

Until FARO is in the stores, install it by hand from the package in `dist/` (build it with `python3 herramientas/empaquetar.py`, or use the `faro-chrome-dev.zip` you were given).

- **Chrome, Edge or Brave:** unzip `faro-chrome-dev.zip` → open `chrome://extensions` (`edge://extensions`, `brave://extensions`) → turn on **Developer mode** → **Load unpacked** → choose the `faro` folder (or `dist/chrome`). Don't delete or move that folder afterwards: the browser runs the extension from it.
- **Firefox (desktop):** open `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** → choose `dist/faro-firefox.xpi`. Firefox removes temporary add-ons when it closes; a permanent install needs the package signed on addons.mozilla.org (free).

On install, a welcome page opens. Then:

1. **Code in Google Docs:** open any Doc; the **FARO** button is at the bottom right.
2. **Open full FARO:** right-click the lighthouse icon in the toolbar → *Open FARO*. It opens in its own tab. A left click opens the side panel instead (web captures and bibliography).
3. **Connect Google (optional):** in FARO, click the **G** button at the top right. If the package has a built-in Client ID, just click *Connect with Google*; otherwise the button opens a step-by-step guide to create your own free access in Google Cloud (about 15 minutes).

The extension's FARO keeps its own project, separate from FARO web at farocuali.github.io. To move a project from the web version, download a backup there (*Backup / Download data*) and restore it in the extension.

### Development

```bash
npm ci
npx playwright install chromium     # first time only
npm test                            # unit tests + end-to-end test in Chromium with the extension loaded
python3 herramientas/empaquetar.py  # builds dist/: chrome/, faro-chrome-dev.zip, faro-chrome-web-store.zip, faro-firefox.xpi
```

`python3 herramientas/empaquetar.py --client-id XXX.apps.googleusercontent.com` embeds a Google OAuth client so users don't need their own. When FARO web changes, regenerate the app with `python3 herramientas/importar-faro.py path/to/index.html`.

| File | Role |
|---|---|
| `faro.html`, `faro-app.js`, `prompts.js` | FARO web, converted by `herramientas/importar-faro.py` (do not edit by hand) |
| `faro-libs.js`, `lib/` | Cytoscape, Mammoth and PDF.js bundled (same versions and SHA-384 as FARO web) |
| `faro-ext.js` | Bridge inside FARO: incoming operations, Google/Drive window (G), inter-coder agreement (κ) |
| `faro-ops.js` | Project operations shared by the service worker and the FARO tab (idempotent) |
| `acuerdo.js` | Inter-coder agreement statistics (κ, α) |
| `faro-herramientas.js` | «＋» menu in FARO: agreement, saturation, decision log, code colours |
| `docs-content.js` | FARO panel inside Google Docs |
| `google.js`, `oauth-content.js` | Google sign-in, Drive, Docs API (named ranges, highlighting) |
| `background.js` | Service worker / event page: context menu, shortcut, routing, clipboard |
| `sidepanel.*`, `biblio.js` | Side panel: web captures and bibliography |
| `i18n.js`, `_locales/` | Translations |
| `complemento-docs/` | Google Docs add-on (Apps Script) |
| `../privacidad.html` | Privacy policy (at the repo root, published by GitHub Pages) |
| `../acceso.html` | Page with Google's picker to give FARO access to one Doc (at the repo root) |
| `tests/` | Automated tests |

### Citation

See [`CITATION.cff`](../CITATION.cff) (GitHub shows a *Cite this repository* button).

---

## Español

FARO es una herramienta gratuita de **investigación cualitativa y etnográfica** que funciona entera en el navegador. Este repositorio tiene la **extensión** (Chrome, Edge, Brave y Firefox) y el **complemento de Google Docs**, que llevan FARO completo a donde se escribe.

### Qué hace

- **FARO completo** en su pestaña: memoria de la investigación, notas de campo, entrevistas (con transcripción), bibliografía, codificación con libro de códigos, descripción densa, trabajo en profundidad, redes de códigos, citas (APA 7 / Chicago, DOI, ISBN, BibTeX, RIS, Zotero), recomendación de bibliografía y exportación REFI-QDA (ATLAS.ti, NVivo, MAXQDA).
- **Codificar en Google Docs.** Un panel de FARO en cada Doc: seleccionás → copiás → escribís el código. Con Google conectado, los códigos **se guardan dentro del Doc como rangos con nombre** (`faro|<id>|<código>`): siguen al texto cuando lo editás y se resaltan con un color fijo por código.
- **Complemento de Google Docs** (`complemento-docs/`): codificar **seleccionando**, sin copiar. Misma convención, así que las dos herramientas se entienden.
- **Etnografía digital.** Capturá fragmentos de cualquier página (clic derecho → *Enviar a FARO*) con URL y fecha para citar, codificalos y pasalos al proyecto.
- **Citar en la tesis.** Desde el panel de Docs elegís un código y copiás cualquiera de sus fragmentos de todo el proyecto como cita lista para pegar, con fuente y fecha (con seudónimos).
- **Saturación.** Códigos nuevos por material a lo largo del tiempo, para discutir la saturación teórica.
- **Registro de decisiones.** FARO anota cada cambio del libro de códigos (creación, renombre, definición, fusión, borrado) y tus notas: un anexo metodológico.
- **Seudónimos.** El diccionario de FARO se aplica en citas, exportaciones a Docs e informes; el panel de Docs avisa si el Doc tiene nombres reales.
- **Colores de códigos** elegidos una vez y usados en FARO, Docs y el complemento; definición del código a la vista al codificar; Alt+Shift+1…9 para los códigos favoritos; panel de Docs movible y minimizable.
- **Acuerdo entre codificadoras.** α de Krippendorff para dos o más personas (validado contra el paquete `krippendorff` de Python) y κ de Cohen por pares. Compará tu codificación con el respaldo de otra persona: κ de Cohen a nivel de carácter por código y material (como la consulta de comparación de NVivo), con totales ponderados por extensión, acuerdo sobre lo codificado y lista de desacuerdos con citas. Exportable a CSV o Google Docs.
- **Bibliografía verificada.** Gemini con búsqueda de Google y el prompt anti-alucinación de FARO; cada obra se contrasta con CrossRef.
- **Drive.** Guardar y abrir el proyecto en una carpeta *FARO* (con cifrado opcional), copias automáticas y Google Docs con libro de códigos, análisis, recomendaciones o referencias.
- Interfaz **bilingüe** (castellano / inglés, según el idioma del navegador).

### Instalar para probar

Hasta que FARO esté en las tiendas, se instala a mano desde el paquete de `dist/` (se arma con `python3 herramientas/empaquetar.py`, o usá el `faro-chrome-dev.zip` que te pasaron).

- **Chrome, Edge o Brave:** descomprimí `faro-chrome-dev.zip` → abrí `chrome://extensions` (`edge://extensions`, `brave://extensions`) → activá **Modo de desarrollador** → **Cargar descomprimida** → elegí la carpeta `faro` (o `dist/chrome`). No borres ni muevas esa carpeta después: el navegador usa la extensión desde ahí.
- **Firefox (computadora):** abrí `about:debugging#/runtime/this-firefox` → **Cargar complemento temporal…** → elegí `dist/faro-firefox.xpi`. Firefox quita los complementos temporales al cerrarse; para instalarlo de forma permanente hay que firmar el paquete en addons.mozilla.org (gratis).

Al instalar se abre una página de bienvenida. Después:

1. **Codificar en Google Docs:** abrí cualquier Doc; abajo a la derecha está el botón **FARO**.
2. **Abrir FARO completo:** clic derecho en el ícono del faro de la barra del navegador → *Abrir FARO*. Se abre en su propia pestaña. Con clic normal se abre el panel lateral (capturas web y bibliografía).
3. **Conectar Google (opcional):** en FARO, botón **G** arriba a la derecha. Si el paquete tiene el Client ID incorporado, alcanza con *Conectar con Google*; si no, el botón abre una guía paso a paso para crear tu propio acceso gratuito en Google Cloud (unos 15 minutos).

El FARO de la extensión tiene su propio proyecto, separado del de FARO web (farocuali.github.io). Para pasar un proyecto de la web a la extensión, descargá un respaldo en la web («Respaldar / Descargar datos») y restauralo en la extensión.

### Cómo citar

Ver [`CITATION.cff`](../CITATION.cff).

Gueler, M. y Wegman, R. (2026). *FARO: Fichero Analítico de Registro y Observación* (versión 1.4.0) [Software]. https://github.com/farocuali/Faro
