/* BORIN Configuratore armadi · logica del pannello.
   - I tipi (singolo, doppio, triplo) sono in armadi.json; gruppi e opzioni si leggono dai PSD (motore armadi.jsx).
   - Anteprime: un PNG per pezzo del PSD, in cache nella cartella dei dati; si impilano qui come in Photoshop.
   - Export: il motore accende i livelli, unisce la composizione e la passa al motore di BORIN Batch (elabora).
   - Impostazioni in <cartella dati>/impostazioni.json; PSD scaricati in <cartella dati>/PSD (o una cartella scelta). */
(function () {
  "use strict";
  const P = window.BORIN_PRESET, D = window.BORIN_DISCO, A = window.BORIN_AGGIORNA || null, Ponte = window.Ponte;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ANTEPRIME_V = "1";                         // cambia solo se cambia il formato delle anteprime
  const ALTEZZA_ANTEPRIME = 1000;

  // ------------------------------------------------------------------ errori del pannello: sempre visibili
  function mostraErrore(testo) {
    const box = $("#erroreJS");
    $("span", box).textContent = testo;
    box.hidden = false;
    if (D) D.aggiungiTesto(D.unisci(D.cartellaDati(), "errori.log"), new Date().toISOString() + " " + testo + "\n");
  }
  window.addEventListener("error", e => mostraErrore("Errore del pannello: " + e.message + (e.lineno ? " (riga " + e.lineno + ")" : "")));
  window.addEventListener("unhandledrejection", e => mostraErrore("Errore: " + (e.reason && e.reason.message || e.reason)));
  $("#erroreJS button").addEventListener("click", () => { $("#erroreJS").hidden = true; });

  // ------------------------------------------------------------------ intro con il logo, a ogni apertura
  (function intro() {
    const el = $("#intro");
    if (!el) return;
    if (window.BORIN_SENZA_INTRO || /senza-intro/.test(location.search) || document.hidden) { el.remove(); return; }
    const via = () => { if (el.isConnected) el.remove(); };
    el.addEventListener("animationend", e => { if (e.target === el) via(); });
    const salta = () => el.classList.add("salta");
    el.addEventListener("click", salta);
    window.addEventListener("keydown", salta, { once: true });
    setTimeout(via, 3200);
  })();

  // ------------------------------------------------------------------ aspetto: tema come Photoshop, accento Acciaio Blu
  const S = {
    tipi: [], regole: {}, tipo: "doppio", strutture: {}, scelte: {}, contenuti: {}, nascondi: {}, avvisi: [],
    nomeManuale: null, uscita: "", export: { psd: true, jpg: true, png: true, webp: true, struttura: "FORMATO" }, tela: "5120",
    psd: { sorgente: "GITHUB", cartella: "" }, aspetto: { tema: "auto" }, ultimoControllo: 0, avvisiNotificati: "",
    info: null, collegato: false, inCorso: false, ferma: false, preparo: null
  };
  const OSSIDIANA = "#1F2121", INOX = "#EAE8E9", ACCIAIO = "#3578A3";
  const rgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const esa = c => "#" + c.map(x => Math.round(x).toString(16).padStart(2, "0")).join("");
  const mescola = (a, b, t) => { const X = rgb(a), Y = rgb(b); return esa(X.map((x, i) => x + (Y[i] - x) * t)); };
  const luce = h => rgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); })
    .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  const contrasto = (a, b) => { const x = luce(a), y = luce(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  function temaChiaro() {
    if (S.aspetto.tema === "chiaro") return true;
    if (S.aspetto.tema === "scuro") return false;
    if (window.BORIN_TEMA) return window.BORIN_TEMA === "chiaro";
    const c = Ponte.sfondoPhotoshop();
    return c ? (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255 > 0.5 : false;
  }
  function applicaAspetto() {
    const chiaro = temaChiaro(), radice = document.documentElement, st = radice.style;
    radice.dataset.tema = chiaro ? "chiaro" : "scuro";
    const a = ACCIAIO, piano = chiaro ? "#f6f5f5" : "#282b2b", verso = chiaro ? OSSIDIANA : INOX;
    let testo = a;
    for (let t = 0.1; contrasto(testo, piano) < 4.5 && t <= 1.01; t += 0.1) testo = mescola(a, verso, t);
    const [R, G, B] = rgb(a);
    st.setProperty("--accento", a);
    st.setProperty("--accento-forte", mescola(a, verso, 0.14));
    st.setProperty("--accento-testo", testo);
    st.setProperty("--accento-tenue", `rgba(${R}, ${G}, ${B}, ${chiaro ? 0.13 : 0.22})`);
    $$("#sceltaTema button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === S.aspetto.tema)));
  }
  applicaAspetto();
  Ponte.quandoCambiaTema(applicaAspetto);

  if (!D) { mostraErrore("Node non è attivo nel pannello: reinstalla BORIN Configuratore."); return; }
  const FILE_IMPOSTAZIONI = D.unisci(D.cartellaDati(), "impostazioni.json");
  const VERSIONE = (A && Ponte.estensione) ? A.versioneInstallata(Ponte.estensione) : (window.BORIN_VERSIONE || "1.0.0");
  Ponte.versioneAttesa = VERSIONE;
  $("#versione").textContent = VERSIONE;

  // ------------------------------------------------------------------ regole (armadi.json) e memoria
  const REGOLE = D.leggiJSON(D.unisci(Ponte.estensione, "armadi.json"), null) || { tipi: [] };
  S.tipi = REGOLE.tipi || [];
  REGOLE.prefissi = REGOLE.prefissi || {}; REGOLE.nomiNelFile = REGOLE.nomiNelFile || {}; REGOLE.ordineNelNome = REGOLE.ordineNelNome || [];

  function carica() {
    const m = D.leggiJSON(FILE_IMPOSTAZIONI, {}) || {};
    for (const k of ["tipo", "scelte", "contenuti", "uscita", "tela", "ultimoControllo", "avvisiNotificati"]) if (m[k] !== undefined) S[k] = m[k];
    if (m.export) Object.assign(S.export, m.export);
    if (m.psd) Object.assign(S.psd, m.psd);
    if (m.aspetto) Object.assign(S.aspetto, m.aspetto);
    if (!S.tipi.some(t => t.id === S.tipo)) S.tipo = (S.tipi[1] || S.tipi[0] || {}).id;
    if (!S.uscita) S.uscita = D.unisci(D.scrivania(), "Armadi BORIN");
  }
  function salva() {
    try {
      D.scriviJSON(FILE_IMPOSTAZIONI, { versione: VERSIONE, tipo: S.tipo, scelte: S.scelte, contenuti: S.contenuti, uscita: S.uscita,
        export: S.export, tela: S.tela, psd: S.psd, aspetto: S.aspetto, ultimoControllo: S.ultimoControllo, avvisiNotificati: S.avvisiNotificati });
    } catch (e) { mostraErrore("Impostazioni non salvate: " + e.message); }
  }

  // ------------------------------------------------------------------ PSD
  const tipoAttivo = () => S.tipi.find(t => t.id === S.tipo) || S.tipi[0];
  function cartellaPSD() { return S.psd.sorgente === "CARTELLA" && S.psd.cartella ? S.psd.cartella : D.unisci(D.cartellaDati(), "PSD"); }
  function percorsoPSD(t) { return D.unisci(cartellaPSD(), t.psd); }

  // ------------------------------------------------------------------ nomi
  const MINUSCOLE = new Set(["a", "e", "di", "da", "con", "per", "in", "su", "il", "la", "le", "lo", "gli", "i", "del", "della"]);
  const sigla = s => String(s).trim().replace(/\s+/g, " ").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const pulito = s => String(s).trim().replace(/\s+/g, " ");
  const titolo = s => pulito(s).split(" ").map((w, i) => i && MINUSCOLE.has(w.toLowerCase()) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  const visibili = s => String(s).replace(/^ +| +$/g, m => "␣".repeat(m.length));       // spazi all'inizio e alla fine, in vista
  function distanza(a, b) {                          // Levenshtein: «pomello» e «pomolo» → 2
    const m = a.length, n = b.length, d = Array.from({ length: m + 1 }, (_, i) => [i].concat(Array(n).fill(0)));
    for (let j = 1; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[m][n];
  }
  const simile = (a, b) => a === b || (a.length >= 5 && b.length >= 5 && distanza(a, b) <= 2);

  function ordinate(g) { return g.opzioni.slice().sort((a, b) => a.nome.localeCompare(b.nome, "it", { numeric: true })); }
  function sceltaDi(t) {
    const st = S.strutture[t.id];
    const sc = S.scelte[t.id] || (S.scelte[t.id] = {}), co = S.contenuti[t.id] || (S.contenuti[t.id] = {});
    if (st) for (const g of st.gruppi) {
      if (!g.opzioni.some(o => o.id === sc[g.id])) sc[g.id] = g.predefinita || (ordinate(g)[0] || {}).id;
    }
    return { opzioni: Object.assign({}, sc), contenuti: Object.assign({}, co), nascondi: (S.nascondi[t.id] || []).slice() };
  }
  const haContenuti = o => (o.parti || []).some(p => p.ruolo === "contenuto");
  function nomeAutomatico(t, scelta) {
    const st = S.strutture[t.id];
    if (!st) return t.nomeFile;
    const ordine = REGOLE.ordineNelNome, pos = g => { const i = ordine.indexOf(g.id); return i < 0 ? 100 + g.numero : i; };
    const parti = [t.nomeFile, REGOLE.colore || "Bianco"];
    for (const g of st.gruppi.slice().sort((a, b) => pos(a) - pos(b))) {
      const o = g.opzioni.find(x => x.id === scelta.opzioni[g.id]);
      if (!o) continue;
      parti.push((REGOLE.prefissi[g.id] || "") + (REGOLE.nomiNelFile[sigla(o.nomeFile)] || titolo(o.nomeFile)));
      if (haContenuti(o) && scelta.contenuti[g.id] === false) parti.push(REGOLE.vuoto || "Vuoto");
    }
    return D.nomeSicuro(parti.join(" - "));
  }

  // ------------------------------------------------------------------ anteprime: pezzi del PSD impilati
  const FUSIONI = { MULTIPLY: "multiply", SCREEN: "screen", OVERLAY: "overlay", DARKEN: "darken", LIGHTEN: "lighten", COLORDODGE: "color-dodge",
    COLORBURN: "color-burn", HARDLIGHT: "hard-light", SOFTLIGHT: "soft-light", DIFFERENCE: "difference", EXCLUSION: "exclusion", HUE: "hue",
    SATURATION: "saturation", COLORBLEND: "color", LUMINOSITY: "luminosity", LINEARBURN: "multiply", DARKERCOLOR: "darken", LIGHTERCOLOR: "lighten" };
  function parteDi(st, percorso) {
    for (const g of st.gruppi) for (const o of g.opzioni) for (const p of o.parti || []) if (p.percorso === percorso) return p;
    return null;
  }
  function pezziVisibili(st, scelta) {
    const nasc = new Set(scelta.nascondi || []);
    return st.anteprime.pezzi.filter(p => {
      if (nasc.has(p.percorso)) return false;
      if (!p.gruppo) return true;                                  // corpo e livelli sempre accesi
      if (scelta.opzioni[p.gruppo] !== p.opzione) return false;
      if (p.ruolo === "contenuto") return scelta.contenuti[p.gruppo] !== false;
      if (p.ruolo === "altro") { const x = parteDi(st, p.percorso); return !x || x.accesaNelFile; }
      return true;
    });
  }
  function creaPila(el, st) {
    el.innerHTML = "";
    for (const p of st.anteprime.pezzi.slice().sort((a, b) => a.z - b.z)) {
      const img = document.createElement("img");
      img.src = D.urlFile(D.unisci(st.cartella, p.file));
      img.alt = ""; img.draggable = false; img.dataset.id = p.id;
      if (FUSIONI[p.fusione]) img.style.mixBlendMode = FUSIONI[p.fusione];
      img.style.display = "none";
      el.appendChild(img);
    }
  }
  function mostraPila(el, st, scelta) {
    const vis = new Set(pezziVisibili(st, scelta).map(p => p.id));
    for (const img of el.children) img.style.display = vis.has(img.dataset.id) ? "" : "none";
  }
  function unione(lista) {
    const r = [Infinity, Infinity, -Infinity, -Infinity];
    for (const b of lista) { if (!b || b[2] - b[0] < 1 || b[3] - b[1] < 1) continue; r[0] = Math.min(r[0], b[0]); r[1] = Math.min(r[1], b[1]); r[2] = Math.max(r[2], b[2]); r[3] = Math.max(r[3], b[3]); }
    return isFinite(r[0]) ? r : null;
  }
  function allarga(r, k, st) {
    const w = r[2] - r[0], h = r[3] - r[1], dx = w * k, dy = h * k;
    return [Math.max(0, r[0] - dx), Math.max(0, r[1] - dy), Math.min(st.larghezza, r[2] + dx), Math.min(st.altezza, r[3] + dy)];
  }
  function inquadra(pila, box, st, r, riempi) {      // r in pixel del PSD; la pila è la tela intera ridotta
    const W = box.clientWidth, H = box.clientHeight;
    if (!W || !H || !r) return;
    const rw = r[2] - r[0], rh = r[3] - r[1], s = Math.min(W / rw, H / rh) * (riempi || 1);
    pila.style.width = st.larghezza * s + "px";
    pila.style.height = st.altezza * s + "px";
    pila.style.left = (W / 2 - (r[0] + rw / 2) * s) + "px";
    pila.style.top = (H / 2 - (r[1] + rh / 2) * s) + "px";
  }
  function cornice(st) {                             // la stessa per tutte le scelte del tipo: l'armadio non salta
    return unione(st.anteprime.pezzi.filter(p => !(S.nascondi[st.tipo] || []).includes(p.percorso)).map(p => p.bordi)) || [0, 0, st.larghezza, st.altezza];
  }
  function rettOpzione(st, g, o) {                   // il dettaglio da mostrare nella casella
    const nasc = new Set(S.nascondi[st.tipo] || []);
    const pezzi = st.anteprime.pezzi.filter(p => p.gruppo === g.id && p.opzione === o.id && !nasc.has(p.percorso));
    const cont = pezzi.filter(p => p.ruolo === "contenuto");
    let r = unione((cont.length ? cont : pezzi).map(p => p.bordi)) || unione([o.bordi]) || [0, 0, st.larghezza, st.altezza];
    const w = r[2] - r[0], h = r[3] - r[1];
    if (w > h * 2.2) r = [r[0], r[1], r[0] + h * 1.4, r[3]];      // pezzo largo (la base): il dettaglio di un angolo
    return allarga(r, 0.16, st);
  }

  // ------------------------------------------------------------------ disegno: tipi, anteprima, scelte
  function prospettoSVG(ante) {                      // l'armadio di fronte: tetto inclinato, ante, piedini
    const w = 14 + ante * 15, h = 46, x0 = (60 - w) / 2;
    let s = `<svg viewBox="0 0 60 52" aria-hidden="true"><path class="fondo" d="M${x0} 9 L${x0 + w} 4 L${x0 + w} ${h} L${x0} ${h} Z"/>` +
      `<path class="linea" d="M${x0} 9 L${x0 + w} 4 L${x0 + w} ${h} L${x0} ${h} Z"/>`;
    const lw = w / ante;
    for (let i = 1; i < ante; i++) s += `<path class="linea" d="M${x0 + lw * i} ${9 - 5 * (lw * i) / w} L${x0 + lw * i} ${h}"/>`;
    for (let i = 0; i < ante; i++) s += `<rect class="pieno" x="${x0 + lw * i + lw - 4}" y="25" width="1.6" height="5" rx=".8"/>`;
    s += `<path class="linea" d="M${x0 + 3} ${h} v3 M${x0 + w - 3} ${h} v3"/></svg>`;
    return s;
  }
  function disegnaTipi() {
    $("#tipi").innerHTML = S.tipi.map(t => `<button class="tipo" role="radio" data-tipo="${esc(t.id)}" aria-checked="${t.id === S.tipo}">` +
      prospettoSVG(t.ante) + `<b>${esc(t.nome)}</b><small>${t.ante} ${t.ante === 1 ? "anta" : "ante"}</small></button>`).join("");
  }
  $("#tipi").addEventListener("click", e => {
    const b = e.target.closest("[data-tipo]");
    if (!b || S.inCorso) return;
    S.tipo = b.dataset.tipo; S.nomeManuale = null; salva();
    disegnaTipi(); disegnaTutto();
    const t = tipoAttivo();
    if (!S.strutture[t.id]) preparaTipo(t).then(disegnaTutto).catch(e2 => mostraVuoto(e2.message));
  });

  function mostraVuoto(testo) {
    $("#pila").innerHTML = `<div class="vuoto-piatto">${esc(testo)}</div>`;
    $("#pila").style.cssText = "position:absolute;inset:0;width:auto;height:auto";
  }
  let pilaDi = null;                                  // tipo per cui è costruita la pila grande
  function altezzaPiatto() {                         // il piatto entra tutto nello spazio visibile sotto i tipi
    const main = $("#contenuto"), piatto = $("#piatto");
    if (!main || !piatto || !piatto.offsetParent || window.innerWidth < 400) { if (piatto) piatto.style.height = ""; return; }
    const sopra = piatto.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop;
    piatto.style.height = Math.round(Math.max(240, Math.min(980, main.clientHeight - sopra - 12))) + "px";
  }
  function disegnaAnteprima() {
    altezzaPiatto();
    const t = tipoAttivo(), st = S.strutture[t.id], pila = $("#pila");
    if (!st) {
      pilaDi = null;
      if (S.preparo && S.preparo.id === t.id) return;           // c'è già la barra dell'attesa
      mostraAttesa(null);
      mostraVuoto(S.preparo ? "Preparo le anteprime: il " + t.nome.toLowerCase() + " arriva subito dopo." : statoTipo(t));
      return;
    }
    if (!(S.preparo && S.preparo.id === t.id)) mostraAttesa(null);
    if (pilaDi !== st) { pila.style.cssText = ""; creaPila(pila, st); pilaDi = st; }
    mostraPila(pila, st, sceltaDi(t));
    inquadra(pila, $("#piatto"), st, allarga(cornice(st), 0.04, st), 1);
  }
  function statoTipo(t) {
    if (!D.esiste(percorsoPSD(t))) return S.psd.sorgente === "CARTELLA" ? "Nella cartella scelta non c'è «" + t.psd + "» (Info › Progetti PSD)." : "Il progetto «" + t.psd + "» non è ancora stato scaricato.";
    return "L'anteprima del " + t.nome.toLowerCase() + " non è ancora pronta.";
  }
  function etichettaContenuto(o) {
    const testo = (o.parti || []).filter(p => p.ruolo === "contenuto").map(p => (p.contenuto || "").toLowerCase()).join(" ");
    if (/stival/.test(testo)) return "Con gli stivali dentro";
    if (/scarp/.test(testo)) return "Con le scarpe dentro";
    return "Con il contenuto";
  }
  function disegnaGruppi() {
    const t = tipoAttivo(), st = S.strutture[t.id], box = $("#gruppi");
    if (!st) { box.innerHTML = `<p class="nota" style="margin:0">Le scelte compaiono quando l'anteprima è pronta.</p>`; $("#contaCombinazioni").textContent = ""; return; }
    const sc = sceltaDi(t);
    box.innerHTML = st.gruppi.map(g => {
      const scelta = g.opzioni.find(o => o.id === sc.opzioni[g.id]);
      const conCont = scelta && haContenuti(scelta);
      return `<section class="riga-gruppo" data-gruppo="${esc(g.id)}"><h3>${esc(g.nome)}<span class="dx">${esc(scelta ? scelta.nome : "")}</span></h3>` +
        `<div class="opzioni" role="radiogroup" aria-label="${esc(g.nome)}" style="--colonne:${g.opzioni.length === 4 ? 2 : Math.min(3, g.opzioni.length)}">` +
        ordinate(g).map(o => `<button class="opz" role="radio" data-gruppo="${esc(g.id)}" data-opzione="${esc(o.id)}" aria-checked="${o.id === sc.opzioni[g.id]}" title="${esc(o.nome)}">` +
          `<span class="dett"><span class="pila"></span></span><b>${esc(o.nome)}</b></button>`).join("") + `</div>` +
        (conCont ? `<label class="spunta contenuto-spunta"><input type="checkbox" data-contenuto="${esc(g.id)}" ${sc.contenuti[g.id] === false ? "" : "checked"}><span>${esc(etichettaContenuto(scelta))}</span></label>` : "") +
        `</section>`;
    }).join("");
    const n = st.gruppi.reduce((x, g) => x * Math.max(1, g.opzioni.length), 1);
    $("#contaCombinazioni").textContent = n + " combinazioni";
    $$(".opz", box).forEach(b => {
      const g = st.gruppi.find(x => x.id === b.dataset.gruppo), o = g.opzioni.find(x => x.id === b.dataset.opzione);
      const pila = $(".pila", b), dett = $(".dett", b);
      creaPila(pila, st);
      const s2 = Object.assign({}, sc, { opzioni: Object.assign({}, sc.opzioni, { [g.id]: o.id }) });
      mostraPila(pila, st, s2);
      inquadra(pila, dett, st, rettOpzione(st, g, o), 1);
    });
  }
  function aggiornaGruppi() {                        // dopo un clic: solo stati e dettagli, senza ricostruire le immagini
    const t = tipoAttivo(), st = S.strutture[t.id];
    if (!st) return;
    const sc = sceltaDi(t);
    $$(".riga-gruppo").forEach(sez => {
      const g = st.gruppi.find(x => x.id === sez.dataset.gruppo);
      if (!g) return;
      const scelta = g.opzioni.find(o => o.id === sc.opzioni[g.id]);
      $("h3 .dx", sez).textContent = scelta ? scelta.nome : "";
      $$(".opz", sez).forEach(b => {
        const o = g.opzioni.find(x => x.id === b.dataset.opzione);
        b.setAttribute("aria-checked", String(o.id === sc.opzioni[g.id]));
        mostraPila($(".pila", b), st, Object.assign({}, sc, { opzioni: Object.assign({}, sc.opzioni, { [g.id]: o.id }) }));
      });
    });
  }
  $("#gruppi").addEventListener("click", e => {
    const b = e.target.closest(".opz");
    if (!b || S.inCorso) return;
    const t = tipoAttivo(), sc = S.scelte[t.id] || (S.scelte[t.id] = {});
    if (sc[b.dataset.gruppo] === b.dataset.opzione) return;
    sc[b.dataset.gruppo] = b.dataset.opzione; S.nomeManuale = null; salva();
    const prima = !!$(`.riga-gruppo[data-gruppo="${b.dataset.gruppo}"] [data-contenuto]`);
    const st = S.strutture[t.id], g = st && st.gruppi.find(x => x.id === b.dataset.gruppo), o = g && g.opzioni.find(x => x.id === b.dataset.opzione);
    if (o && prima !== haContenuti(o)) disegnaGruppi(); else aggiornaGruppi();
    disegnaAnteprima(); disegnaNome();
  });
  $("#gruppi").addEventListener("change", e => {
    const c = e.target.closest("[data-contenuto]");
    if (!c) return;
    const t = tipoAttivo(), co = S.contenuti[t.id] || (S.contenuti[t.id] = {});
    co[c.dataset.contenuto] = c.checked; S.nomeManuale = null; salva();
    aggiornaGruppi(); disegnaAnteprima(); disegnaNome();
  });

  function disegnaNome() {
    const t = tipoAttivo(), auto = nomeAutomatico(t, sceltaDi(t)), campo = $("#nomeFile");
    if (document.activeElement !== campo || S.nomeManuale === null) campo.value = S.nomeManuale !== null ? S.nomeManuale : auto;
    campo.classList.toggle("manuale", S.nomeManuale !== null);
    $("#bNomeAuto").hidden = S.nomeManuale === null;
    campo.title = campo.value;
  }
  $("#nomeFile").addEventListener("input", e => {
    const t = tipoAttivo(), v = e.target.value;
    S.nomeManuale = v.trim() && v.trim() !== nomeAutomatico(t, sceltaDi(t)) ? v : null;
    $("#bNomeAuto").hidden = S.nomeManuale === null;
    e.target.classList.toggle("manuale", S.nomeManuale !== null);
  });
  $("#bNomeAuto").addEventListener("click", () => { S.nomeManuale = null; disegnaNome(); });

  // ------------------------------------------------------------------ uscita
  function mostraVia(el, p) {
    if (!p) { el.className = "via vuota"; el.textContent = "Nessuna cartella scelta"; el.title = ""; return; }
    const parti = String(p).split(/[\\/]/).filter(Boolean);
    el.className = "via"; el.title = p;
    el.innerHTML = `<b>${esc(parti[parti.length - 1] || p)}</b><span class="sopra">${esc(parti.slice(0, -1).join(" › ") || "")}</span>`;
  }
  function cfgExport() {
    const c = P.dalPreset("scontornata");
    Object.assign(c.export, { psd: !!S.export.psd, jpg: !!S.export.jpg, png: !!S.export.png, webp: !!S.export.webp, struttura: S.export.struttura });
    if (S.tela === "1000") c.tela = { larghezza: 1000, altezza: 1000, dpi: 72 };
    return c;
  }
  function disegnaUscita() {
    mostraVia($("#viaUscita"), S.uscita);
    $$("#chipFormati input").forEach(i => { i.checked = !!S.export[i.dataset.k]; });
    $$("#sceltaTela button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === S.tela)));
    $$("#sceltaStruttura button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === S.export.struttura)));
    const formati = ["psd", "jpg", "png", "webp"].filter(k => S.export[k]).map(k => k === "webp" ? "WebP" : k.toUpperCase());
    $("#rUscite").textContent = (S.tela === "1000" ? "1000 × 1000" : "5120 × 5120") + ", " + { FORMATO: "per formato", PER_PRODOTTO: "per armadio", UNICA: "tutti insieme" }[S.export.struttura];
    const t = tipoAttivo(), nome = S.nomeManuale || nomeAutomatico(t, sceltaDi(t));
    const P2 = D.percorsiUscita(cfgExport().export, S.uscita || "…", D.nomeSicuro(nome));
    const primo = D.tuttiIPercorsi(P2)[0];
    $("#esempioUscita").textContent = primo ? "Esempio: " + D.relativo(S.uscita || "…", primo) : "";
    if (!formati.length) $("#esempioUscita").textContent = "Scegli almeno un formato.";
  }
  $("#bUscita").addEventListener("click", () => {
    const c = Ponte.scegliCartella("Dove salvare le immagini degli armadi", S.uscita);
    if (c) { S.uscita = c; salva(); disegnaUscita(); }
  });
  $("#bApriUscita").addEventListener("click", () => { if (S.uscita) { D.creaCartella(S.uscita); D.mostra(S.uscita); } });
  $("#chipFormati").addEventListener("change", e => { const i = e.target.closest("input[data-k]"); if (!i) return; S.export[i.dataset.k] = i.checked; salva(); disegnaUscita(); aggiornaPulsanti(); });
  $("#sceltaTela").addEventListener("click", e => { const b = e.target.closest("button[data-v]"); if (!b) return; S.tela = b.dataset.v; salva(); disegnaUscita(); });
  $("#sceltaStruttura").addEventListener("click", e => { const b = e.target.closest("button[data-v]"); if (!b) return; S.export.struttura = b.dataset.v; salva(); disegnaUscita(); });

  function disegnaTutto() {
    disegnaAnteprima(); disegnaGruppi(); disegnaNome(); disegnaUscita(); aggiornaPulsanti();
  }
  let ritardo = null;
  window.addEventListener("resize", () => { clearTimeout(ritardo); ritardo = setTimeout(() => { disegnaAnteprima(); disegnaGruppi(); }, 120); });

  // ------------------------------------------------------------------ preparazione dei tipi: struttura e anteprime
  function mostraAttesa(testo, frazione) {
    const a = $("#attesa");
    if (testo === null) { a.hidden = true; return; }
    a.hidden = false;
    $("#attesaTesto").textContent = testo;
    $("#attesaBarra").style.width = Math.round((frazione || 0) * 100) + "%";
  }
  Ponte.ascolta("com.borin.configuratore.fase", d => {
    if (!d) return;
    if (d.fase === "anteprima" && S.preparo && d.dati) {
      const t = S.preparo;
      if (t.id === S.tipo) mostraAttesa("Preparo l'anteprima del " + t.nome.toLowerCase() + ": " + d.dati.pezzo + " di " + d.dati.di + " pezzi. Solo la prima volta.", d.dati.pezzo / d.dati.di);
    }
    if (S.inCorso && d.fase === "livelli") $("#avFase").textContent = "accendo i livelli del PSD…";
  });
  const inVolo = {};
  function preparaTipo(t, forza) {                  // una sola preparazione per tipo alla volta
    if (!inVolo[t.id]) inVolo[t.id] = preparaTipoOra(t, forza).finally(() => { delete inVolo[t.id]; });
    return inVolo[t.id];
  }
  async function preparaTipoOra(t, forza) {
    const psd = percorsoPSD(t);
    if (!D.esiste(psd)) { delete S.strutture[t.id]; return null; }
    const chiave = D.chiaveAnteprime(psd, ANTEPRIME_V), cartella = D.cartellaAnteprime(t.id, chiave), fileSt = D.unisci(cartella, "struttura.json");
    let st = forza ? null : D.leggiJSON(fileSt, null);
    if (st && st.anteprime && st.anteprime.pezzi.every(p => D.esiste(D.unisci(cartella, p.file)))) {
      st.cartella = cartella; st.tipo = t.id; S.strutture[t.id] = st;
      return st;
    }
    if (!S.collegato) throw new Error("Per preparare l'anteprima serve Photoshop collegato.");
    S.preparo = t;
    if (t.id === S.tipo) { mostraVuoto(""); mostraAttesa("Apro il PSD del " + t.nome.toLowerCase() + "…", 0.02); }
    try {
      if (forza) D.elimina(cartella);
      st = await Ponte.chiama("anteprime", { psd, cartella, altezza: ALTEZZA_ANTEPRIME });
      st.cartella = cartella; st.tipo = t.id; st.psd = psd; st.chiave = chiave; st.data = Date.now();
      D.scriviJSON(fileSt, st);
      D.pulisciAnteprime(t.id, cartella);
      S.strutture[t.id] = st;
      return st;
    } finally {
      S.preparo = null;
      if (t.id === S.tipo) mostraAttesa(null);
    }
  }
  async function preparaTutti(forza) {
    const ordine = [tipoAttivo()].concat(S.tipi.filter(t => t.id !== S.tipo));
    for (const t of ordine) {
      try { await preparaTipo(t, forza); }
      catch (e) { S.avvisi = S.avvisi.filter(a => a.tipo !== t.id); S.avvisi.push({ tipo: t.id, livello: "errore", testo: "Anteprima non preparata: " + e.message, dove: t.psd }); }
      if (t.id === S.tipo) { pilaDi = null; disegnaTutto(); }
    }
    controllaLivelli();
    pilaDi = null; disegnaTutto(); disegnaProgetti();
  }

  // ------------------------------------------------------------------ controllo dei livelli tra i tre PSD
  function controllaLivelli() {
    const lista = [], nascondi = {};
    const pronti = S.tipi.filter(t => S.strutture[t.id]);
    for (const t of pronti) {
      for (const a of S.strutture[t.id].avvisi || []) {
        if (/non è né «Scomparto» né «Contenuto/.test(a.testo)) continue;      // detti meglio sotto
        lista.push({ tipo: t.id, livello: a.livello, testo: a.testo, dove: a.dove });
      }
    }
    // opzioni di ogni gruppo, in tutti i PSD: per riconoscere un livello finito nel gruppo sbagliato
    const opzioniDi = {}, nomiGruppo = {};
    for (const t of pronti) for (const g of S.strutture[t.id].gruppi) {
      nomiGruppo[g.id] = g.nome;
      const mappa = opzioniDi[g.id] = opzioniDi[g.id] || {};
      for (const o of g.opzioni) { const k = sigla(o.nomeFile); (mappa[k] = mappa[k] || []).push({ tipo: t.id, nome: o.nomeFile, mostra: o.nome }); }
    }
    for (const t of pronti) {
      const st = S.strutture[t.id], fuori = {};
      nascondi[t.id] = [];
      for (const g of st.gruppi) for (const o of g.opzioni) for (const p of o.parti || []) {
        if (p.ruolo !== "altro") continue;
        const k = sigla(p.nome);
        let trovato = null;
        for (const gid of Object.keys(opzioniDi)) {
          if (gid === g.id) continue;
          for (const ok of Object.keys(opzioniDi[gid])) if (simile(k, ok)) { trovato = { gid, nome: opzioniDi[gid][ok][0].nome, esatto: k === ok }; break; }
          if (trovato) break;
        }
        if (!trovato) {
          lista.push({ tipo: t.id, livello: "info", testo: `«${pulito(p.nome)}» dentro «${o.nomeFile}» non è né «Scomparto» né «Contenuto · …»: resta ${p.accesaNelFile ? "acceso" : "spento"} come nel file.`, dove: g.nomeFile });
          continue;
        }
        nascondi[t.id].push(p.percorso);
        const chiave = g.id + ">" + o.id + ">" + trovato.gid;
        (fuori[chiave] = fuori[chiave] || { g, o, gid: trovato.gid, nomi: [], rinomina: [] }).nomi.push(pulito(p.nome));
        if (!trovato.esatto) fuori[chiave].rinomina.push(`«${pulito(p.nome)}» negli altri si chiama «${pulito(trovato.nome)}»`);
      }
      for (const f of Object.values(fuori)) {
        const nomi = f.nomi.map(n => "«" + n + "»"), elenco = nomi.length > 1 ? nomi.slice(0, -1).join(", ") + " e " + nomi[nomi.length - 1] : nomi[0];
        const gruppoNum = (pronti.map(x => S.strutture[x.id].gruppi.find(g2 => g2.id === f.gid)).find(Boolean) || {}).nomeFile || ("EXTRA · " + nomiGruppo[f.gid]);
        lista.push({ tipo: t.id, livello: "avviso", primo: true, dove: f.g.nomeFile + " › " + f.o.nomeFile,
          testo: `${elenco} ${nomi.length > 1 ? "sono" : "è"} dentro «${f.o.nomeFile}», ma negli altri armadi ${nomi.length > 1 ? "sono opzioni" : "è un'opzione"} di «${nomiGruppo[f.gid]}». Vanno in un gruppo «${gruppoNum}» al primo livello` +
            (f.rinomina.length ? ` (${f.rinomina.join("; ")})` : "") + ". Intanto il pannello li tiene spenti." });
      }
    }
    // gruppi e opzioni scritti in modo diverso da un PSD all'altro
    for (const gid of Object.keys(opzioniDi)) {
      for (const ok of Object.keys(opzioniDi[gid])) {
        const v = opzioniDi[gid][ok], forme = Array.from(new Set(v.map(x => x.nome)));
        if (forme.length > 1 && new Set(forme.map(pulito)).size > 1)
          lista.push({ tipo: "", livello: "avviso", dove: nomiGruppo[gid], testo: `«${v[0].mostra}» è scritto in modi diversi: ` + v.map(x => `«${visibili(x.nome)}» (${x.tipo})`).join(", ") + ". Il pannello li tratta come lo stesso nome; meglio scriverlo uguale in tutti." });
      }
      const conGruppo = pronti.filter(t => S.strutture[t.id].gruppi.some(g => g.id === gid));
      for (const t of pronti) if (!conGruppo.includes(t))
        lista.push({ tipo: t.id, livello: "info", dove: "primo livello", testo: `Il ${t.nome.toLowerCase()} non ha il gruppo «${nomiGruppo[gid]}», che c'è nel ${conGruppo.map(x => x.nome.toLowerCase()).join(" e nel ")}.` });
    }
    for (const a of lista) a.testo = a.testo.replace(/«([^»]*)»/g, (m, x) => "«" + visibili(x) + "»");   // spazi in più, in vista
    S.avvisi = lista.concat(S.avvisi.filter(a => /^Anteprima non preparata/.test(a.testo)));
    S.nascondi = nascondi;
    disegnaLivelli();
    notificaLivelli();
  }
  const PESO = { errore: 0, avviso: 1, info: 2 };
  const perPeso = (a, b) => PESO[a.livello] - PESO[b.livello] || (b.primo ? 1 : 0) - (a.primo ? 1 : 0);
  function disegnaLivelli() {
    const box = $("#elencoLivelli"), seri = S.avvisi.filter(a => a.livello !== "info");
    $("#contaLivelli").textContent = S.avvisi.length ? seri.length + (seri.length === 1 ? " da sistemare" : " da sistemare") + (S.avvisi.length > seri.length ? ", " + (S.avvisi.length - seri.length) + " note" : "") : "tutto a posto";
    $("#segnaleInfo").hidden = !seri.length;
    $("#segnaleInfo").textContent = seri.length;
    if (!S.avvisi.length) { box.innerHTML = `<p class="nota" style="margin:0">${Object.keys(S.strutture).length ? "Nomi e posizioni dei livelli a posto nei PSD letti." : "I PSD non sono ancora stati letti."}</p>`; return; }
    const perTipo = {};
    for (const a of S.avvisi) (perTipo[a.tipo] = perTipo[a.tipo] || []).push(a);
    const testa = id => { const t = S.tipi.find(x => x.id === id); return t ? t.psd : "Tra i PSD"; };
    box.innerHTML = `<div class="livelli">` + Object.keys(perTipo).sort((a, b) => (a ? 0 : 1) - (b ? 0 : 1)).map(id =>
      `<h3>${esc(testa(id))}</h3><ul class="livelli">` + perTipo[id].sort(perPeso).map(a =>
        `<li><span class="liv liv-${a.livello}">${{ errore: "Errore", avviso: "Da sistemare", info: "Nota" }[a.livello]}</span><span>${esc(a.testo)}<span class="dove">${esc(a.dove || "")}</span></span></li>`).join("") + `</ul>`).join("") + `</div>`;
  }
  function notificaLivelli() {
    setTimeout(disegnaAnteprima, 0);
    const seri = S.avvisi.filter(a => a.livello !== "info").sort(perPeso), box = $("#notificaLivelli");
    if (!seri.length) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = `<b>${seri.length} ${seri.length === 1 ? "cosa da sistemare" : "cose da sistemare"} nei livelli dei PSD.</b> ` +
      esc(seri[0].testo.length > 150 ? seri[0].testo.slice(0, 147) + "…" : seri[0].testo) +
      ` <button class="pulsante leggero" id="bVediLivelli" style="padding:0 2px">Vedi tutto in Info</button>`;
    $("#bVediLivelli").onclick = () => vaiScheda("info", "#bloccoLivelli");
    const firma = seri.map(a => a.tipo + a.testo).join("|");
    if (firma !== S.avvisiNotificati) {                // notifica di sistema una volta per ogni nuovo elenco
      S.avvisiNotificati = firma; salva();
      D.avvisoSistema("BORIN Configuratore", seri.length + (seri.length === 1 ? " cosa da sistemare" : " cose da sistemare") + " nei livelli dei PSD: apri Info › Controllo dei livelli.");
    }
  }

  // ------------------------------------------------------------------ progetti PSD: GitHub o cartella mia
  function mb(byte) { return (byte / 1048576).toLocaleString("it-IT", { maximumFractionDigits: byte > 1e7 ? 0 : 1 }) + " MB"; }
  function disegnaProgetti() {
    $$("#sceltaSorgente button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === S.psd.sorgente)));
    const mia = S.psd.sorgente === "CARTELLA";
    $("#notaSorgente").textContent = mia
      ? "Il pannello usa i PSD di questa cartella: le modifiche si vedono subito (le anteprime si rifanno da sole quando salvi il PSD)."
      : "Il pannello scarica i PSD da GitHub e li aggiorna quando ne esce una versione nuova.";
    mostraVia($("#viaPSD"), cartellaPSD());
    $("#bCartellaPSD").hidden = !mia;
    $("#tabellaPSD").innerHTML = `<tr><th>Tipo</th><th>File</th><th>Peso</th><th>Anteprima</th></tr>` + S.tipi.map(t => {
      const s = D.stato(percorsoPSD(t)), st = S.strutture[t.id];
      return `<tr><td>${esc(t.nome)}</td><td>${s ? esc(t.psd) : `<span style="color:var(--errore)">manca</span>`}</td><td>${s ? mb(s.byte) : "—"}</td>` +
        `<td>${st ? "pronta" : S.preparo === t ? "in corso…" : "—"}</td></tr>`;
    }).join("");
  }
  $("#sceltaSorgente").addEventListener("click", async e => {
    const b = e.target.closest("button[data-v]");
    if (!b || S.inCorso || b.dataset.v === S.psd.sorgente) return;
    if (b.dataset.v === "CARTELLA" && !S.psd.cartella) {
      const c = Ponte.scegliCartella("Cartella con i PSD degli armadi", "");
      if (!c) return;
      S.psd.cartella = c;
    }
    S.psd.sorgente = b.dataset.v; salva();
    await ricominciaProgetti();
  });
  $("#bCartellaPSD").addEventListener("click", async () => {
    const c = Ponte.scegliCartella("Cartella con i PSD degli armadi", S.psd.cartella);
    if (!c) return;
    S.psd.cartella = c; S.psd.sorgente = "CARTELLA"; salva();
    await ricominciaProgetti();
  });
  $("#bApriPSD").addEventListener("click", () => { D.creaCartella(cartellaPSD()); D.mostra(cartellaPSD()); });
  $("#bRileggi").addEventListener("click", async () => {
    if (S.inCorso || S.preparo) return;
    S.strutture = {}; pilaDi = null; disegnaTutto();
    await preparaTutti(true);
  });
  async function vediInPhotoshop() {
    const t = tipoAttivo();
    if (!D.esiste(percorsoPSD(t))) return;
    try { await Ponte.chiama("mostraInPhotoshop", { psd: percorsoPSD(t), scelta: sceltaDi(t) }); }
    catch (e) { mostraErrore("PSD non aperto: " + e.message); }
  }
  $("#bMostraPS").addEventListener("click", vediInPhotoshop);
  $("#bVediPS").addEventListener("click", e => { e.stopPropagation(); vediInPhotoshop(); });
  async function ricominciaProgetti() {
    S.strutture = {}; S.avvisi = []; pilaDi = null;
    disegnaProgetti(); disegnaTutto(); disegnaLivelli();
    await avvioProgetti();
  }

  function mostraStatoProgetti(html, tipo) {
    const box = $("#statoProgetti");
    if (!html) { box.hidden = true; box.innerHTML = ""; }
    else { box.className = tipo || "ok-box"; box.innerHTML = html; box.hidden = false; }
    setTimeout(disegnaAnteprima, 0);
  }
  // All'apertura: con GitHub cerca la versione nuova e scarica i PSD che mancano o sono cambiati; poi le anteprime.
  async function avvioProgetti() {
    if (S.psd.sorgente !== "CARTELLA" && A && Ponte.estensione) {
      const cartella = cartellaPSD(), mancano = S.tipi.filter(t => !D.esiste(percorsoPSD(t)));
      let trovato = null, errore = null;
      try { trovato = await A.cerca(Ponte.estensione); S.ultimoControllo = Date.now(); salva(); }
      catch (e) { errore = e; }
      if (trovato) {
        mostraStatoAggiornamenti(trovato);
        if (trovato.nuova) mostraNovita(trovato);
        const da = A.progettiDaScaricare(trovato.progetti || [], cartella);
        if (da.length) {
          const totale = da.reduce((s, p) => s + (p.byte || 0), 0);
          mostraStatoProgetti(`<b>${mancano.length ? "Scarico i progetti degli armadi" : "Ci sono PSD nuovi: li scarico"}</b> · <span id="spTesto">0 di ${mb(totale)}</span><div class="barra"><i id="spBarra"></i></div>`);
          try {
            await A.scaricaProgetti(da, cartella, D.cartellaTemp("psd-" + Date.now()), (r, tot, nome) => {
              const el = $("#spTesto"), bar = $("#spBarra");
              if (el) el.textContent = nome + " · " + mb(r) + " di " + mb(tot || totale);
              if (bar) bar.style.width = Math.round(100 * r / Math.max(1, tot || totale)) + "%";
            });
            mostraStatoProgetti(null);
          } catch (e) {
            mostraStatoProgetti(`<b>PSD non scaricati.</b> ${esc(e.message)} <button class="pulsante leggero" id="bRiprovaPSD" style="padding:0 2px">Riprova</button>`, "errore-box");
            $("#bRiprovaPSD").onclick = ricominciaProgetti;
          }
        } else if (!(trovato.progetti || []).length && mancano.length) {
          mostraStatoProgetti(`<b>Su GitHub non ci sono ancora i PSD.</b> Scegli una cartella con i PSD in Info › Progetti PSD.`, "avviso");
        }
      } else if (mancano.length) {
        mostraStatoProgetti(`<b>Mancano i progetti PSD.</b> Servono internet la prima volta, per scaricarli da GitHub (${esc(errore ? errore.message : "")}), oppure una cartella con i PSD: Info › Progetti PSD. <button class="pulsante leggero" id="bRiprovaPSD" style="padding:0 2px">Riprova</button>`, "avviso");
        $("#bRiprovaPSD").onclick = ricominciaProgetti;
      }
    } else if (S.psd.sorgente === "CARTELLA") {
      const mancano = S.tipi.filter(t => !D.esiste(percorsoPSD(t)));
      mostraStatoProgetti(mancano.length ? `<b>Nella cartella dei PSD mancano:</b> ${esc(mancano.map(t => t.psd).join(", "))}. Cambiala in Info › Progetti PSD.` : null, "avviso");
    }
    disegnaProgetti();
    await preparaTutti(false);
  }

  // ------------------------------------------------------------------ Photoshop
  async function collega() {
    const box = $("#statoPs");
    try {
      await Ponte.caricaMotore(false);
      S.info = await Ponte.chiama("info", {});
      S.collegato = true;
      box.className = "statoPs vivo";
      $("span", box).textContent = "Photoshop " + String(S.info.photoshop || "").split(".").slice(0, 2).join(".");
      box.title = "Motore " + S.info.motore + " · motore BORIN Batch " + (S.info.batch || "non caricato");
    } catch (e) {
      S.collegato = false;
      box.className = "statoPs morto";
      $("span", box).textContent = "Photoshop non risponde";
      box.title = e.message;
    }
    aggiornaPulsanti();
  }

  // ------------------------------------------------------------------ export: una o tutte le combinazioni
  const FASI = {
    apertura: "copia della composizione", analisi: "analisi della trasparenza", sagoma: "sagoma per l'ombra", residui: "pulizia dei bordi",
    composizione: "tela e posizione al 60 %", ombra: "ombra BORIN", colore: "livelli colore BORIN", salvataggio: "salvo il PSD", export: "JPG, PNG e WebP"
  };
  Ponte.ascolta("com.borin.batch.fase", d => { if (S.inCorso && d && FASI[d.fase]) $("#avFase").textContent = FASI[d.fase] + "…"; });
  function combinazioni(st) {
    let out = [{}];
    for (const g of st.gruppi) {
      const nuove = [];
      for (const c of out) for (const o of ordinate(g)) nuove.push(Object.assign({}, c, { [g.id]: o.id }));
      out = nuove;
    }
    return out;
  }
  function pronto() {
    const t = tipoAttivo();
    return S.collegato && !!S.strutture[t.id] && !S.preparo && ["psd", "jpg", "png", "webp"].some(k => S.export[k]) && !!S.uscita;
  }
  function aggiornaPulsanti() {
    const t = tipoAttivo(), st = S.strutture[t.id], ok = pronto() && !S.inCorso;
    $("#bCrea").disabled = !ok;
    $("#bTutte").disabled = !ok;
    const n = st ? combinazioni(st).length : 0;
    $("#bTutte").textContent = n ? "Tutte le " + n : "Tutte le combinazioni";
    $("#bTutte").title = n ? "Crea in fila le " + n + " combinazioni del " + t.nome.toLowerCase() : "";
  }
  function durata(ms) {
    const s = Math.max(0, Math.round(ms / 1000)), m = Math.floor(s / 60), h = Math.floor(m / 60);
    return h ? h + " h " + (m % 60) + " min" : m ? m + " min " + (s % 60) + " s" : s + " s";
  }
  function modoCorsa(sì) {
    S.inCorso = sì;
    $("#avanzamento").hidden = !sì;
    $("#pulsanti").hidden = sì;
    $("#pulsantiCorsa").hidden = !sì;
    $("#bFerma").disabled = false;
    $("#bFerma").textContent = "Ferma dopo questa";
    document.body.classList.toggle("in-corso", sì);
    aggiornaPulsanti();
  }
  $("#bFerma").addEventListener("click", () => { S.ferma = true; $("#bFerma").disabled = true; $("#bFerma").textContent = "Mi fermo dopo questa…"; });

  async function esegui(lavori) {
    if (S.inCorso || !lavori.length) return;
    modoCorsa(true); S.ferma = false;
    Ponte.restaAttivo();
    $("#bloccoEsito").hidden = true;
    const cfg = cfgExport(), temp = D.cartellaTemp("esito-" + Date.now()), t0 = Date.now(), esiti = [];
    try {
      for (let i = 0; i < lavori.length; i++) {
        if (S.ferma) break;
        const L = lavori[i], nome = D.nomeSicuro(L.nome), uscite = D.percorsiUscita(cfg.export, S.uscita, nome);
        $("#avTesto").textContent = (lavori.length > 1 ? (i + 1) + " di " + lavori.length + " · " : "") + nome;
        $("#avBarra").style.width = Math.round(100 * i / lavori.length) + "%";
        const passato = Date.now() - t0;
        $("#avTempo").textContent = i ? "manca circa " + durata(passato / i * (lavori.length - i)) : "";
        $("#avFase").textContent = "apro il PSD…";
        D.tuttiIPercorsi(uscite).forEach(p => D.creaCartella(D.cartellaDi(p)));
        const ultimo = i === lavori.length - 1;
        try {
          const r = await Ponte.chiama("esporta", { psd: percorsoPSD(L.t), scelta: L.scelta, cfg, uscite, nome,
            anteprimaDopo: D.unisci(temp, "dopo-" + i + ".png"), latoAnteprima: 640, tieniAperto: !ultimo });
          esiti.push({ nome, ok: !!(r && r.ok), r, uscite });
        } catch (e) { esiti.push({ nome, ok: false, r: { errore: e.message }, uscite }); }
      }
    } finally {
      try { await Ponte.chiama("chiudiTutti", {}); } catch (e) {}
      $("#avBarra").style.width = "100%";
      modoCorsa(false);
    }
    mostraEsito(esiti, lavori.length, Date.now() - t0);
    if (lavori.length > 1) D.avvisoSistema("BORIN Configuratore", esiti.filter(x => x.ok).length + " di " + lavori.length + " immagini pronte.");
  }
  function mostraEsito(esiti, totale, ms) {
    const box = $("#bloccoEsito"), ok = esiti.filter(x => x.ok), ko = esiti.filter(x => !x.ok), fermato = esiti.length < totale;
    box.hidden = false;
    $("#esitoTitolo").textContent = !ko.length ? (fermato ? "Fermato" : "Fatto") : ok.length ? "Fatto, con errori" : "Non riuscito";
    $("#esitoDurata").textContent = durata(ms);
    const ultimo = esiti.slice().reverse().find(x => x.ok && x.r.anteprimaDopo);
    $("#esitoImg").innerHTML = ultimo ? `<img src="${D.urlFile(ultimo.r.anteprimaDopo)}?${Date.now()}" alt="Risultato">` : "";
    const formati = r => (r.uscite || []).map(u => u.formato === "WEBP" ? "WebP" : u.formato).join(", ");
    let html = "";
    if (totale === 1 && esiti[0]) {
      const e = esiti[0];
      html = e.ok ? `<b>${esc(e.nome)}</b><br>${esc(formati(e.r))} in ${esc(D.nomeDi(S.uscita))}.` : `<b>${esc(e.nome)}</b><br><span style="color:var(--errore)">${esc(e.r.errore || "errore")}</span>`;
      const av = (e.r && e.r.avvisi) || [];
      if (av.length) html += `<ul>${av.map(a => `<li>${esc(a)}</li>`).join("")}</ul>`;
    } else {
      html = `<b>${ok.length} di ${totale}</b> immagini salvate in ${esc(D.nomeDi(S.uscita))}` + (fermato ? ` (fermato dopo ${esiti.length})` : "") + ".";
      if (ko.length) html += `<ul>${ko.slice(0, 8).map(e => `<li>${esc(e.nome)}: ${esc(e.r.errore || "errore")}</li>`).join("")}</ul>`;
    }
    $("#esitoTesto").innerHTML = html;
    const primo = ok[0] && D.tuttiIPercorsi(ok[0].uscite).find(p => D.esiste(p));
    $("#bEsitoFile").hidden = totale !== 1 || !primo;
    $("#bEsitoFile").onclick = () => primo && D.mostra(primo, true);
    $("#bEsitoCartella").onclick = () => D.mostra(S.uscita);
    const img = $("#esitoImg img");
    if (img) img.onclick = () => apriLente(null, img.src);
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  $("#bCrea").addEventListener("click", () => {
    const t = tipoAttivo(), scelta = sceltaDi(t);
    esegui([{ t, scelta, nome: S.nomeManuale || nomeAutomatico(t, scelta) }]);
  });
  $("#bTutte").addEventListener("click", () => {
    const t = tipoAttivo(), st = S.strutture[t.id];
    if (!st) return;
    const base = sceltaDi(t);
    esegui(combinazioni(st).map(op => { const scelta = Object.assign({}, base, { opzioni: op }); return { t, scelta, nome: nomeAutomatico(t, scelta) }; }));
  });

  // ------------------------------------------------------------------ lente
  function apriLente(e, src) {
    const lente = $("#lente"), pila = $("#pilaLente");
    lente.hidden = false;
    if (src) { pila.style.cssText = "position:absolute;inset:3%;"; pila.innerHTML = `<img src="${esc(src)}" alt="" style="object-fit:contain">`; return; }
    const t = tipoAttivo(), st = S.strutture[t.id];
    if (!st) { lente.hidden = true; return; }
    pila.style.cssText = ""; creaPila(pila, st); mostraPila(pila, st, sceltaDi(t));
    inquadra(pila, lente, st, allarga(cornice(st), 0.03, st), 1);
  }
  $("#piatto").addEventListener("click", e => apriLente(e));
  $("#lente").addEventListener("click", () => { $("#lente").hidden = true; $("#pilaLente").innerHTML = ""; });
  window.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#lente").hidden) $("#lente").click(); });

  // ------------------------------------------------------------------ aggiornamenti del pannello
  function mostraStatoAggiornamenti(t) {
    const st = $("#statoAggiornamenti"), cfg = A.leggiConfig(Ponte.estensione);
    if (t.nuova) st.textContent = "È disponibile la versione " + t.versione + ": hai la " + t.attuale + ".";
    else st.textContent = "Hai l'ultima versione (" + t.attuale + "). Controllato adesso su github.com/" + cfg.repo + ".";
  }
  async function controllaAggiornamenti() {
    const st = $("#statoAggiornamenti");
    if (!A || !Ponte.estensione) { st.textContent = "Aggiornamenti non disponibili qui."; return; }
    const cfg = A.leggiConfig(Ponte.estensione), attuale = A.versioneInstallata(Ponte.estensione);
    if (!cfg.repo) { st.textContent = "Versione " + attuale + ". Aggiornamenti non collegati a GitHub."; return; }
    st.textContent = "Cerco aggiornamenti…";
    try {
      const t = await A.cerca(Ponte.estensione);
      S.ultimoControllo = Date.now(); salva();
      if (A.eSviluppo(Ponte.estensione)) { st.textContent = "Versione " + attuale + " di sviluppo (su GitHub c'è la " + (t.versione || "—") + "): si aggiorna con git."; return; }
      mostraStatoAggiornamenti(t);
      if (t.nuova) mostraNovita(t);
      if (S.psd.sorgente !== "CARTELLA" && A.progettiDaScaricare(t.progetti || [], cartellaPSD()).length) await ricominciaProgetti();
    } catch (e) { st.textContent = "Controllo non riuscito: " + e.message + "."; }
  }
  function mostraNovita(t) {
    if (A.eSviluppo(Ponte.estensione)) return;
    const box = $("#novita");
    box.className = "ok-box";
    box.innerHTML = `<b>È uscita BORIN Configuratore ${esc(t.versione)}</b> (hai la ${esc(t.attuale)}).` +
      (t.novita ? `<details class="dettagli"><summary>Che cosa cambia</summary><div style="white-space:pre-wrap">${esc(t.novita)}</div></details>` : "") +
      `<div class="riga" style="margin-bottom:0"><button class="pulsante primario" id="bAggiorna">Aggiorna adesso</button>` +
      `<button class="pulsante leggero" id="bDopo">Più tardi</button></div><p class="nota piccola" id="statoAggiorna"></p>`;
    box.hidden = false;
    $("#bDopo").onclick = () => { box.hidden = true; };
    $("#bAggiorna").onclick = async () => {
      if (S.inCorso) { $("#statoAggiorna").textContent = "Aspetta la fine delle immagini in corso."; return; }
      $("#bAggiorna").disabled = true;
      try {
        const v = await A.installa(Ponte.estensione, t, D.cartellaTemp("aggiornamento-" + Date.now()), x => { $("#statoAggiorna").textContent = x; });
        box.innerHTML = `<b>Aggiornato alla versione ${esc(v)}.</b> Chiudi e riapri il pannello (Finestra › Estensioni (precedenti) › BORIN Configuratore) per usarla.`;
        $("#statoAggiornamenti").textContent = "Installata la versione " + v + ": chiudi e riapri il pannello.";
      } catch (e) {
        $("#statoAggiorna").textContent = e.message;
        $("#bAggiorna").disabled = false;
      }
    };
  }
  $("#bCercaAggiornamenti").addEventListener("click", controllaAggiornamenti);

  // ------------------------------------------------------------------ info: aspetto e diagnostica
  $("#sceltaTema").addEventListener("click", e => { const b = e.target.closest("button[data-v]"); if (!b) return; S.aspetto.tema = b.dataset.v; applicaAspetto(); salva(); });
  function gothamCaricato() { try { return document.fonts.check("500 12px 'Gotham BORIN'"); } catch (e) { return false; } }
  function righeDiagnostica() {
    const i = S.info || {}, sis = D.sistema ? D.sistema() : {};
    return [
      ["Pannello", VERSIONE], ["Motore armadi", i.motore || "—"], ["Motore BORIN Batch", i.batch || "non caricato"],
      ["Photoshop", i.photoshop || "non collegato"], ["Sistema", (i.sistema || sis.piattaforma || "") + (sis.memoriaGB ? " · " + sis.memoriaGB + " GB" : "")],
      ["Progetti PSD", (S.psd.sorgente === "CARTELLA" ? "cartella mia: " : "da GitHub: ") + cartellaPSD()],
      ["Dati del pannello", D.cartellaDati()],
      ["Aggiornamenti da", (A && Ponte.estensione && A.leggiConfig(Ponte.estensione).repo) || "non collegati"],
      ["Carattere Gotham", gothamCaricato() ? "caricato" : "non caricato (si usa il sostituto)"]
    ];
  }
  function disegnaDiagnostica() { $("#diagnostica").innerHTML = righeDiagnostica().map(([k, v]) => `<tr><th>${esc(k)}</th><td style="overflow-wrap:anywhere">${esc(v)}</td></tr>`).join(""); }
  $("#bCopiaDiagnostica").addEventListener("click", () => {
    const t = righeDiagnostica().map(([k, v]) => k + ": " + v).concat(S.avvisi.map(a => "Livelli [" + (a.tipo || "tutti") + "] " + a.testo)).join("\n");
    const ta = document.createElement("textarea");
    ta.value = t; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); $("#bCopiaDiagnostica").textContent = "Copiata"; setTimeout(() => { $("#bCopiaDiagnostica").textContent = "Copia per l'assistenza"; }, 1600); } catch (e) {}
    ta.remove();
  });
  $("#bRicarica").addEventListener("click", async () => { if (Ponte.inPhotoshop) await Ponte.caricaMotore(true); await collega(); disegnaDiagnostica(); });
  $("#bCartellaDati").addEventListener("click", () => D.mostra(D.cartellaDati()));

  // ------------------------------------------------------------------ schede
  function vaiScheda(nome, blocco) {
    $$(".schede button").forEach(x => x.setAttribute("aria-selected", String(x.dataset.scheda === nome)));
    $$(".scheda").forEach(s => s.classList.toggle("attiva", s.id === "s-" + nome));
    $("#contenuto").scrollTop = 0;
    if (nome === "info") { disegnaDiagnostica(); disegnaProgetti(); disegnaLivelli(); }
    if (nome === "armadio") { disegnaAnteprima(); disegnaGruppi(); }
    if (blocco) { const b = $(blocco); if (b) b.scrollIntoView({ block: "start" }); }
  }
  $$(".schede button").forEach(b => b.addEventListener("click", () => vaiScheda(b.dataset.scheda)));

  // ------------------------------------------------------------------ avvio
  D.elimina(D.unisci(D.cartellaDati(), "apri-pannello.richiesto"));      // il segnale di js/avvio.js è arrivato
  carica();
  applicaAspetto();
  disegnaTipi();
  disegnaTutto();
  disegnaProgetti();
  collega().then(async () => {
    if (window.BORIN_SCHEDA) vaiScheda(window.BORIN_SCHEDA);
    await avvioProgetti();
    if (window.BORIN_SCHEDA) vaiScheda(window.BORIN_SCHEDA, window.BORIN_BLOCCO);
    if (window.BORIN_AZIONE === "crea") $("#bCrea").click();
  });
  window.BORIN_PANNELLO = { S, esegui, preparaTutti, controllaLivelli, nomeAutomatico, sceltaDi, combinazioni, tipoAttivo, vaiScheda };
})();
