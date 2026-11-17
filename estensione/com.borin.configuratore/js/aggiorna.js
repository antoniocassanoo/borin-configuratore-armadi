/* BORIN Configuratore · aggiornamenti da GitHub Releases: il pannello e i progetti PSD.
   Configurazione in <estensione>/aggiornamento.json: { "repo": "proprietario/nome", "token": "" }.
   Ogni release pubblicata da pubblica.sh contiene:
   - «BORIN-Configuratore-<versione>-aggiornamento.zip»: l'estensione senza i font;
   - «aggiornamento.json»: versione, sha256 dello zip e l'elenco dei PSD (nome, sha256, byte, release in cui sono).
   I PSD si scaricano solo quando cambiano, nella cartella dei dati (PSD/); il pannello si aggiorna con un clic.
   La copia di sviluppo (collegamento simbolico o cartella con sorgenti/) non si aggiorna da qui. */
(function () {
  "use strict";
  const fs = require("fs"), path = require("path"), https = require("https"), crypto = require("crypto"), cp = require("child_process");
  const URLNode = require("url").URL;        // nel pannello «URL» è quello del browser: https di Node vuole il suo
  const WIN = process.platform === "win32";
  const ID = "com.borin.configuratore";

  function leggiConfig(est) {
    try { return JSON.parse(fs.readFileSync(path.join(est, "aggiornamento.json"), "utf8")); } catch (e) { return {}; }
  }
  function versioneInstallata(est) {
    try { return (fs.readFileSync(path.join(est, "CSXS", "manifest.xml"), "utf8").match(/ExtensionBundleVersion="([^"]+)"/) || [])[1] || "0.0.0"; }
    catch (e) { return "0.0.0"; }
  }
  function confronta(a, b) {
    const x = String(a).replace(/^v/, "").split(".").map(n => parseInt(n, 10) || 0);
    const y = String(b).replace(/^v/, "").split(".").map(n => parseInt(n, 10) || 0);
    for (let i = 0; i < 3; i++) {
      if ((x[i] || 0) > (y[i] || 0)) return 1;
      if ((x[i] || 0) < (y[i] || 0)) return -1;
    }
    return 0;
  }

  // GET con i reindirizzamenti; con salvaIn scrive su file e chiama avanzamento(ricevuti, totale).
  function richiesta(url, opz, salvaIn, salti) {
    salti = salti || 0;
    return new Promise((ok, ko) => {
      const u = new URLNode(url);
      const intest = Object.assign({ "User-Agent": "BORIN-Configuratore" }, opz.intestazioni || {});
      if (opz.token && u.hostname === "api.github.com") intest.Authorization = "Bearer " + opz.token;
      const opzioni = { protocol: u.protocol, hostname: u.hostname, port: u.port || 443, path: u.pathname + u.search, headers: intest, timeout: 30000 };
      const req = https.get(opzioni, res => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          res.resume();
          if (salti > 5) return ko(new Error("troppi reindirizzamenti"));
          const prossimo = new URLNode(res.headers.location, u.href).toString();
          return ok(richiesta(prossimo, { token: opz.token, intestazioni: { Accept: "application/octet-stream" }, avanzamento: opz.avanzamento }, salvaIn, salti + 1));
        }
        if (res.statusCode !== 200) {
          res.resume();
          return ko(new Error(res.statusCode === 404 ? "nessuna versione pubblicata (o repository privato senza token)" : "GitHub ha risposto " + res.statusCode));
        }
        const totale = parseInt(res.headers["content-length"] || "0", 10) || 0;
        let ricevuti = 0;
        if (salvaIn) {
          const f = fs.createWriteStream(salvaIn);
          res.on("data", d => { ricevuti += d.length; if (opz.avanzamento) opz.avanzamento(ricevuti, totale); });
          res.pipe(f);
          f.on("finish", () => f.close(() => ok(salvaIn)));
          f.on("error", ko);
          res.on("error", ko);
        } else {
          const parti = [];
          res.on("data", d => parti.push(d));
          res.on("end", () => ok(Buffer.concat(parti)));
        }
      });
      req.on("timeout", () => req.destroy(new Error("GitHub non risponde")));
      req.on("error", e => ko(new Error("Connessione non riuscita: " + e.message)));
    });
  }
  function scaricaAsset(asset, cfg, salvaIn, avanzamento) {
    if (cfg.token && asset.url) return richiesta(asset.url, { token: cfg.token, intestazioni: { Accept: "application/octet-stream" }, avanzamento }, salvaIn);
    return richiesta(asset.browser_download_url, { intestazioni: { Accept: "application/octet-stream" }, avanzamento }, salvaIn);
  }
  function hash(file) {
    return new Promise((ok, ko) => {
      const h = crypto.createHash("sha256"), s = fs.createReadStream(file);
      s.on("data", d => h.update(d)); s.on("end", () => ok(h.digest("hex"))); s.on("error", ko);
    });
  }

  // Ultima versione pubblicata: { configurato, versione, nuova, novita, asset, sha256, progetti }.
  async function cerca(est) {
    const cfg = leggiConfig(est), attuale = versioneInstallata(est);
    if (!cfg.repo) return { configurato: false, attuale };
    const testo = await richiesta("https://api.github.com/repos/" + cfg.repo + "/releases/latest",
      { token: cfg.token, intestazioni: { Accept: "application/vnd.github+json" } });
    const rel = JSON.parse(testo.toString("utf8"));
    const versione = String(rel.tag_name || "").replace(/^v/, "");
    const asset = (rel.assets || []).find(a => /aggiornamento.*\.zip$/i.test(a.name));
    const descr = (rel.assets || []).find(a => /^aggiornamento\.json$/i.test(a.name));
    let info = {};
    if (descr) { try { info = JSON.parse((await scaricaAsset(descr, cfg)).toString("utf8")); } catch (e) {} }
    const progetti = (info.progetti || []).map(p => Object.assign({}, p, {
      url: "https://github.com/" + cfg.repo + "/releases/download/v" + (p.versione || versione) + "/" + encodeURIComponent(p.asset || p.nome)
    }));
    return {
      configurato: true, repo: cfg.repo, attuale, versione, nuova: !!asset && confronta(versione, attuale) > 0,
      novita: String(rel.body || "").trim(), data: rel.published_at, asset, sha256: info.sha256 || null, progetti
    };
  }

  // PSD da scaricare: quelli che mancano nella cartella o hanno un sha256 diverso da quello registrato.
  function progettiDaScaricare(progetti, cartella) {
    const reg = (() => { try { return JSON.parse(fs.readFileSync(path.join(cartella, "progetti.json"), "utf8")); } catch (e) { return {}; } })();
    return progetti.filter(p => {
      const f = path.join(cartella, p.nome), r = reg[p.nome];
      let s = null;
      try { s = fs.statSync(f); } catch (e) {}
      return !s || !r || r.sha256 !== p.sha256 || r.byte !== s.size;
    });
  }
  // Scarica i PSD indicati, controlla lo sha256 e solo alla fine sostituisce il file (mai un PSD a metà).
  async function scaricaProgetti(elenco, cartella, temp, avanzamento) {
    const cfg = {};                                 // i PSD stanno nelle release pubbliche: niente token
    fs.mkdirSync(cartella, { recursive: true });
    fs.mkdirSync(temp, { recursive: true });
    const regFile = path.join(cartella, "progetti.json");
    let reg = {};
    try { reg = JSON.parse(fs.readFileSync(regFile, "utf8")); } catch (e) {}
    const totale = elenco.reduce((s, p) => s + (p.byte || 0), 0);
    let fatti = 0;
    for (const p of elenco) {
      const tmp = path.join(temp, p.nome + ".scarico");
      await scaricaAsset({ browser_download_url: p.url }, cfg, tmp, r => { if (avanzamento) avanzamento(fatti + r, totale, p.nome); });
      const h = await hash(tmp);
      if (p.sha256 && h !== p.sha256) { try { fs.unlinkSync(tmp); } catch (e) {} throw new Error("«" + p.nome + "» scaricato non coincide con quello pubblicato: riprova."); }
      const dest = path.join(cartella, p.nome);
      try { fs.unlinkSync(dest); } catch (e) {}
      try { fs.renameSync(tmp, dest); } catch (e) { fs.copyFileSync(tmp, dest); fs.unlinkSync(tmp); }
      reg[p.nome] = { sha256: h, byte: fs.statSync(dest).size, versione: p.versione || "", data: new Date().toISOString() };
      fs.writeFileSync(regFile, JSON.stringify(reg, null, 2), "utf8");
      fatti += p.byte || 0;
    }
    return elenco.length;
  }

  function estrai(zip, cartella) {
    fs.mkdirSync(cartella, { recursive: true });
    const tar = WIN ? path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe") : "/usr/bin/tar";
    const r = cp.spawnSync(tar, ["-xf", zip, "-C", cartella], { windowsHide: true });
    if (r.status !== 0) throw new Error("Estrazione non riuscita: " + String(r.stderr || r.error || r.status).trim());
  }
  function copiaAlbero(da, a, salta) {
    for (const v of fs.readdirSync(da, { withFileTypes: true })) {
      const sorg = path.join(da, v.name), dest = path.join(a, v.name);
      if (salta && salta(v.name)) continue;
      if (v.isDirectory()) { fs.mkdirSync(dest, { recursive: true }); copiaAlbero(sorg, dest, null); }
      else if (v.isFile()) { fs.mkdirSync(a, { recursive: true }); fs.copyFileSync(sorg, dest); }
    }
  }
  function eSviluppo(est) {
    try { return fs.lstatSync(est).isSymbolicLink() || fs.existsSync(path.join(est, "..", "sorgenti", "monta.js")); } catch (e) { return false; }
  }

  // Scarica, controlla e installa la versione trovata. I font e il file .debug non si toccano.
  async function installa(est, trovato, temp, avanzamento) {
    if (eSviluppo(est)) throw new Error("Questa è la copia di sviluppo: si aggiorna con git, non da qui.");
    const cfg = leggiConfig(est), fase = t => { if (avanzamento) avanzamento(t); };
    fs.mkdirSync(temp, { recursive: true });
    const zip = path.join(temp, "aggiornamento.zip");
    fase("scarico la versione " + trovato.versione + "…");
    await scaricaAsset(trovato.asset, cfg, zip);
    if (trovato.sha256 && (await hash(zip)) !== trovato.sha256) throw new Error("Il file scaricato è diverso da quello pubblicato: aggiornamento annullato.");
    fase("controllo il pacchetto…");
    const dove = path.join(temp, "nuova");
    estrai(zip, dove);
    const radice = fs.existsSync(path.join(dove, ID)) ? path.join(dove, ID) : dove;
    const man = fs.readFileSync(path.join(radice, "CSXS", "manifest.xml"), "utf8");
    if (!new RegExp('ExtensionBundleId="' + ID.replace(/\./g, "\\.") + '"').test(man)) throw new Error("Il pacchetto scaricato non è BORIN Configuratore.");
    const v = (man.match(/ExtensionBundleVersion="([^"]+)"/) || [])[1];
    if (v !== trovato.versione) throw new Error("Il pacchetto è la versione " + v + ", non la " + trovato.versione + ".");
    for (const f of ["index.html", "js/app.js", "jsx/armadi.jsx", "jsx/borin_motore.jsx"]) {
      if (!fs.existsSync(path.join(radice, f))) throw new Error("Nel pacchetto manca " + f + ".");
    }
    fase("installo…");
    const copia = path.join(temp, "precedente");
    copiaAlbero(est, copia, n => n === "fonts");
    try {
      copiaAlbero(radice, est, n => n === ".debug" || n === "fonts");
    } catch (e) {
      try { copiaAlbero(copia, est, null); } catch (e2) {}
      throw new Error("Installazione non riuscita, rimessa la versione di prima: " + e.message);
    }
    return v;
  }

  const API = { leggiConfig, versioneInstallata, confronta, cerca, installa, eSviluppo, progettiDaScaricare, scaricaProgetti };
  if (typeof window !== "undefined") window.BORIN_AGGIORNA = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})();
