// Documento oculto que solo lee el portapapeles cuando el codificador de Google Docs lo pide.
chrome.runtime.onMessage.addListener((msg, _sender, responder) => {
  if (msg?.tipo !== "offscreen-leer-portapapeles") return false;
  const t = document.getElementById("t");
  t.value = "";
  t.focus();
  document.execCommand("paste");
  responder({ ok: true, r: { texto: t.value } });
  return false;
});
