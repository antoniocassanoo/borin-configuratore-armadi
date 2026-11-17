/* BORIN Configuratore · avvio. Estensione invisibile che parte con Photoshop (manifest: StartOn).
   Chi vuole aprire il pannello (un collegamento, un collaudo) scrive il file «apri-pannello» nella cartella dei dati:
   - il segnale diventa «apri-pannello.richiesto»;
   - il pannello, appena aperto, lo cancella (app.js), così si sa che è arrivato;
   - se dopo 4 secondi c'è ancora (Photoshop stava finendo di aprirsi), si riprova, fino a 5 volte.
   Come in BORIN Batch. */
(function () {
  "use strict";
  const cep = window.__adobe_cep__;
  if (!cep || typeof require !== "function") return;
  const fs = require("fs"), path = require("path"), os = require("os");
  const base = process.platform === "win32" ? (process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"))
    : path.join(os.homedir(), "Library", "Application Support");
  const SEGNALE = path.join(base, "BORIN", "Configuratore armadi", "apri-pannello"), RICHIESTO = SEGNALE + ".richiesto";
  const ID = "com.borin.configuratore.avvio", PANNELLO = "com.borin.configuratore.pannello";
  try { cep.dispatchEvent({ type: "com.adobe.PhotoshopPersistent", scope: "APPLICATION", appId: "", extensionId: ID, data: "" }); } catch (e) {}
  let tentativi = 0, ultimo = 0;
  const via = p => { try { fs.unlinkSync(p); } catch (e) {} };
  function controlla() {
    let st = null;
    try { st = fs.statSync(SEGNALE); } catch (e) {}
    if (st) {
      try { fs.renameSync(SEGNALE, RICHIESTO); } catch (e) { via(SEGNALE); }
      if (Date.now() - st.mtimeMs > 15 * 60 * 1000) { via(RICHIESTO); return; }
      tentativi = 0; ultimo = 0;
    }
    if (!fs.existsSync(RICHIESTO) || Date.now() - ultimo < 4000) return;
    if (tentativi >= 5) { via(RICHIESTO); return; }
    tentativi++; ultimo = Date.now();
    try { cep.requestOpenExtension(PANNELLO, ""); } catch (e) {}
  }
  controlla();
  setInterval(controlla, 500);
})();
