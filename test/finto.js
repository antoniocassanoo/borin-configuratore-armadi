/* Photoshop e disco «finti» per provare il pannello nel browser, senza Photoshop e senza Node.
   I dati arrivano da window.DATI_FINTI (test/pannello.js): strutture e anteprime vere prodotte dal motore. */
(function () {
  "use strict";
  const DATI = window.DATI_FINTI || { file: {}, cartelle: {}, esistenti: [] };
  const memoria = {}, ascoltatori = {};
  const pausa = ms => new Promise(r => setTimeout(r, ms));
  const unisci = (...p) => p.join("/").replace(/\/+/g, "/");
  const nomeDi = p => String(p).replace(/^.*\//, "");
  const cartellaDi = p => String(p).replace(/\/[^/]*$/, "");
  const emetti = (tipo, d) => (ascoltatori[tipo] || []).forEach(fn => fn(d));

  window.BORIN_VERSIONE = "1.0.0";
  window.BORIN_FINTO = {
    estensione: DATI.estensione || "",
    ambiente: () => ({ appVersion: "28.0.0", appSkinInfo: null }),
    ascolta: (tipo, fn) => { (ascoltatori[tipo] = ascoltatori[tipo] || []).push(fn); },
    scegliCartella: () => DATI.cartellaUscita,
    async chiama(nome, arg) {
      await pausa(30);
      if (nome === "info") return { motore: "1.0.0", batch: "8.1.0", photoshop: "28.0.0", sistema: "Macintosh OS 15.6/64", documenti: 0 };
      if (nome === "anteprime") {
        const id = Object.keys(DATI.cartelle).find(k => DATI.cartelle[k] === arg.cartella);
        const st = JSON.parse(JSON.stringify(DATI.strutture[id]));
        for (let i = 1; i <= st.anteprime.pezzi.length; i++) { emetti("com.borin.configuratore.fase", { fase: "anteprima", dati: { pezzo: i, di: st.anteprime.pezzi.length } }); await pausa(DATI.lentezza || 5); }
        return st;
      }
      if (nome === "esporta") {
        emetti("com.borin.configuratore.fase", { fase: "livelli" });
        for (const f of ["apertura", "analisi", "sagoma", "residui", "composizione", "ombra", "colore", "salvataggio", "export"]) {
          emetti("com.borin.batch.fase", { fase: f }); await pausa(DATI.lentezzaExport || 20);
        }
        Object.values(arg.uscite).forEach(p => { memoria[p] = "x"; });
        return { ok: true, file: arg.nome, durata: 23000, avvisi: [], anteprimaDopo: DATI.risultato,
          uscite: Object.keys(arg.uscite).map(k => ({ formato: k.toUpperCase(), percorso: arg.uscite[k] })) };
      }
      if (nome === "chiudiTutti" || nome === "mostraInPhotoshop" || nome === "chiudi") return true;
      throw new Error("funzione finta mancante: " + nome);
    }
  };

  window.BORIN_DISCO = {
    WIN: false, unisci, nomeDi, cartellaDi,
    relativo: (da, a) => String(a).indexOf(String(da) + "/") === 0 ? String(a).slice(String(da).length + 1) : String(a),
    cartellaDati: () => "/Users/prova/Library/Application Support/BORIN/Configuratore armadi",
    cartellaTemp: id => "/tmp/borin-configuratore/" + id,
    leggiJSON: (f, pred) => (f in memoria ? JSON.parse(memoria[f]) : (f in DATI.file ? JSON.parse(JSON.stringify(DATI.file[f])) : (DATI.file[nomeDi(f)] || pred))),
    scriviJSON: (f, d) => { memoria[f] = JSON.stringify(d); },
    esiste: p => !!p && (p in memoria || p in DATI.file || (DATI.esistenti || []).some(x => String(p) === x || String(p).indexOf(x + "/") === 0)),
    eCartella: () => true, creaCartella() {}, elimina() {}, aggiungiTesto() {},
    stato: p => (DATI.pesi && DATI.pesi[p] ? { byte: DATI.pesi[p], modificato: 0 } : null),
    sha256: async () => "0",
    scrivania: () => "/Users/prova/Desktop",
    chiaveAnteprime: () => "prova",
    cartellaAnteprime: id => DATI.cartelle[id],
    pulisciAnteprime() {},
    nomeSicuro: s => String(s).replace(/[<>:"\/\\|?*]/g, "_").replace(/\s+/g, " ").trim(),
    STRUTTURE: ["FORMATO", "PER_PRODOTTO", "UNICA"],
    percorsiUscita(E, radice, nome) {
      const P = {}, st = E.struttura;
      for (const [k, c] of [["psd", "PSD"], ["jpg", "JPG"], ["png", "PNG"], ["webp", "WEBP"]]) {
        if (!E[k]) continue;
        P[k] = unisci(st === "FORMATO" ? unisci(radice, c) : st === "PER_PRODOTTO" ? unisci(radice, nome) : radice, nome + "." + k);
      }
      return P;
    },
    tuttiIPercorsi: P => ["psd", "jpg", "png", "webp"].filter(k => P[k]).map(k => P[k]),
    mostra() {}, avvisoSistema() {},
    urlFile: p => "file://" + String(p).split("/").map(encodeURIComponent).join("/"),
    dataOra: () => "2026-11-17_10-00",
    sistema: () => ({ piattaforma: "darwin", arch: "x64", node: "16.13.0", chrome: "99.0", cpu: 8, memoriaGB: 16 })
  };
})();
