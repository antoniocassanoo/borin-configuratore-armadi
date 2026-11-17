/* BORIN Configuratore · ponte tra il pannello e Photoshop (CEP).
   Le chiamate al motore passano una alla volta (Photoshop ne esegue una sola per volta).
   Fuori da Photoshop (anteprima nel browser, collaudi) usa window.BORIN_FINTO se c'è. */
(function () {
  "use strict";
  const cep = window.__adobe_cep__ || null;
  const finto = window.BORIN_FINTO || null;
  const ID = "com.borin.configuratore.pannello";

  function percorsoDaURL(u) {
    let p = decodeURIComponent(String(u || ""));
    p = p.replace(/^file:\/\/\//, navigator.platform.indexOf("Win") === 0 ? "" : "/").replace(/^file:\/\//, "");
    return p;
  }
  function eval_(script) {
    return new Promise(ok => {
      if (!cep) return ok(null);
      cep.evalScript(script, r => ok(r));
    });
  }
  let coda = Promise.resolve();

  const Ponte = {
    inPhotoshop: !!cep,
    estensione: "",
    versioneAttesa: "",                       // versione del manifest: il motore deve avere la stessa

    // ARMADI.chiama(nome, argomenti codificati) → {ok, dati|errore}; una chiamata alla volta.
    chiama(nome, arg) {
      const p = coda.then(() => this._chiama(nome, arg));
      coda = p.catch(() => {});
      return p;
    },
    async _chiama(nome, arg) {
      if (!cep) {
        if (finto) return finto.chiama(nome, arg);
        throw new Error("Il pannello non è dentro Photoshop.");
      }
      const s = "(typeof ARMADI === 'undefined') ? 'NOMOTORE' : ARMADI.chiama(" + JSON.stringify(nome) + "," +
        JSON.stringify(encodeURIComponent(JSON.stringify(arg || {}))) + ")";
      const r = await eval_(s);
      if (r === "NOMOTORE") { await this.caricaMotore(true); return this._chiama(nome, arg); }
      if (r === null || r === undefined || r === "EvalScript error.") throw new Error("Photoshop non ha risposto. Prova «Ricarica il motore» in Info.");
      let o;
      try { o = JSON.parse(decodeURIComponent(r)); } catch (e) { throw new Error("Risposta non valida dal motore: " + String(r).slice(0, 200)); }
      if (!o.ok) throw new Error(o.errore);
      return o.dati;
    },

    // Carica il motore (armadi.jsx) e, in privato, quello di BORIN Batch (borin_motore.jsx).
    async caricaMotore(forza) {
      if (!cep) return finto ? "finto" : null;
      const dir = (this.estensione + "/jsx/").replace(/\\/g, "/");
      const s = (forza ? "" : "if (typeof ARMADI === 'undefined' || ARMADI.versione !== " + JSON.stringify(this.versioneAttesa) + ") ") +
        "$.evalFile(new File(" + JSON.stringify(dir + "armadi.jsx") + ")); " +
        "(typeof ARMADI === 'undefined') ? 'no' : ARMADI.chiama('caricaBatch', " +
        JSON.stringify(encodeURIComponent(JSON.stringify({ file: dir + "borin_motore.jsx" }))) + ")";
      const r = await eval_(s);
      if (r === "no" || !r) return null;
      try { const o = JSON.parse(decodeURIComponent(r)); if (!o.ok) throw new Error(o.errore); return o.dati; }
      catch (e) { throw new Error("Motore non caricato: " + e.message); }
    },

    ascolta(tipo, fn) {
      if (finto && finto.ascolta) finto.ascolta(tipo, fn);
      if (!cep) return;
      cep.addEventListener(tipo, ev => {
        let d = ev && ev.data;
        try { if (typeof d === "string") d = JSON.parse(decodeURIComponent(d)); } catch (e) {}
        fn(d);
      });
    },
    ambiente() {
      if (!cep) return finto && finto.ambiente ? finto.ambiente() : { appVersion: "", appSkinInfo: null };
      try { return JSON.parse(cep.getHostEnvironment()); } catch (e) { return {}; }
    },
    sfondoPhotoshop() {                         // colore dei pannelli di Photoshop: tema chiaro o scuro
      const a = this.ambiente(), c = a && a.appSkinInfo && a.appSkinInfo.panelBackgroundColor && a.appSkinInfo.panelBackgroundColor.color;
      return c ? { r: c.red, g: c.green, b: c.blue } : null;
    },
    quandoCambiaTema(fn) { this.ascolta("com.adobe.csxs.events.ThemeColorChanged", fn); },
    restaAttivo() {                             // il pannello resta vivo anche ridotto: «tutte le combinazioni» non si ferma
      if (!cep) return;
      try { cep.dispatchEvent({ type: "com.adobe.PhotoshopPersistent", scope: "APPLICATION", appId: "", extensionId: ID, data: "" }); } catch (e) {}
    },
    scegliCartella(titolo, iniziale) {
      if (window.cep && window.cep.fs) {
        const f = window.cep.fs.showOpenDialogEx || window.cep.fs.showOpenDialog;
        const r = f.call(window.cep.fs, false, true, titolo, iniziale || "");
        return r && r.data && r.data.length ? percorsoDaURL(r.data[0]) : null;
      }
      return finto && finto.scegliCartella ? finto.scegliCartella(titolo) : null;
    },
    apriURL(u) {
      if (window.cep && window.cep.util) window.cep.util.openURLInDefaultBrowser(u);
      else window.open(u, "_blank");
    },
    percorsoDaURL
  };

  if (cep) {
    try { Ponte.estensione = percorsoDaURL(cep.getSystemPath("extension")); } catch (e) {}
  } else if (finto && finto.estensione) Ponte.estensione = finto.estensione;
  window.Ponte = Ponte;
})();
