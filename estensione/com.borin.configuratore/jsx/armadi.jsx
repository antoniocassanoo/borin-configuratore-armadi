/*  BORIN Configuratore armadi · motore per Photoshop (ExtendScript)
    ------------------------------------------------------------------------------------------------
    Il pannello lo carica all'apertura e lo chiama con ARMADI.chiama(nome, argomenti URI-JSON) → {ok, dati|errore}.

    Convenzione dei PSD (letta dal file, quindi un livello nuovo in un gruppo EXTRA diventa una scelta):
      STANDARD                      sempre acceso, con i figli come sono nel file
      EXTRA <n> · <Nome>            una sola opzione accesa: le opzioni sono i figli diretti
        <Opzione> (livello)         l'opzione, con i livelli di ritaglio sopra
        <Opzione> (gruppo)          «Scomparto» sempre acceso, «Contenuto · …» spegnibili, il resto come nel file
    I livelli «fuori posto» (decisi dal pannello) restano spenti.

    - I PSD non si salvano mai: si aprono, si accendono i livelli, si compone e si chiudono senza salvare.
      Un PSD già aperto in Photoshop (magari con modifiche) si usa attraverso una copia: il documento resta com'è.
    - L'immagine composta passa al motore di BORIN Batch (borin_motore.jsx, copia identica) con «elabora»:
      tela, riempimento 60 %, ombra, livelli colore e formati sono per forza quelli di BORIN Batch.
      Il motore si carica in privato: se è aperto anche il pannello BORIN Batch, il suo BORIN globale resta suo. */

