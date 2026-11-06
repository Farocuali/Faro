# FARO para Google Docs (complemento)

Codificá **seleccionando** en el Doc, sin copiar. Abre una barra lateral de FARO dentro de Google Docs:

- Seleccionás un fragmento → escribís el código → Enter. Queda guardado **dentro del Doc** y resaltado con el color del código.
- Ves todos los fragmentos codificados agrupados por código; clic en uno lo selecciona en el Doc, × lo quita.
- En la extensión FARO, el botón **«Sincronizar con el Doc»** trae todo lo codificado acá a tu proyecto.

Funciona en Google Docs en la computadora. La app de Docs para celular no muestra complementos.

## Instalarlo (opción rápida: en un Doc)

1. Abrí el Doc → **Extensiones → Apps Script**.
2. Borrá el contenido de `Código.gs` y pegá el de `Codigo.gs`.
3. **+ (Agregar archivo) → HTML**, llamalo `Barra` y pegá el contenido de `Barra.html`.
4. ⚙ **Configuración del proyecto** → activá «Mostrar el archivo de manifiesto appsscript.json» → reemplazá su contenido por el de `appsscript.json`.
5. Guardá, volvé al Doc y recargalo. Aparece **Extensiones → (nombre del proyecto) → Abrir FARO**. La primera vez Google pide permiso: solo para **este documento**.

## Instalarlo para todos tus Docs

1. Entrá a [script.google.com](https://script.google.com) → **Nuevo proyecto** y pegá los tres archivos como arriba.
2. **Implementar → Probar implementaciones → Tipo: Complemento de Editor** → elegí un Doc de prueba → **Guardar** y abrilo.
3. Para tenerlo en todos tus Docs (y para otras personas), hay que publicarlo en Google Workspace Marketplace: usa el mismo proyecto de Google Cloud que la extensión.

## Cómo se guardan los códigos

Cada fragmento es un *rango con nombre* del Doc llamado `faro|<id>|<código>` (el código con `encodeURIComponent`). Google mueve los rangos con el texto cuando editás, así que la codificación no se pierde. La extensión FARO usa exactamente la misma convención, así que podés mezclar: codificar con el complemento en la computadora y con la extensión desde otro lado.

Permisos: `documents.currentonly` (solo el documento abierto) y la barra lateral.
