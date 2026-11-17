// Monta index.html dell'estensione dal modello, inserendo il logo BORIN (intro e intestazione).
// Uso: node estensione/sorgenti/monta.js
"use strict";
const fs = require("fs"), path = require("path");
const qui = __dirname, est = path.join(qui, "..", "com.borin.configuratore");
let html = fs.readFileSync(path.join(qui, "index.modello.html"), "utf8");
html = html.replace("<!--INTRO-->", fs.readFileSync(path.join(qui, "logo_intro.svg.html"), "utf8").trimEnd())
           .replace("<!--MARCHIO-->", fs.readFileSync(path.join(qui, "logo_marchio.html"), "utf8").trimEnd());
const resto = html.match(/<!--[A-Z]+-->/);
if (resto) throw new Error("Segnaposto non sostituito: " + resto[0]);
fs.writeFileSync(path.join(est, "index.html"), html, "utf8");
console.log("index.html:", html.length, "caratteri");