$.global.ARMADI = (function () {
    var VERSIONE = "1.0.0";
    var BATCH = null;                        // motore di BORIN Batch (privato)
    var APERTI = {};                         // percorso PSD → {doc, nostro}
    var CONTATORE = 0;

    // ============================================================ JSON (ExtendScript non lo ha)
    var ESC = {'"': '\\"', '\\': '\\\\', '\b': '\\b', '\f': '\\f', '\n': '\\n', '\r': '\\r', '\t': '\\t'};
    function q(s) {
        return '"' + String(s).replace(/["\\\u0000-\u001f\u2028\u2029]/g, function (c) {
            return ESC[c] || ("\\u" + ("0000" + c.charCodeAt(0).toString(16)).slice(-4));
        }) + '"';
    }
    function json(v) {
        if (v === null || v === undefined) return "null";
        var t = typeof v, i, a;
        if (t === "number") return isFinite(v) ? String(v) : "null";
        if (t === "boolean") return v ? "true" : "false";
        if (t === "string") return q(v);
        if (v instanceof Array) {
            a = [];
            for (i = 0; i < v.length; i++) a.push(json(v[i]));
            return "[" + a.join(",") + "]";
        }
        if (t === "object") {
            a = [];
            for (i in v) if (v.hasOwnProperty(i) && typeof v[i] !== "function" && v[i] !== undefined && i.charAt(0) !== "_") a.push(q(i) + ":" + json(v[i]));
            return "{" + a.join(",") + "}";
        }
        return "null";
    }
    function leggiJSON(s) { return eval("(" + s + ")"); }

    // ============================================================ utilità
    function px(v) { return typeof v === "number" ? v : v.as("px"); }
    function trim(s) { return String(s).replace(/^\s+|\s+$/g, ""); }
    function pulito(s) { return trim(String(s).replace(/\s+/g, " ")); }
    function windows() { return $.os.toLowerCase().indexOf("windows") >= 0; }
    function stessoPercorso(a, b) {
        var x = String(a).replace(/\\/g, "/"), y = String(b).replace(/\\/g, "/");
        if (windows()) { x = x.toLowerCase(); y = y.toLowerCase(); }
        return x === y;
    }
    function testoErrore(e) {
        var s = e && e.message ? e.message : String(e);
        if (e && e.line) s += " [riga " + e.line + "]";
        return s;
    }
    function nomeEnum(v) { return String(v).replace(/^[A-Za-z]+\./, ""); }
    function contiene(lista, x) { for (var i = 0; i < lista.length; i++) if (lista[i] === x) return true; return false; }
    var ACCENTI = {"\u00e0": "a", "\u00e1": "a", "\u00e8": "e", "\u00e9": "e", "\u00ec": "i", "\u00ed": "i", "\u00f2": "o", "\u00f3": "o", "\u00f9": "u", "\u00fa": "u"};
    function sigla(s) {                                   // «Base Perimetrale » → «base-perimetrale»
        return pulito(s).toLowerCase().replace(/[\u00e0\u00e1\u00e8\u00e9\u00ec\u00ed\u00f2\u00f3\u00f9\u00fa]/g, function (c) { return ACCENTI[c]; })
            .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "x";
    }
    function bordi(l) {
        try { var b = l.bounds; return [Math.round(px(b[0])), Math.round(px(b[1])), Math.round(px(b[2])), Math.round(px(b[3]))]; }
        catch (e) { return [0, 0, 0, 0]; }
    }
    var libEventi = null;
    function fase(nome, dati) {
        try {
            if (!libEventi) libEventi = new ExternalObject("lib:PlugPlugExternalObject");
            var ev = new CSXSEvent();
            ev.type = "com.borin.configuratore.fase";
            ev.data = encodeURIComponent(json({fase: nome, dati: dati || null}));
            ev.dispatch();
        } catch (e) {}
    }
    function conPreferenze(fn) {                          // pixel e niente dialoghi; poi tutto come prima
        var pr = app.preferences, ru = pr.rulerUnits, dd = app.displayDialogs, attivo = null;
        try { if (app.documents.length) attivo = app.activeDocument; } catch (e) {}
        pr.rulerUnits = Units.PIXELS;
        app.displayDialogs = DialogModes.NO;
        try { return fn(); }
        finally {
            try { pr.rulerUnits = ru; app.displayDialogs = dd; } catch (e1) {}
            try { if (attivo) app.activeDocument = attivo; } catch (e2) {}
        }
    }

    // ============================================================ PSD aperti
    // Un PSD aperto da noi resta aperto tra una chiamata e l'altra solo se il pannello lo chiede (tutte le combinazioni).
    function documentoDi(percorso) {
        var f = new File(percorso);
        for (var i = 0; i < app.documents.length; i++) {
            var d = app.documents[i];
            try { if (stessoPercorso(d.fullName.fsName, f.fsName)) return d; } catch (e) {}
        }
        return null;
    }
    function apri(percorso) {
        var v = APERTI[percorso];
        if (v) { try { v.doc.name; return v; } catch (e) { delete APERTI[percorso]; } }
        var f = new File(percorso);
        if (!f.exists) throw new Error("Il PSD non c'è: " + f.fsName);
        var d = documentoDi(percorso), nostro = false;
        if (d) {                                          // aperto dall'utente: si lavora su una copia
            app.activeDocument = d;
            d = d.duplicate("BORIN configuratore · " + d.name, false);
        } else {
            d = app.open(f);
        }
        nostro = true;
        v = {doc: d, nostro: nostro};
        APERTI[percorso] = v;
        return v;
    }
    function chiudi(percorso) {
        var v = APERTI[percorso];
        delete APERTI[percorso];
        if (v && v.nostro) { try { v.doc.close(SaveOptions.DONOTSAVECHANGES); } catch (e) {} }
    }
    function chiudiTutti() { for (var p in APERTI) if (APERTI.hasOwnProperty(p)) chiudi(p); return true; }

    // ============================================================ albero dei livelli
    // Ogni nodo: percorso (indici dall'alto, «0/2/1»), nome, tipo, visibile (com'è nel file), clip, fusione, bordi, figli.
    // Il percorso è uguale in una copia del documento: serve a ritrovare gli stessi livelli.
    function albero(doc) {
        var z = 0;
        function visita(cont, prefisso) {
            var out = [], i, l, n;
            for (i = 0; i < cont.layers.length; i++) {
                l = cont.layers[i];
                n = {percorso: prefisso + i, _ref: l, nome: String(l.name), tipo: l.typename === "LayerSet" ? "gruppo" : "livello",
                     visibile: l.visible, clip: false, fusione: nomeEnum(l.blendMode), opacita: Math.round(l.opacity), bordi: bordi(l)};
                if (n.tipo === "livello") {
                    try { n.clip = !!l.grouped; } catch (e) {}
                    try { n.kind = nomeEnum(l.kind); } catch (e2) {}
                } else n.figli = visita(l, n.percorso + "/");
                out.push(n);
            }
            return out;
        }
        var rad = {percorso: "", figli: visita(doc, "")};
        (function numera(lista) {                         // z: dal basso verso l'alto, come li compone Photoshop
            for (var i = lista.length - 1; i >= 0; i--) {
                if (lista[i].figli) numera(lista[i].figli);
                lista[i].z = z++;
            }
        })(rad.figli);
        return rad;
    }
    function indice(rad) {                                 // percorso → nodo
        var m = {};
        (function giu(lista) { for (var i = 0; i < lista.length; i++) { m[lista[i].percorso] = lista[i]; if (lista[i].figli) giu(lista[i].figli); } })(rad.figli);
        return m;
    }

    // ============================================================ struttura: gruppi, opzioni, pezzi per l'anteprima
    var RE_EXTRA = /^extra\s*(\d+)\s*[\u00b7\u2022\.\-:\u2013\u2014]?\s*(.+)$/i;
    var RE_CONTENUTO = /^contenuto\s*[\u00b7\u2022\.\-:\u2013\u2014]?\s*(.*)$/i;
    var RE_SCOMPARTO = /^scomparto\b/i;
    var RE_PREDEFINITO = /^(livello|layer|gruppo|group|forma|shape|rettangolo|rectangle|ellisse|ellipse|testo|text)\s*\d*$|\s(copia|copy)(\s\d+)?$|^riempimento generativo|^generative fill|^(bilanciamento colore|curve|livelli|tonalit\u00e0\/saturazione|luminosit\u00e0\/contrasto|esposizione|vividezza|bianco e nero|filtro fotografico|miscelatore canale|mappa sfumatura|correzione colore selettiva|color balance|curves|levels|hue\/saturation|brightness\/contrast|exposure|vibrance|black & white|photo filter|channel mixer|gradient map|selective color)\s*\d*$/i;

    function conRitaglio(lista, i) {                       // livelli di ritaglio sopra lista[i] (indici più bassi = più in alto)
        var out = [];
        for (var k = i - 1; k >= 0 && lista[k].clip; k--) out.push(lista[k]);
        return out;
    }
    function maiuscola(s) { s = pulito(s); return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(); }

    function interpreta(rad) {
        var S = {gruppi: [], altri: [], standard: null, avvisi: []};
        function avviso(livello, testo, dove) { S.avvisi.push({livello: livello, testo: testo, dove: dove || ""}); }
        function controllaNome(n, dove) {
            if (n.nome !== pulito(n.nome)) avviso("avviso", "«" + n.nome + "» ha spazi in più (all'inizio, alla fine o doppi).", dove);
            if (RE_PREDEFINITO.test(pulito(n.nome))) avviso("info", "«" + pulito(n.nome) + "» ha ancora il nome dato da Photoshop.", dove);
        }
        var top = rad.figli, i, n, m;
        for (i = 0; i < top.length; i++) {
            n = top[i];
            controllaNome(n, "primo livello");
            if (n.tipo === "gruppo" && /^standard$/i.test(pulito(n.nome))) { S.standard = n; continue; }
            m = pulito(n.nome).match(RE_EXTRA);
            if (n.tipo === "gruppo" && m) { S.gruppi.push(leggiGruppo(n, parseInt(m[1], 10), m[2], avviso, controllaNome)); continue; }
            if (n.clip) continue;
            S.altri.push({percorso: n.percorso, nome: pulito(n.nome), visibile: n.visibile});
            avviso("avviso", "«" + pulito(n.nome) + "» è fuori dai gruppi STANDARD ed EXTRA: il pannello lo lascia " + (n.visibile ? "acceso" : "spento") + " come nel file.", "primo livello");
        }
        if (!S.standard) avviso("errore", "Manca il gruppo «STANDARD» con il corpo dell'armadio.", "primo livello");
        S.gruppi.sort(function (a, b) { return a.numero - b.numero; });
        var corpoZ = S.standard ? S.standard.z : 0;
        for (i = 0; i < S.gruppi.length; i++) {
            S.gruppi[i].sotto = S.gruppi[i]._nodo.z < corpoZ;
            if (S.gruppi[i].opzioni.length === 0) avviso("errore", "Il gruppo «" + S.gruppi[i].nomeFile + "» non ha opzioni.", S.gruppi[i].nomeFile);
        }
        return S;
    }

    function leggiGruppo(g, numero, nome, avviso, controllaNome) {
        var G = {id: sigla(nome), numero: numero, nome: maiuscola(nome), nomeFile: pulito(g.nome), percorso: g.percorso, opzioni: [], _nodo: g};
        var lista = g.figli, i, n, O, visibili = 0;
        for (i = 0; i < lista.length; i++) {
            n = lista[i];
            controllaNome(n, G.nomeFile);
            if (n.clip) continue;
            if (n.tipo === "gruppo" && n.figli.length === 0) { avviso("avviso", "Gruppo vuoto «" + pulito(n.nome) + "».", G.nomeFile); continue; }
            O = {id: sigla(n.nome), nome: maiuscola(n.nome), nomeFile: pulito(n.nome), percorso: n.percorso, tipo: n.tipo,
                 accesaNelFile: n.visibile, bordi: n.bordi, z: n.z, ritaglio: [], parti: []};
            var rit = conRitaglio(lista, i), k;
            for (k = 0; k < rit.length; k++) O.ritaglio.push(rit[k].percorso);
            if (n.tipo === "gruppo") leggiParti(O, n, avviso, controllaNome, G.nomeFile + " › " + O.nomeFile);
            if (n.visibile) visibili++;
            G.opzioni.push(O);
        }
        // id unici anche con nomi uguali dopo la pulizia
        var visti = {};
        for (i = 0; i < G.opzioni.length; i++) {
            var id = G.opzioni[i].id, x = 2;
            while (visti[id]) id = G.opzioni[i].id + "-" + x++;
            if (id !== G.opzioni[i].id) avviso("avviso", "Due opzioni si chiamano «" + G.opzioni[i].nomeFile + "».", G.nomeFile);
            G.opzioni[i].id = id; visti[id] = true;
        }
        G.predefinita = null;
        for (i = 0; i < G.opzioni.length; i++) if (G.opzioni[i].accesaNelFile && visibili === 1) G.predefinita = G.opzioni[i].id;
        return G;
    }

    function leggiParti(O, gr, avviso, controllaNome, dove) {
        var lista = gr.figli, i, n, P, rit, k;
        for (i = 0; i < lista.length; i++) {
            n = lista[i];
            controllaNome(n, dove);
            if (n.clip) continue;
            if (n.tipo === "gruppo" && n.figli.length === 0) { avviso("avviso", "Gruppo vuoto «" + pulito(n.nome) + "».", dove); continue; }
            var m = pulito(n.nome).match(RE_CONTENUTO);
            P = {percorso: n.percorso, nome: pulito(n.nome), tipo: n.tipo, z: n.z, fusione: n.fusione, bordi: n.bordi, accesaNelFile: n.visibile, ritaglio: []};
            P.ruolo = m ? "contenuto" : (RE_SCOMPARTO.test(pulito(n.nome)) ? "fissa" : "altro");
            if (m) P.contenuto = pulito(m[1]);
            rit = conRitaglio(lista, i);
            for (k = 0; k < rit.length; k++) P.ritaglio.push(rit[k].percorso);
            if (n.kind && n.kind !== "NORMAL" && n.kind !== "SMARTOBJECT" && n.kind !== "TEXT" && n.kind !== "SOLIDFILL" && n.kind !== "GRADIENTFILL" && n.kind !== "PATTERNFILL")
                P.regolazione = true;                     // regolazione non di ritaglio: agisce su ciò che sta sotto
            if (P.ruolo === "altro") avviso("info", "«" + P.nome + "» dentro «" + O.nomeFile + "» non è né «Scomparto» né «Contenuto · …»: resta " + (n.visibile ? "acceso" : "spento") + " come nel file.", dove);
            O.parti.push(P);
        }
    }

    // ============================================================ quali livelli accendere
    // scelta = {opzioni: {gruppoId: opzioneId}, contenuti: {gruppoId: true|false}, nascondi: [percorsi]}
    // solo = {percorsi: [...]}: per le anteprime, accende solo quei pezzi (e i loro ritagli).
    function piano(rad, S, scelta) {
        var I = indice(rad), V = {}, p, i, j, k, nascosti = {};
        for (p in I) if (I.hasOwnProperty(p)) V[p] = I[p].visibile;          // si parte da com'è nel file
        var nas = (scelta && scelta.nascondi) || [];
        for (i = 0; i < nas.length; i++) nascosti[nas[i]] = true;
        function accendi(percorso, v) { if (I[percorso]) V[percorso] = v; }
        function antenati(percorso, v) {
            var parti = percorso.split("/");
            for (var x = 1; x < parti.length; x++) accendi(parti.slice(0, x).join("/"), v);
        }
        function ramo(percorso, v) {                      // un nodo con tutto ciò che contiene
            accendi(percorso, v);
            var n = I[percorso];
            if (n && n.figli) for (var x = 0; x < n.figli.length; x++) ramo(n.figli[x].percorso, v);
        }
        if (scelta && scelta.solo) {                     // anteprime: tutto spento tranne i pezzi richiesti
            for (p in V) if (V.hasOwnProperty(p)) V[p] = false;
            for (i = 0; i < scelta.solo.length; i++) {
                var s = scelta.solo[i], n = I[s.percorso];
                if (!n) continue;
                antenati(s.percorso, true);
                accendi(s.percorso, true);
                if (n.figli) (function giu(lista) {          // dentro un gruppo-pezzo (STANDARD): com'è nel file
                    for (var x = 0; x < lista.length; x++) { V[lista[x].percorso] = lista[x].visibile; if (lista[x].figli) giu(lista[x].figli); }
                })(n.figli);
                for (k = 0; k < (s.ritaglio || []).length; k++) accendi(s.ritaglio[k], I[s.ritaglio[k]] ? I[s.ritaglio[k]].visibile : false);
            }
            return V;
        }
        if (S.standard) accendi(S.standard.percorso, true);
        for (i = 0; i < S.gruppi.length; i++) {
            var G = S.gruppi[i], scelto = (scelta && scelta.opzioni && scelta.opzioni[G.id]) || G.predefinita || (G.opzioni[0] && G.opzioni[0].id);
            var conContenuto = !(scelta && scelta.contenuti && scelta.contenuti[G.id] === false);
            accendi(G.percorso, true);
            for (j = 0; j < G.opzioni.length; j++) {
                var O = G.opzioni[j], si = O.id === scelto;
                accendi(O.percorso, si);
                for (k = 0; k < O.ritaglio.length; k++) accendi(O.ritaglio[k], si && I[O.ritaglio[k]].visibile);
                if (!si) continue;                        // le parti delle opzioni spente non si toccano
                for (k = 0; k < O.parti.length; k++) {
                    var P = O.parti[k], v;
                    if (P.ruolo === "contenuto") v = conContenuto;
                    else if (P.ruolo === "fissa") v = true;
                    else v = P.accesaNelFile;
                    if (nascosti[P.percorso]) v = false;
                    if (P.tipo === "gruppo" && v) ramo(P.percorso, true);
                    accendi(P.percorso, v);
                    for (var r = 0; r < P.ritaglio.length; r++) accendi(P.ritaglio[r], v && I[P.ritaglio[r]].visibile);
                }
            }
        }
        for (p in nascosti) if (nascosti.hasOwnProperty(p)) accendi(p, false);
        return V;
    }
    function applica(rad, V) {                             // cambia solo ciò che serve (ogni cambio è un passo di Photoshop)
        var I = indice(rad), cambiati = 0;
        for (var p in V) {
            if (!V.hasOwnProperty(p) || !I[p]) continue;
            var l = I[p]._ref;
            if (l.visible !== V[p]) { l.visible = V[p]; cambiati++; }
        }
        return cambiati;
    }

    // ============================================================ API
    function info(a) {
        return {motore: VERSIONE, batch: BATCH ? BATCH.versione : null, photoshop: String(app.version), sistema: $.os,
                documenti: app.documents.length, temp: Folder.temp.fsName};
    }

    function caricaBatch(file) {
        var f = new File(file);
        if (!f.exists) throw new Error("Manca il motore di BORIN Batch: " + f.fsName);
        var prima = $.global.BORIN, cera = typeof prima !== "undefined";
        $.evalFile(f);
        BATCH = $.global.BORIN;
        if (cera) $.global.BORIN = prima;                 // quello del pannello BORIN Batch resta suo
        else { try { delete $.global.BORIN; } catch (e) { $.global.BORIN = undefined; } }
        return BATCH.versione;
    }

    // Struttura del PSD senza esportare niente.
    function leggi(a) {
        return conPreferenze(function () {
            var tieni = !!APERTI[a.psd], v = apri(a.psd);
            try {
                var d = v.doc, rad = albero(d), S = interpreta(rad);
                S.larghezza = Math.round(px(d.width)); S.altezza = Math.round(px(d.height));
                try { S.profilo = d.colorProfileName; } catch (e) { S.profilo = ""; }
                S.dpi = Math.round(d.resolution); S.modo = nomeEnum(d.mode); S.bit = nomeEnum(d.bitsPerChannel);
                return pulisci(S);
            } finally { if (!tieni && !a.tieniAperto) chiudi(a.psd); }
        });
    }
    function pulisci(S) {                                  // via i riferimenti ai livelli prima di mandarlo al pannello
        for (var i = 0; i < S.gruppi.length; i++) delete S.gruppi[i]._nodo;
        if (S.standard) S.standard = {percorso: S.standard.percorso, z: S.standard.z, bordi: S.standard.bordi};
        return S;
    }

    // Anteprime: un PNG per pezzo (corpo, ogni opzione, ogni parte), tutti della stessa tela ridotta, da impilare.
    function anteprime(a) {
        return conPreferenze(function () {
            var tieni = !!APERTI[a.psd], v = apri(a.psd), copia = null;
            try {
                var d = v.doc, rad = albero(d), S = interpreta(rad);
                S.larghezza = Math.round(px(d.width)); S.altezza = Math.round(px(d.height));
                try { S.profilo = d.colorProfileName; } catch (e) { S.profilo = ""; }
                S.dpi = Math.round(d.resolution);
                var H = Math.min(a.altezza || 1000, S.altezza), k = H / S.altezza, W = Math.max(1, Math.round(S.larghezza * k));
                var cartella = new Folder(a.cartella);
                if (!cartella.exists && !cartella.create()) throw new Error("Non riesco a creare " + cartella.fsName);
                app.activeDocument = d;
                copia = d.duplicate("BORIN anteprime", false);
                app.activeDocument = copia;
                copia.resizeImage(UnitValue(W, "px"), UnitValue(H, "px"), copia.resolution, ResampleMethod.BICUBICSHARPER);
                var radC = albero(copia), pezzi = [], i, j, k2;
                if (S.standard) pezzi.push({id: "corpo", ruolo: "corpo", percorso: S.standard.percorso, z: S.standard.z, fusione: "NORMAL", bordi: S.standard.bordi, ritaglio: []});
                for (i = 0; i < S.altri.length; i++) if (S.altri[i].visibile)
                    pezzi.push({id: "altro-" + i, ruolo: "altro", percorso: S.altri[i].percorso, z: indice(rad)[S.altri[i].percorso].z, fusione: indice(rad)[S.altri[i].percorso].fusione, bordi: indice(rad)[S.altri[i].percorso].bordi, ritaglio: []});
                for (i = 0; i < S.gruppi.length; i++) {
                    var G = S.gruppi[i];
                    for (j = 0; j < G.opzioni.length; j++) {
                        var O = G.opzioni[j];
                        if (O.tipo === "livello") {
                            pezzi.push({id: G.id + "__" + O.id, ruolo: "opzione", gruppo: G.id, opzione: O.id, percorso: O.percorso, z: O.z,
                                        fusione: indice(rad)[O.percorso].fusione, bordi: O.bordi, ritaglio: O.ritaglio});
                        } else for (k2 = 0; k2 < O.parti.length; k2++) {
                            var P = O.parti[k2];
                            if (P.regolazione) continue;          // senza pixel propri: nell'anteprima non si vede
                            pezzi.push({id: G.id + "__" + O.id + "__" + sigla(P.nome), ruolo: P.ruolo, gruppo: G.id, opzione: O.id, percorso: P.percorso,
                                        z: P.z, fusione: P.tipo === "gruppo" ? "NORMAL" : P.fusione, bordi: P.bordi, ritaglio: P.ritaglio});
                        }
                    }
                }
                var opz = new PNGSaveOptions();
                opz.interlaced = false;
                try { opz.compression = 6; } catch (e1) {}
                for (i = 0; i < pezzi.length; i++) {
                    fase("anteprima", {pezzo: i + 1, di: pezzi.length});
                    applica(radC, piano(radC, S, {solo: [pezzi[i]]}));
                    var f = new File(cartella.fsName + "/" + pezzi[i].id + ".png");
                    copia.saveAs(f, opz, true, Extension.LOWERCASE);
                    pezzi[i].file = pezzi[i].id + ".png";
                }
                S.anteprime = {larghezza: W, altezza: H, scala: k, pezzi: pezzi};
                return pulisci(S);
            } finally {
                if (copia) { try { copia.close(SaveOptions.DONOTSAVECHANGES); } catch (e2) {} }
                if (!tieni && !a.tieniAperto) chiudi(a.psd);
            }
        });
    }

    // Accende la configurazione nel PSD e ne fa una copia unita (un livello, trasparente). Restituisce il nome della copia.
    function componiDoc(a) {
        var v = apri(a.psd), d = v.doc, rad = albero(d), S = interpreta(rad);
        app.activeDocument = d;
        fase("livelli", {psd: a.psd});
        applica(rad, piano(rad, S, a.scelta || {}));
        var nome = "BORIN armadio " + (new Date().getTime()) + "-" + (++CONTATORE);
        var unita = d.duplicate(nome, true);
        return {doc: unita, nome: nome, S: S};
    }

    // Composizione salvata come PNG trasparente (collaudi e «salva solo la composizione»).
    function componi(a) {
        return conPreferenze(function () {
            var tieni = !!APERTI[a.psd], c = null;
            try {
                c = componiDoc(a);
                app.activeDocument = c.doc;
                var o = new PNGSaveOptions(); o.interlaced = false;
                c.doc.saveAs(new File(a.png), o, true, Extension.LOWERCASE);
                return {png: a.png};
            } finally {
                if (c) { try { c.doc.close(SaveOptions.DONOTSAVECHANGES); } catch (e) {} }
                if (!tieni && !a.tieniAperto) chiudi(a.psd);
            }
        });
    }

    // Composizione + motore BORIN Batch («elabora»): tela, ombra, colore e formati come BORIN Batch.
    // a = {psd, scelta, cfg, uscite: {psd, jpg, png, webp}, anteprimaDopo, latoAnteprima, tieniAperto}
    function esporta(a) {
        if (!BATCH) throw new Error("Il motore di BORIN Batch non è caricato: premi «Ricarica il motore» in Info.");
        var c = null, R = null;
        var tieni = !!APERTI[a.psd];
        try {
            c = conPreferenze(function () { return componiDoc(a); });
            var arg = {documento: c.nome, cfg: a.cfg, uscite: a.uscite, anteprimaDopo: a.anteprimaDopo, latoAnteprima: a.latoAnteprima || 1400};
            var r = leggiJSON(decodeURIComponent(BATCH.chiama("elabora", encodeURIComponent(json(arg)))));
            if (!r.ok) throw new Error(r.errore);
            R = r.dati;
            R.file = a.nome || R.file;
        } finally {
            if (c) { try { c.doc.close(SaveOptions.DONOTSAVECHANGES); } catch (e) {} }
            if (!tieni && !a.tieniAperto) chiudi(a.psd);
        }
        return R;
    }

    // Apre il PSD con la configurazione accesa, per vederla o ritoccarla in Photoshop (niente salvataggi).
    function mostraInPhotoshop(a) {
        return conPreferenze(function () {
            var f = new File(a.psd), d = documentoDi(a.psd);
            if (!f.exists) throw new Error("Il PSD non c'è: " + f.fsName);
            if (!d) d = app.open(f);
            app.activeDocument = d;
            var rad = albero(d), S = interpreta(rad);
            applica(rad, piano(rad, S, a.scelta || {}));
            delete APERTI[a.psd];                         // da qui è un documento dell'utente
            return true;
        });
    }

    function pulisciMemoria() {
        try { app.purge(PurgeTarget.HISTORYCACHES); } catch (e) {}
        return true;
    }

    var API = {
        versione: function () { return VERSIONE; }, info: info, leggi: leggi, anteprime: anteprime, componi: componi,
        esporta: esporta, mostraInPhotoshop: mostraInPhotoshop, chiudiTutti: chiudiTutti,
        chiudi: function (a) { chiudi(a.psd); return true; }, pulisciMemoria: pulisciMemoria,
        caricaBatch: function (a) { return caricaBatch(a.file); }
    };

    function chiama(nome, argomenti) {
        var out;
        try {
            if (!API.hasOwnProperty(nome)) throw new Error("Funzione sconosciuta: " + nome);
            var a = argomenti ? leggiJSON(decodeURIComponent(argomenti)) : {};
            out = {ok: true, dati: API[nome](a)};
        } catch (e) {
            out = {ok: false, errore: testoErrore(e)};
        }
        return encodeURIComponent(json(out));
    }

    return {chiama: chiama, versione: VERSIONE, json: json, _api: API};
})();
