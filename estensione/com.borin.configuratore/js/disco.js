/* BORIN Configuratore · disco: cartelle, impostazioni, cache delle anteprime, nomi e percorsi delle uscite.
   Gira con Node: dentro il pannello CEP (Node attivo) e nei collaudi da terminale. */
(function () {
  "use strict";
  const fs = require("fs"), path = require("path"), os = require("os"), cp = require("child_process"), crypto = require("crypto");
  const WIN = process.platform === "win32";

  // ------------------------------------------------------------ cartelle e JSON
  function cartellaDati() {
    const base = WIN ? (process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"))
                     : path.join(os.homedir(), "Library", "Application Support");
    const c = path.join(base, "BORIN", "Configuratore armadi");
    fs.mkdirSync(c, { recursive: true });
    return c;
  }
  function cartellaTemp(id) {
    const c = path.join(os.tmpdir(), "borin-configuratore", id || "comune");
    fs.mkdirSync(c, { recursive: true });
    return c;
  }
  function leggiJSON(file, predefinito) {
    try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { return predefinito; }
  }
  function scriviJSON(file, dati) {                  // prima un file temporaneo, poi lo scambio
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + ".tmp-" + process.pid;
    fs.writeFileSync(tmp, JSON.stringify(dati, null, 2), "utf8");
    fs.renameSync(tmp, file);
  }
  function esiste(p) { try { fs.accessSync(p); return true; } catch (e) { return false; } }
  function eCartella(p) { try { return fs.statSync(p).isDirectory(); } catch (e) { return false; } }
  function creaCartella(p) { fs.mkdirSync(p, { recursive: true }); }
  function elimina(p) { try { fs.rmSync(p, { recursive: true, force: true }); } catch (e) { try { fs.unlinkSync(p); } catch (e2) {} } }
  function aggiungiTesto(file, testo) { try { creaCartella(path.dirname(file)); fs.appendFileSync(file, testo, "utf8"); } catch (e) {} }
  function stato(p) { try { const s = fs.statSync(p); return { byte: s.size, modificato: s.mtimeMs }; } catch (e) { return null; } }
  function sha256(p) {
    return new Promise((ok, ko) => {
      const h = crypto.createHash("sha256"), s = fs.createReadStream(p);
      s.on("data", d => h.update(d)); s.on("end", () => ok(h.digest("hex"))); s.on("error", ko);
    });
  }
  function scrivania() {                              // anche con il desktop in OneDrive (Windows)
    const c = [path.join(os.homedir(), "Desktop"), path.join(os.homedir(), "OneDrive", "Desktop"), path.join(os.homedir(), "Scrivania")];
    return c.find(eCartella) || os.homedir();
  }

  // ------------------------------------------------------------ anteprime: una cartella per PSD e per versione del file
  // La chiave cambia se il PSD cambia (percorso, peso, data): le anteprime si rifanno da sole.
  function chiaveAnteprime(psd, versioneMotore) {
    const s = stato(psd);
    if (!s) return null;
    return crypto.createHash("sha1").update([path.resolve(psd), s.byte, Math.round(s.modificato), versioneMotore].join("|")).digest("hex").slice(0, 12);
  }
  function cartellaAnteprime(id, chiave) { return path.join(cartellaDati(), "anteprime", id + "-" + chiave); }
  function pulisciAnteprime(id, tieni) {             // via le anteprime vecchie dello stesso tipo
    const radice = path.join(cartellaDati(), "anteprime");
    try {
      for (const n of fs.readdirSync(radice)) if (n.startsWith(id + "-") && n !== path.basename(tieni)) elimina(path.join(radice, n));
    } catch (e) {}
  }

  // ------------------------------------------------------------ nomi e uscite (come BORIN Batch)
  const RISERVATI = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
  function nomeSicuro(s) {
    let n = String(s).replace(/[<>:"\/\\|?*\x00-\x1f]/g, "_").replace(/\s+/g, " ").replace(/[. ]+$/, "").trim();
    if (!n) n = "Armadio";
    if (RISERVATI.test(n)) n = "_" + n;
    return n;
  }
  //   FORMATO       JPG/nome.jpg, PNG/nome.png, PSD/…, WEBP/…
  //   PER_PRODOTTO  nome/nome.jpg, nome/nome.png…
  //   UNICA         nome.jpg, nome.png…
  const STRUTTURE = ["FORMATO", "PER_PRODOTTO", "UNICA"];
  function percorsiUscita(E, radice, nome) {
    const st = STRUTTURE.includes(E.struttura) ? E.struttura : "FORMATO", P = {};
    for (const [k, cartella] of [["psd", "PSD"], ["jpg", "JPG"], ["png", "PNG"], ["webp", "WEBP"]]) {
      if (!E[k]) continue;
      const c = st === "FORMATO" ? path.join(radice, cartella) : st === "PER_PRODOTTO" ? path.join(radice, nome) : radice;
      P[k] = path.join(c, nome + "." + k);
    }
    return P;
  }
  function tuttiIPercorsi(P) { return ["psd", "jpg", "png", "webp"].filter(k => P[k]).map(k => P[k]); }

  // ------------------------------------------------------------ Finder / Esplora risorse, avvisi di sistema
  function mostra(percorso, seleziona) {
    try {
      if (WIN) cp.spawn("explorer.exe", seleziona ? ["/select,", percorso] : [percorso], { detached: true });
      else cp.spawn("open", seleziona ? ["-R", percorso] : [percorso], { detached: true });
    } catch (e) {}
  }
  function avvisoSistema(titolo, testo) {          // notifica del sistema (Mac); su Windows basta quella nel pannello
    if (WIN) return;
    try { cp.execFile("osascript", ["-e", "display notification " + JSON.stringify(testo) + " with title " + JSON.stringify(titolo)]); } catch (e) {}
  }
  function urlFile(p) {
    const s = path.resolve(p).replace(/\\/g, "/");
    return "file://" + (s.startsWith("/") ? "" : "/") + s.split("/").map(encodeURIComponent).join("/").replace(/^\/([A-Za-z])%3A/, "/$1:");
  }
  function dataOra(d) {
    const z = n => String(n).padStart(2, "0");
    d = d || new Date();
    return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate()) + "_" + z(d.getHours()) + "-" + z(d.getMinutes());
  }
  function sistema() {
    return { piattaforma: process.platform, arch: process.arch, node: process.versions.node, chrome: process.versions.chrome || "",
             cpu: os.cpus().length, memoriaGB: Math.round(os.totalmem() / 1073741824) };
  }

  const API = {
    WIN, unisci: (...p) => path.join(...p), cartellaDi: p => path.dirname(p), nomeDi: p => path.basename(p), relativo: (da, a) => path.relative(da, a),
    cartellaDati, cartellaTemp, leggiJSON, scriviJSON, esiste, eCartella, creaCartella, elimina, aggiungiTesto, stato, sha256,
    scrivania, chiaveAnteprime, cartellaAnteprime, pulisciAnteprime, nomeSicuro, STRUTTURE, percorsiUscita, tuttiIPercorsi,
    mostra, avvisoSistema, urlFile, dataOra, sistema
  };
  if (typeof window !== "undefined") window.BORIN_DISCO = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
