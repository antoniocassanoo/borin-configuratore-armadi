// Parla con il pannello aperto in Photoshop (porta di debug 8089, file .debug dell'estensione).
// Uso: node test/cdp.js eval "<espressione JS>"   ·   node test/cdp.js foto uscita.png [larghezza altezza]
// Serve solo durante lo sviluppo: i pacchetti per i colleghi non contengono .debug.
"use strict";
const [, , comando, a1, a2, a3] = process.argv;
(async () => {
  const pagine = await (await fetch("http://localhost:8089/json")).json();
  const p = pagine.find(x => /com\.borin\.configuratore\/index\.html/.test(x.url));
  if (!p) throw new Error("Pannello BORIN Configuratore non aperto in Photoshop.");
  const ws = new WebSocket(p.webSocketDebuggerUrl);
  let n = 0;
  const attesa = {};
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && attesa[m.id]) { attesa[m.id](m); delete attesa[m.id]; } };
  await new Promise(r => { ws.onopen = r; });
  const invia = (method, params) => new Promise(r => { const id = ++n; attesa[id] = r; ws.send(JSON.stringify({ id, method, params })); });
  if (comando === "eval") {
    const r = await invia("Runtime.evaluate", { expression: a1, awaitPromise: true, returnByValue: true });
    console.log(JSON.stringify(r.result.result.value !== undefined ? r.result.result.value : r.result, null, 1));
  } else if (comando === "foto") {
    if (a2) await invia("Emulation.setDeviceMetricsOverride", { width: +a2, height: +a3, deviceScaleFactor: 2, mobile: false });
    const r = await invia("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    require("fs").writeFileSync(a1, Buffer.from(r.result.data, "base64"));
    if (a2) await invia("Emulation.clearDeviceMetricsOverride", {});
    console.log("salvato", a1);
  }
  ws.close();
})().catch(e => { console.error("ERRORE", e.message); process.exit(1); });
