// Fotografa il pannello fuori da Photoshop (Chrome senza finestra) con le anteprime vere prodotte dal motore.
// Uso: node test/pannello.js <cartella anteprime> <cartella scatti> [scatto1,scatto2]
//   <cartella anteprime> contiene st-<tipo>.json (risposta di «anteprime») e <tipo>/ con i PNG (vedi test/motore.jsx).
"use strict";
const path = require("path"), fs = require("fs"), cp = require("child_process");
const EXT = path.join(__dirname, "..", "estensione", "com.borin.configuratore");
const ANT = process.argv[2], OUT = process.argv[3];
const SHOT = process.env.SHOT || "/Users/ts/Documents/Tutto ciò che c_è da sapere del design ai/09 - Kit pronto all_uso/skill/design-su-misura/strumenti/shot.mjs";
fs.mkdirSync(OUT, { recursive: true });
const url = p => "file://" + path.resolve(p).split("/").map(encodeURIComponent).join("/");

const tipi = JSON.parse(fs.readFileSync(path.join(EXT, "armadi.json"), "utf8")).tipi;
const PSD = "/Users/prova/Library/Application Support/BORIN/Configuratore armadi/PSD";
const dati = { estensione: EXT, cartelle: {}, strutture: {}, file: {}, esistenti: [], pesi: {}, cartellaUscita: "/Users/prova/Desktop/Armadi BORIN" };
dati.file[path.join(EXT, "armadi.json")] = JSON.parse(fs.readFileSync(path.join(EXT, "armadi.json"), "utf8"));
dati.file[path.join(EXT, "colori.json")] = JSON.parse(fs.readFileSync(path.join(EXT, "colori.json"), "utf8"));
for (const t of tipi) {
  const r = JSON.parse(fs.readFileSync(path.join(ANT, "st-" + t.id + ".json"), "utf8"));
  if (!r.ok) continue;
  const cartella = path.join(ANT, t.id);
  dati.cartelle[t.id] = cartella;
  dati.strutture[t.id] = r.dati;
  dati.esistenti.push(PSD + "/" + t.psd, cartella);
  dati.pesi[PSD + "/" + t.psd] = { singolo: 15342787, doppio: 34975931, triplo: 32942424 }[t.id];
}
dati.risultato = path.join(ANT, "doppio", "corpo.png");

const modello = fs.readFileSync(path.join(EXT, "index.html"), "utf8");
function pagina(nome, opz) {
  const d = JSON.parse(JSON.stringify(dati));
  if (opz.cache) for (const t of tipi) if (dati.cartelle[t.id]) d.file[path.join(dati.cartelle[t.id], "struttura.json")] = Object.assign({}, dati.strutture[t.id]);
  d.file["impostazioni.json"] = Object.assign({ tipo: "doppio", uscita: "/Users/prova/Desktop/Armadi BORIN", psd: { sorgente: "CARTELLA", cartella: PSD } }, opz.impostazioni || {});
  d.lentezza = opz.lentezza || 5; d.lentezzaExport = opz.lentezzaExport || 20;
  const testa = `<base href="${url(EXT)}/">\n<script>window.DATI_FINTI = ${JSON.stringify(d)};` +
    `window.BORIN_SENZA_INTRO = ${!opz.intro}; window.BORIN_TEMA = ${JSON.stringify(opz.tema || "scuro")};` +
    `window.BORIN_SCHEDA = ${JSON.stringify(opz.scheda || "")}; window.BORIN_BLOCCO = ${JSON.stringify(opz.blocco || "")}; window.BORIN_AZIONE = ${JSON.stringify(opz.azione || "")};</script>\n` +
    `<script src="${url(path.join(__dirname, "finto.js"))}"></script>` + (opz.script ? `\n<script>window.addEventListener("load", () => setTimeout(() => { ${opz.script} }, ${opz.dopo || 400}));</script>` : "");
  const f = path.join(OUT, nome + ".html");
  fs.writeFileSync(f, modello.replace("<head>", "<head>\n" + testa), "utf8");
  return f;
}
function scatta(nome, opz) {
  const f = pagina(nome, opz), png = path.join(OUT, nome + ".png");
  const arg = [SHOT, f, png, "--width", String(opz.w || 460), "--height", String(opz.h || 860), "--json", path.join(OUT, nome + ".json"), "--wait", String(opz.attesa || 1200)];
  const r = cp.spawnSync("node", arg, { encoding: "utf8" });
  if (r.status !== 0) { console.log(nome, "ERRORE", r.stderr || r.stdout); return; }
  const m = JSON.parse(fs.readFileSync(path.join(OUT, nome + ".json"), "utf8"));
  console.log(nome + ": font " + JSON.stringify(m.fontsRendered) + " · tracimazione " + m.horizontalOverflow + " · richieste fallite " + JSON.stringify(m.failedRequests || []) + (m.consoleErrors && m.consoleErrors.length ? " · errori " + JSON.stringify(m.consoleErrors) : ""));
}
const solo = process.argv[4] ? process.argv[4].split(",") : null;
const SCATTI = [
  ["doppio-scuro", { cache: true }],
  ["doppio-chiaro", { cache: true, tema: "chiaro" }],
  ["triplo-largo-chiaro", { cache: true, tema: "chiaro", w: 1000, h: 900, impostazioni: { tipo: "triplo" } }],
  ["singolo-stretto", { cache: true, w: 340, h: 760, impostazioni: { tipo: "singolo" } }],
  ["preparo", { cache: false, lentezza: 400, attesa: 2500 }],
  ["info-livelli", { cache: true, scheda: "info", h: 1800 }],
  ["intro", { cache: true, intro: true, attesa: 1500 }],
  ["esito", { cache: true, azione: "crea", attesa: 2500, h: 1300 }],
  ["doppio-rosso", { cache: true, impostazioni: { tipo: "doppio", colore: "rosso" } }],
  ["triplo-grigio-scuro-chiaro", { cache: true, tema: "chiaro", w: 1000, h: 900, impostazioni: { tipo: "triplo", colore: "grigio-scuro" } }],
  ["singolo-blu-stretto", { cache: true, w: 340, h: 900, impostazioni: { tipo: "singolo", colore: "blu-5015" } }],
  ["vuoto-scomparto", { cache: true, impostazioni: { tipo: "doppio", contenuti: { doppio: { "scomparti-inferiori": false } }, scelte: { doppio: { "scomparti-inferiori": "stivali", base: "piedi-tondi", serratura: "antiscasso" } } } }]
];
for (const [n, o] of SCATTI) if (!solo || solo.includes(n)) scatta(n, o);
