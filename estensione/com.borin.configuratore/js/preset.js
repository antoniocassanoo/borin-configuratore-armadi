/* BORIN Batch 8 · valori predefiniti e preset.
   I valori BORIN sono quelli del v3: tela 5120 × 5120 a 300 DPI, oggetto al 60 %, correzione ottica Y 40 px,
   ombra Standard unificata, mappa sfumatura al 15 % e tonalità/saturazione su ciani e blu (+10/+10). */
(function (radice) {
  "use strict";

  const PREDEFINITI = {
    preparazione: { modo: "AUTO" },                 // AUTO | CUTOUT | PRECUT | PSD
    scontorno: { metodo: "SOGGETTO", contrai: 0, sfuma: 0, mascheraModificabile: true },
    livelli: {
      gestione: "ACTIVE",                            // ACTIVE | MERGE | PRESERVE (quando non è automatico)
      escludiOmbre: true, paroleOmbre: "ombra, shadow",
      escludiSfondi: true, paroleSfondi: "sfondo, background"
    },
    tela: { larghezza: 5120, altezza: 5120, dpi: 300 },
    posizione: {
      modo: "CENTRA",                                // CENTRA | COMPOSIZIONE | NESSUNA
      ridimensiona: true, riempimento: 60, centraX: true, centraY: true,
      correzioneY: 40, margine: 16, adatta: 100, qualita: "AUTO"
    },
    ombra: {
      attiva: true, stile: "STANDARD", intensita: 100, unisci: true, segui: true,
      nomeLivello: "Ombra_Adattiva_Unificata", appoggioReale: false, sogliaAlpha: 50, togliResidui: true
    },
    colore: {
      mappa: true, mappaOpacita: 15,
      tonalita: true, cianiSat: 10, cianiLum: 10, bluSat: 10, bluLum: 10,
      curva: false, mantieniProfilo: true
    },
    export: {
      psd: true, jpg: true, png: true, webp: true,
      jpgQualita: 10, jpgLato: 0, pngLato: 0, webpLato: 0,
      webpQualita: 80, webpLossless: false, webpMotore: "PHOTOSHOP", cwebp: "",
      sfondoBiancoPSD: false, sfondoBiancoPNG: false, sfondoBiancoWebP: false,
      webSRGB: true, struttura: "FORMATO", raccoltaWebP: true, esistenti: "SOVRASCRIVI", suffisso: ""
    },
    avvio: { sottocartelle: false, apriCartellaFine: false, suono: true }
  };

  // Dimensioni della tela pronte (l'utente può sempre scriverne altre).
  const TELE = [
    { id: "5120", nome: "5120 × 5120", nota: "BORIN e-commerce", larghezza: 5120, altezza: 5120 },
    { id: "3000", nome: "3000 × 3000", nota: "", larghezza: 3000, altezza: 3000 },
    { id: "2000", nome: "2000 × 2000", nota: "", larghezza: 2000, altezza: 2000 },
    { id: "1000", nome: "1000 × 1000", nota: "web leggero", larghezza: 1000, altezza: 1000 },
    { id: "4x5", nome: "1600 × 2000", nota: "verticale 4:5", larghezza: 1600, altezza: 2000 }
  ];

  // Preset di lavorazione: solo le voci che cambiano rispetto ai valori predefiniti.
  const PRESET = [
    { id: "auto", nome: "Automatico BORIN", nota: "Decide file per file: scontorno per le foto, livelli conservati per i PSD.", modifiche: {} },
    { id: "v3", nome: "Come il vecchio script", nota: "Come lo script guidato v3: scontorno AI su tutto, solo il livello attivo.",
      modifiche: { preparazione: { modo: "CUTOUT" }, livelli: { gestione: "ACTIVE", escludiOmbre: false, escludiSfondi: false }, ombra: { segui: false },
        export: { struttura: "PRODOTTO" } } },
    { id: "scontornare", nome: "Foto da scontornare", nota: "Scontorno AI su ogni file.", modifiche: { preparazione: { modo: "CUTOUT" } } },
    { id: "scontornata", nome: "Già scontornata", nota: "PNG o PSD già senza sfondo: niente scontorno.",
      modifiche: { preparazione: { modo: "PRECUT" }, livelli: { gestione: "ACTIVE" } } },
    { id: "psd", nome: "PSD multilivello", nota: "Livelli separati in un gruppo; ombre e sfondi vecchi esclusi.",
      modifiche: { preparazione: { modo: "PSD" }, livelli: { escludiOmbre: true, escludiSfondi: true } } },
    { id: "ridimensiona", nome: "Solo ridimensionamento", nota: "Tela e centratura, senza ombra e senza colore. PSD e JPG.",
      modifiche: { preparazione: { modo: "PRECUT" }, ombra: { attiva: false }, colore: { mappa: false, tonalita: false, curva: false },
        export: { png: false, webp: false } } },
    { id: "composizione", nome: "Composizione libera", nota: "Tiene la posizione dell'oggetto nella foto: adatta l'intera immagine alla tela.",
      modifiche: { posizione: { modo: "COMPOSIZIONE", adatta: 100 } } },
    { id: "web1000", nome: "Web 1000 × 1000", nota: "Tela 1000 × 1000 a 72 DPI, stessi passaggi BORIN.",
      modifiche: { tela: { larghezza: 1000, altezza: 1000, dpi: 72 } } }
  ];

  function copia(o) { return JSON.parse(JSON.stringify(o)); }

  function unisci(base, modifiche) {
    const out = copia(base);
    (function giu(a, b) {
      Object.keys(b || {}).forEach(k => {
        if (b[k] && typeof b[k] === "object" && !Array.isArray(b[k]) && a[k] && typeof a[k] === "object") giu(a[k], b[k]);
        else a[k] = b[k];
      });
    })(out, modifiche);
    return out;
  }

  // Impostazioni complete di un preset (o di impostazioni salvate): sempre tutte le voci, anche quelle nuove.
  function completa(cfg) { return unisci(PREDEFINITI, cfg || {}); }
  function dalPreset(id) {
    const p = PRESET.find(x => x.id === id) || PRESET[0];
    return unisci(PREDEFINITI, p.modifiche);
  }

  const API = { PREDEFINITI, TELE, PRESET, copia, unisci, completa, dalPreset };
  // Nel pannello CEP con Node attivo esiste anche «module»: si assegnano tutte e due.
  if (typeof window !== "undefined") window.BORIN_PRESET = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : this);
