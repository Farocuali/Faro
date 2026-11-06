// FARO · traducciones de la interfaz de la extensión (estilo gettext).
// El texto en castellano es la clave; si el navegador no está en castellano, se muestra la versión en inglés.
// FARO completo (faro.html) tiene su propio selector de idioma; esto cubre el panel lateral, Docs y los avisos.
// La prueba tests/traducciones.test.js verifica que cada texto de la interfaz tenga su traducción.

(function (global) {
  "use strict";

  let idioma = "es";
  try { idioma = (global.chrome?.i18n?.getUILanguage?.() || global.navigator?.language || "es"); } catch { /* sin API */ }
  const ES = /^es\b/i.test(idioma);

  const EN = {
    " (códigos: {c})": " (codes: {c})",
    "({n} fragmento(s) anteriores ya no están en el Doc y quedaron marcados en FARO.)": "({n} earlier fragment(s) are no longer in the Doc and were flagged in FARO.)",
    "AIza…": "AIza…",
    "Abrir FARO": "Open FARO",
    "Abrir FARO completo en una pestaña": "Open full FARO in a tab",
    "Abrir FARO ↗": "Open FARO ↗",
    "Abrir en FARO": "Open in FARO",
    "Agregar código": "Add code",
    "Agregar código (Enter; varios con comas)": "Add code (Enter; several with commas)",
    "Bibliografía": "Bibliography",
    "Bibliografía para analizar este fragmento{c}:": "Bibliography to analyse this fragment{c}:",
    "Borrar fragmento": "Delete fragment",
    "Borrar todo": "Delete all",
    "Buscando y verificando en la web…": "Searching and verifying on the web…",
    "Buscar": "Search",
    "Buscar bibliografía": "Find bibliography",
    "Buscar bibliografía sobre este fragmento →": "Find bibliography on this fragment →",
    "Buscar en fragmentos, códigos y memos": "Search fragments, codes and memos",
    "Buscar en la web para verificar cada obra (recomendado)": "Search the web to verify each work (recommended)",
    "Búsqueda detenida": "Search stopped",
    "Búsqueda web desactivada": "Web search off",
    "Búsquedas anteriores": "Previous searches",
    "Cambiá a gemini-2.5-flash o gemini-2.5-flash-lite, o apagá «Buscar en la web».": "Switch to gemini-2.5-flash or gemini-2.5-flash-lite, or turn off “Search the web”.",
    "Capturar la selección (en Google Docs: codificar)": "Capture the selection (in Google Docs: code it)",
    "Cerrar": "Close",
    "Clave de API": "API key",
    "Codificado en este Doc": "Coded in this Doc",
    "Codificando…": "Coding…",
    "Codificar": "Code",
    "Codificar un fragmento": "Code a fragment",
    "Configuración de Gemini": "Gemini settings",
    "Copiado ✓": "Copied ✓",
    "Copiar resultado": "Copy result",
    "CrossRef no respondió": "CrossRef didn't respond",
    "Código (o varios, con comas)": "Code (or several, with commas)",
    "Código {n}": "Code {n}",
    "Describí el tema en el que estás trabajando…": "Describe the topic you're working on…",
    "Describí sobre qué querés bibliografía.": "Describe what you want bibliography on.",
    "Desde el fragmento de": "From the fragment in",
    "Detener": "Stop",
    "Documento / bibliografía": "Document / bibliography",
    "El portapapeles está vacío. Copiá un fragmento del Doc.": "The clipboard is empty. Copy a fragment from the Doc.",
    "En FARO ✓": "In FARO ✓",
    "Enviar a FARO": "Send to FARO",
    "Entrevista": "Interview",
    "Error en los servidores de Google": "Google server error",
    "Error inesperado": "Unexpected error",
    "Escribí un código.": "Type a code.",
    "Esperá un minuto. Si pasa seguido, usá gemini-2.5-flash-lite, que tiene más cupo gratuito.": "Wait a minute. If it keeps happening, use gemini-2.5-flash-lite, which has a larger free quota.",
    "Esperá unos minutos y reintentá.": "Wait a few minutes and try again.",
    "Esta respuesta es de memoria y puede inventar referencias. Verificá cada obra antes de citarla.": "This answer comes from memory and may invent references. Check every work before citing it.",
    "Esta respuesta no trae fuentes, así que probablemente salió de memoria y puede contener datos inventados. Reintentá con un tema más específico o verificá cada referencia antes de usarla.": "This answer has no sources, so it probably came from memory and may contain invented data. Retry with a more specific topic or check each reference before using it.",
    "Este Doc en FARO": "This Doc in FARO",
    "Este fragmento ya no está en el Doc": "This fragment is no longer in the Doc",
    "Este modelo no acepta búsqueda web": "This model doesn't support web search",
    "FARO se actualizó: recargá esta página.": "FARO was updated: reload this page.",
    "FARO usa tu propia clave de Gemini (gratis). Sacala en <a href=\"https://aistudio.google.com/apikey\" target=\"_blank\" rel=\"noopener noreferrer\">aistudio.google.com/apikey</a>. Queda guardada solo en este navegador.": "FARO uses your own (free) Gemini key. Get it at <a href=\"https://aistudio.google.com/apikey\" target=\"_blank\" rel=\"noopener noreferrer\">aistudio.google.com/apikey</a>. It's stored only in this browser.",
    "FARO y el Doc ya estaban sincronizados.": "FARO and the Doc were already in sync.",
    "FARO · Captura": "FARO · Capture",
    "FARO: codificar este Doc (Alt+Shift+F)": "FARO: code this Doc (Alt+Shift+F)",
    "Falta el tema": "Topic missing",
    "Falta la clave de Gemini": "Gemini key missing",
    "Filtrar por código": "Filter by code",
    "Fragmentos": "Fragments",
    "Fuente sin título": "Untitled source",
    "Fuentes consultadas en la web": "Web sources consulted",
    "Fuentes consultadas:": "Sources consulted:",
    "Gemini no devolvió texto. Reintentá o cambiá de modelo.": "Gemini returned no text. Retry or switch models.",
    "Google bloqueó el pedido": "Google blocked the request",
    "Google bloqueó la respuesta": "Google blocked the response",
    "Google conectado: los códigos se guardan dentro del Doc y siguen al texto aunque lo edites.": "Google connected: codes are stored inside the Doc and follow the text even when you edit it.",
    "Guardado (sin clave).": "Saved (no key).",
    "Guardado.": "Saved.",
    "Guardar": "Save",
    "Importado a FARO.": "Imported into FARO.",
    "Importar / actualizar": "Import / update",
    "JSON": "JSON",
    "La clave no es válida": "The key isn't valid",
    "La clave no tiene permiso": "The key has no permission",
    "Leyendo el Doc…": "Reading the Doc…",
    "Llegaste al tope de consultas": "You reached the query limit",
    "Memo": "Memo",
    "Memo analítico": "Analytic memo",
    "Modelo": "Model",
    "Motivo: {m}. Probá reformular el tema.": "Reason: {m}. Try rephrasing the topic.",
    "Ningún fragmento coincide con el filtro.": "No fragment matches the filter.",
    "No encontré ese fragmento en este Doc. ¿Lo copiaste de este documento?": "I couldn't find that fragment in this Doc. Did you copy it from this document?",
    "No encontré ese modelo": "Model not found",
    "No pude conectarme con Gemini. Revisá tu conexión y reintentá.": "I couldn't reach Gemini. Check your connection and retry.",
    "No pude leer el texto del Doc. Revisá que tengas acceso al documento y que esté permitido descargarlo.": "I couldn't read the Doc's text. Check that you have access to the document and that downloading it is allowed.",
    "No se pudieron pasar las capturas a FARO: ": "Couldn't send the captures to FARO: ",
    "No se pudo confirmar la búsqueda web": "Couldn't confirm the web search",
    "No se pudo copiar": "Couldn't copy",
    "Notas de campo": "Field notes",
    "Para búsqueda web gratis usá Flash o Flash-Lite. En Pro la búsqueda web no entra en el plan gratuito.": "For free web search use Flash or Flash-Lite. On Pro, web search isn't part of the free tier.",
    "Para quitar un código guardado en el Doc, conectá Google en FARO.": "To remove a code stored in the Doc, connect Google in FARO.",
    "Pasando…": "Sending…",
    "Pasar a FARO": "Send to FARO",
    "Pasar a FARO ({n})": "Send to FARO ({n})",
    "Pegala en «Configuración de Gemini» y tocá Guardar.": "Paste it in “Gemini settings” and tap Save.",
    "Primero copiá un fragmento del Doc (Ctrl+C).": "First copy a fragment from the Doc (Ctrl+C).",
    "Puede que la API de Gemini no esté habilitada para esa clave. Generá una nueva en aistudio.google.com/apikey.": "The Gemini API may not be enabled for that key. Create a new one at aistudio.google.com/apikey.",
    "Quitar código {c}": "Remove code {c}",
    "Quitar «{c}» de este fragmento": "Remove “{c}” from this fragment",
    "Resaltar el fragmento en el Doc": "Highlight the fragment in the Doc",
    "Respuesta cortada por límite de longitud": "Answer cut off by the length limit",
    "Respuesta vacía": "Empty response",
    "Revisá el nombre del modelo en la configuración (por ejemplo, {m}).": "Check the model name in settings (e.g. {m}).",
    "Revisá la clave en «Configuración de Gemini». Tiene que empezar con AIza.": "Check the key in “Gemini settings”. It must start with AIza.",
    "Se quitó «{c}».": "Removed “{c}”.",
    "Secciones": "Sections",
    "Seleccioná texto en cualquier página y hacé <strong>clic derecho → Enviar a FARO</strong>, o usá <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd>.": "Select text on any page and <strong>right-click → Send to FARO</strong>, or press <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd>.",
    "Seleccioná texto en el Doc y copialo con <kbd>Ctrl</kbd>+<kbd>C</kbd> (<kbd>⌘</kbd>+<kbd>C</kbd> en Mac).": "Select text in the Doc and copy it with <kbd>Ctrl</kbd>+<kbd>C</kbd> (<kbd>⌘</kbd>+<kbd>C</kbd> on Mac).",
    "Sin Google: los códigos se guardan en FARO. Conectá Google (botón G en FARO) para guardarlos también en el Doc.": "Without Google: codes are stored in FARO. Connect Google (G button in FARO) to also store them in the Doc.",
    "Sin conexión": "Offline",
    "Sin respuesta de FARO": "No response from FARO",
    "Sincronizar con el Doc": "Sync with the Doc",
    "Sugerencias de búsqueda de Google": "Google search suggestions",
    "Sugerencias de búsqueda de Google (se muestran tal cual, como exigen sus términos):": "Google search suggestions (shown as is, as its terms require):",
    "Tipo de material": "Material type",
    "Todavía no copiaste ningún fragmento.": "You haven't copied a fragment yet.",
    "Todavía no está en FARO": "Not in FARO yet",
    "Todavía no hay fragmentos.": "No fragments yet.",
    "Todo en FARO ✓": "All in FARO ✓",
    "Usando la clave de Gemini que cargaste en FARO.": "Using the Gemini key you set in FARO.",
    "Usar lo que tengo en el portapapeles": "Use what's on my clipboard",
    "sin coincidencia en CrossRef": "no match in CrossRef",
    "una página": "a page",
    "verificando…": "checking…",
    "{a} de {b}": "{a} of {b}",
    "{n} código(s) nuevo(s) desde el Doc.": "{n} new code(s) from the Doc.",
    "{n} código(s) que ya no están en el Doc se quitaron.": "{n} code(s) no longer in the Doc were removed.",
    "{n} fragmento": "{n} fragment",
    "{n} fragmento codificado": "{n} coded fragment",
    "{n} fragmento(s) sin respaldo en el Doc quedaron marcados.": "{n} fragment(s) not backed by the Doc were flagged.",
    "{n} fragmento(s) ya no están en el Doc y quedaron marcados.": "{n} fragment(s) are no longer in the Doc and were flagged.",
    "{n} fragmentos": "{n} fragments",
    "{n} fragmentos codificados": "{n} coded fragments",
    "¿Borrar este fragmento?": "Delete this fragment?",
    "¿Borrar los {n} fragmentos? Exportalos antes si los querés conservar.": "Delete all {n} fragments? Export them first if you want to keep them.",
    "¿Sobre qué tema buscás bibliografía?": "What topic do you need bibliography on?",
    "✓ = la obra figura en CrossRef con ese título y autor/a. Que no figure no significa que no exista: muchos libros y revistas latinoamericanas no tienen DOI. Revisá siempre con las fuentes.": "✓ = the work is in CrossRef with that title and author. Not being there doesn't mean it doesn't exist: many books and Latin American journals have no DOI. Always check against the sources.",
    "✓ Codificado como {c} y guardado en el Doc.": "✓ Coded as {c} and saved in the Doc.",
    "✓ Codificado como {c}.": "✓ Coded as {c}.",
    "✓ Importado a FARO.": "✓ Imported into FARO.",
    "✓ Texto actualizado.": "✓ Text updated.",
    "✓ Ya estaba al día.": "✓ Already up to date.",
    "Alt+Shift+{n} aplica «{c}» al último fragmento copiado": "Alt+Shift+{n} applies “{c}” to the last copied fragment",
    "Arrastrá para mover": "Drag to move",
    "Citar en tu texto": "Cite in your text",
    "Citar fragmentos en tu texto": "Cite fragments in your text",
    "Con seudónimos: los nombres de tu diccionario se reemplazan en las citas.": "With pseudonyms: names in your dictionary are replaced in the quotes.",
    "Copiar": "Copy",
    "Escribir un memo sobre este fragmento": "Write a memo about this fragment",
    "Memo del fragmento": "Fragment memo",
    "Qué pensaste al codificar esto…": "What you thought when coding this…",
    "Guardar memo": "Save memo",
    "Cancelar": "Cancel",
    "✓ Memo guardado.": "✓ Memo saved.",
    "Se borró el memo.": "Memo deleted.",
    "Copiar con memo": "Copy with memo",
    "Copiar todas": "Copy all",
    "Cuándo aplicarlo: ": "When to apply: ",
    "Cuándo no: ": "When not to: ",
    "Código": "Code",
    "Documento": "Document",
    "Ejemplo: ": "Example: ",
    "Elegí un código: aparecen sus fragmentos de todo el proyecto. «Copiar» y pegalo (Ctrl+V) donde quieras en tu tesis.": "Pick a code: its fragments from the whole project appear. “Copy” and paste it (Ctrl+V) anywhere in your thesis.",
    "Este Doc tiene {n} nombre real de tu diccionario de seudónimos. FARO lo reemplaza al citar y al exportar, pero el Doc lo sigue teniendo.": "This Doc has {n} real name from your pseudonym dictionary. FARO replaces it when citing and exporting, but the Doc still contains it.",
    "Este Doc tiene {n} nombres reales de tu diccionario de seudónimos. FARO los reemplaza al citar y al exportar, pero el Doc los sigue teniendo.": "This Doc has {n} real names from your pseudonym dictionary. FARO replaces them when citing and exporting, but the Doc still contains them.",
    "Este código todavía no tiene definición en el libro de códigos de FARO.": "This code has no definition in FARO's codebook yet.",
    "Minimizar": "Minimise",
    "No se pudo copiar. Seleccioná el texto de la cita y copialo a mano.": "Couldn't copy. Select the quote text and copy it by hand.",
    "Ocultar FARO en esta página": "Hide FARO on this page",
    "Ocultar FARO en esta página (vuelve con Alt+Shift+F)": "Hide FARO on this page (bring it back with Alt+Shift+F)",
    "Todavía no hay fragmentos codificados en el proyecto.": "There are no coded fragments in the project yet.",
    "{n} uso": "{n} use",
    "{n} usos": "{n} uses",
    "✓ Cita copiada. Pegala con Ctrl+V donde quieras.": "✓ Quote copied. Paste it with Ctrl+V anywhere.",
    "✓ {n} citas copiadas. Pegalas con Ctrl+V donde quieras.": "✓ {n} quotes copied. Paste them with Ctrl+V anywhere.",
    "Dar acceso a FARO a este Doc": "Give FARO access to this Doc",
    "Falta la clave de API del selector de Google: configurala en FARO (botón G).": "The Google Picker API key is missing: set it up in FARO (G button).",
    "Para guardar los códigos dentro de este Doc, FARO necesita tu permiso para este Doc (una sola vez). Mientras tanto, se guardan en FARO.": "To store codes inside this Doc, FARO needs your permission for this Doc (just once). Meanwhile, they're stored in FARO.",
    "Se abrió el selector de Google en otra pestaña: elegí este Doc y tocá «Seleccionar».": "Google's picker opened in another tab: choose this Doc and click “Select”.",
    "✓ FARO ya tiene acceso a este Doc: desde ahora los códigos se guardan adentro.": "✓ FARO now has access to this Doc: from now on codes are stored inside it."
  };

  function t(texto, vars) {
    let r = ES ? texto : (Object.prototype.hasOwnProperty.call(EN, texto) ? EN[texto] : texto);
    if (vars) r = r.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
    return r;
  }

  // Traduce un documento ya armado: textos, placeholder/title/aria-label y bloques data-i18n-html.
  function traducir(raiz) {
    const doc = raiz.ownerDocument || raiz;
    if (doc.documentElement && doc.documentElement.hasAttribute("data-i18n-lang")) doc.documentElement.lang = ES ? "es" : "en";
    if (ES) return;
    const recorrer = (nodo) => {
      for (const el of nodo.querySelectorAll("[data-i18n-html]")) {
        const clave = el.innerHTML.trim().replace(/\s+/g, " ");
        if (EN[clave]) el.innerHTML = EN[clave];
      }
      const w = doc.createTreeWalker(nodo, 4 /* NodeFilter.SHOW_TEXT */);
      const nodos = [];
      while (w.nextNode()) nodos.push(w.currentNode);
      for (const n of nodos) {
        if (n.parentElement && n.parentElement.closest("[data-i18n-html], script, style")) continue;
        const x = n.nodeValue.trim().replace(/\s+/g, " ");
        if (x && EN[x]) n.nodeValue = n.nodeValue.replace(n.nodeValue.trim(), EN[x]);
      }
      for (const el of nodo.querySelectorAll("[placeholder],[title],[aria-label]")) {
        for (const a of ["placeholder", "title", "aria-label"]) {
          const v = el.getAttribute(a);
          if (v && EN[v]) el.setAttribute(a, EN[v]);
        }
      }
      for (const tpl of nodo.querySelectorAll("template")) recorrer(tpl.content);
    };
    recorrer(raiz.body ? raiz.body : raiz);
    if (doc.title && EN[doc.title]) doc.title = EN[doc.title];
  }

  global.FaroI18n = { t, traducir, es: ES, locale: ES ? "es-AR" : "en-GB", EN };
})(typeof self !== "undefined" ? self : globalThis);
