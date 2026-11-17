/*  BORIN Batch 8 · motore per Photoshop (ExtendScript)
    ------------------------------------------------------------------------------------------------
    Il pannello HTML lo carica all'apertura e lo chiama un file alla volta: BORIN.chiama(nome, argomenti).
    - Non modifica mai i file di partenza: apre, lavora in memoria, salva gli output e chiude senza salvare.
    - Ogni chiamata mette righelli in pixel e niente finestre di dialogo, poi rimette le preferenze di prima.
    - Deriva da «BORIN Batch Workflow Guidato v3»: ombra adattiva a due componenti, mappa sfumatura «BORIN 26»
      in luce soffusa al 15 %, tonalità/saturazione su ciani e blu (+10/+10), canvas 5120, riempimento 60 %.
    Correzioni rispetto al v3 (dettagli in LEGGIMI-SVILUPPO.md):
    - l'appoggio dell'ombra si ricava da una sagoma pulita (soglia sull'alpha, niente puntini, niente pezzi
      staccati, niente livelli nascosti o effetti) e non dal riquadro del livello: era la causa delle ombre lontane;
    - un solo ricampionamento (ritaglio + scala + tela), senza traslare i livelli: funziona anche con i blocchi;
    - righelli forzati in pixel per tutta la lavorazione (nel v3 «translate» seguiva i cm/mm del computer);
    - scontorno alla risoluzione originale, analisi automatica file per file, salvataggi sicuri su file temporaneo. */

$.global.BORIN = (function () {
    var VERSIONE = "8.1.0";
    var RIF = 5120;                         // lato di riferimento dei valori in px (come nel v3)
    var NOME_ESCLUSI = "Esclusi dal batch (BORIN)";
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
            for (i in v) if (v.hasOwnProperty(i) && typeof v[i] !== "function" && v[i] !== undefined) a.push(q(i) + ":" + json(v[i]));
            return "{" + a.join(",") + "}";
        }
        return "null";
    }
    function leggiJSON(s) { return eval("(" + s + ")"); }

    // ============================================================ utilità
    function cID(s) { return charIDToTypeID(s); }
    function sID(s) { return stringIDToTypeID(s); }
    function ora() { return new Date().getTime(); }
    function px(v) { return typeof v === "number" ? v : v.as("px"); }
    function limita(v, a, b) { return Math.max(a, Math.min(b, v)); }
    function trim(s) { return String(s).replace(/^\s+|\s+$/g, ""); }
    function rett(b) {
        var r = {l: px(b[0]), t: px(b[1]), r: px(b[2]), b: px(b[3])};
        r.w = r.r - r.l; r.h = r.b - r.t;
        return r;
    }
    function bordi(layer) { return rett(layer.bounds); }
    function nomeFile(f) { try { return File.decode(f.name); } catch (e) { return String(f.name); } }
    function senzaEstensione(n) { return String(n).replace(/\.[^.]+$/, ""); }
    function estensione(n) { var m = String(n).match(/\.([^.\/\\]+)$/); return m ? m[1].toLowerCase() : ""; }
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
    function colore(r, g, b) {
        var c = new SolidColor();
        c.rgb.red = r; c.rgb.green = g; c.rgb.blue = b;
        return c;
    }
    function nomeEnum(v) { return String(v).replace(/^[A-Za-z]+\./, ""); }

    // ============================================================ avvisi al pannello durante il lavoro
    var libEventi = null;
    function fase(nome, dati) {
        try {
            if (!libEventi) libEventi = new ExternalObject("lib:PlugPlugExternalObject");
            var ev = new CSXSEvent();
            ev.type = "com.borin.batch.fase";
            ev.data = encodeURIComponent(json({fase: nome, dati: dati || null}));
            ev.dispatch();
        } catch (e) {}
    }

    // ============================================================ preferenze: pixel e niente dialoghi, poi ripristino
    function conPreferenze(fn) {
        var pr = app.preferences, ru = pr.rulerUnits, tu = pr.typeUnits, dd = app.displayDialogs;
        pr.rulerUnits = Units.PIXELS;
        pr.typeUnits = TypeUnits.PIXELS;
        app.displayDialogs = DialogModes.NO;
        try { return fn(); }
        finally {
            try { pr.rulerUnits = ru; pr.typeUnits = tu; app.displayDialogs = dd; } catch (e) {}
        }
    }

    // ============================================================ selezioni e maschere (Action Manager)
    function selezionaTrasparenza() {                     // = Cmd/Ctrl+clic sulla miniatura del livello attivo
        var d = new ActionDescriptor(), r = new ActionReference(), r2 = new ActionReference();
        r.putProperty(cID("Chnl"), cID("fsel"));
        d.putReference(cID("null"), r);
        r2.putEnumerated(cID("Chnl"), cID("Chnl"), cID("Trsp"));
        d.putReference(cID("T   "), r2);
        executeAction(cID("setd"), d, DialogModes.NO);
    }
    function bordiSelezione(doc) {
        try {
            var r = rett(doc.selection.bounds);
            return (r.w >= 1 && r.h >= 1) ? r : null;
        } catch (e) { return null; }
    }
    function deseleziona(doc) { try { doc.selection.deselect(); } catch (e) {} }
    function selezionaRett(doc, l, t, r, b, tipo) {
        doc.selection.select([[l, t], [r, t], [r, b], [l, b]], tipo || SelectionType.REPLACE, 0, false);
    }
    function selezionaSoggettoAI() {
        var d = new ActionDescriptor();
        d.putBoolean(sID("sampleAllLayers"), true);         // nel v3 era un intero: tipo sbagliato
        executeAction(sID("autoCutout"), d, DialogModes.NO);
    }
    function rimuoviSfondoAI() { executeAction(sID("removeBackground"), new ActionDescriptor(), DialogModes.NO); }
    function mascheraDaSelezione() {
        var d = new ActionDescriptor(), r = new ActionReference();
        d.putClass(cID("Nw  "), cID("Chnl"));
        r.putEnumerated(cID("Chnl"), cID("Chnl"), cID("Msk "));
        d.putReference(cID("At  "), r);
        d.putEnumerated(cID("Usng"), cID("UsrM"), cID("RvlS"));
        executeAction(cID("Mk  "), d, DialogModes.NO);
    }
    function selezioneDaMaschera() {
        var d = new ActionDescriptor(), r = new ActionReference(), r2 = new ActionReference();
        r.putProperty(cID("Chnl"), cID("fsel"));
        d.putReference(cID("null"), r);
        r2.putEnumerated(cID("Chnl"), cID("Chnl"), cID("Msk "));
        d.putReference(cID("T   "), r2);
        executeAction(cID("setd"), d, DialogModes.NO);
    }
    function intersecaConMaschera() {
        var d = new ActionDescriptor(), r = new ActionReference(), r2 = new ActionReference();
        r.putEnumerated(cID("Chnl"), cID("Chnl"), cID("Msk "));
        d.putReference(cID("null"), r);
        r2.putProperty(cID("Chnl"), cID("fsel"));
        d.putReference(cID("With"), r2);
        executeAction(cID("Intr"), d, DialogModes.NO);
    }
    function eliminaMaschera(applica) {
        var d = new ActionDescriptor(), r = new ActionReference();
        r.putEnumerated(cID("Chnl"), cID("Chnl"), cID("Msk "));
        d.putReference(cID("null"), r);
        if (applica) d.putBoolean(cID("Aply"), true);
        executeAction(cID("Dlt "), d, DialogModes.NO);
    }
    function haMaschera(layer) {
        try {
            var r = new ActionReference();
            r.putIdentifier(cID("Lyr "), layer.id);
            return executeActionGet(r).getBoolean(sID("hasUserMask"));
        } catch (e) { return false; }
    }
    function haEffetti(layer) {
        try {
            var r = new ActionReference();
            r.putIdentifier(cID("Lyr "), layer.id);
            return executeActionGet(r).hasKey(sID("layerEffects"));
        } catch (e) { return false; }
    }
    // Effetti di livello (ombra esterna, bagliore…) fuori dalla sagoma: «Cancella stile livello», solo sulle copie.
    // Photoshop lo accetta solo sul livello attivo (per id dà «stili livello non disponibile»), quindi si seleziona,
    // e solo se il livello e i suoi gruppi sono visibili: selezionare un livello nascosto lo renderebbe visibile.
    function togliEffetti(doc, layer) {
        if (!haEffetti(layer)) return;
        try {
            doc.activeLayer = layer;
            var d = new ActionDescriptor(), r = new ActionReference();
            r.putEnumerated(cID("Lyr "), cID("Ordn"), cID("Trgt"));
            d.putReference(cID("null"), r);
            executeAction(sID("disableLayerStyle"), d, DialogModes.NO);
        } catch (e) {}
    }
    function togliEffettiVisibili(doc, layer) {
        if (!layer.visible) return;
        togliEffetti(doc, layer);
        if (layer.typename === "LayerSet") for (var i = 0; i < layer.layers.length; i++) togliEffettiVisibili(doc, layer.layers[i]);
    }
    function filtroCanale(evento, raggio) {               // Minimo / Massimo sul canale attivo
        var d = new ActionDescriptor();
        d.putUnitDouble(cID("Rds "), cID("#Pxl"), raggio);
        executeAction(cID(evento), d, DialogModes.NO);
    }
    function sogliaCanale(livello) {
        var d = new ActionDescriptor();
        d.putInteger(cID("Lvl "), livello);
        executeAction(cID("Thrs"), d, DialogModes.NO);
    }

    // ============================================================ livelli
    var TIPI_REGOLAZIONE = null;
    function eRegolazione(layer) {
        if (layer.typename !== "ArtLayer") return false;
        if (!TIPI_REGOLAZIONE) {
            TIPI_REGOLAZIONE = {};
            var n = ["BLACKANDWHITE", "BRIGHTNESSCONTRAST", "CHANNELMIXER", "COLORBALANCE", "COLORLOOKUP", "CURVES",
                "EXPOSURE", "GRADIENTMAP", "HUESATURATION", "INVERSION", "LEVELS", "PHOTOFILTER", "POSTERIZE",
                "SELECTIVECOLOR", "THRESHOLD", "VIBRANCE"];
            for (var i = 0; i < n.length; i++) { try { TIPI_REGOLAZIONE[String(LayerKind[n[i]])] = true; } catch (e) {} }
        }
        try { return !!TIPI_REGOLAZIONE[String(layer.kind)]; } catch (e2) { return false; }
    }
    function ogniLivello(contenitore, fn) {
        for (var i = 0; i < contenitore.layers.length; i++) {
            var l = contenitore.layers[i];
            fn(l);
            if (l.typename === "LayerSet") ogniLivello(l, fn);
        }
    }
    function sblocca(layer) {
        try { if (layer.allLocked) layer.allLocked = false; } catch (e) {}
        if (layer.typename !== "ArtLayer") return;
        try { if (layer.pixelsLocked) layer.pixelsLocked = false; } catch (e1) {}
        try { if (layer.positionLocked) layer.positionLocked = false; } catch (e2) {}
        try { if (layer.transparentPixelsLocked) layer.transparentPixelsLocked = false; } catch (e3) {}
    }
    // Photoshop rende visibile un livello nascosto quando diventa il livello attivo, anche per un effetto
    // collaterale (succede sbloccando lo «Sfondo» se il livello attivo salvato nel PSD era nascosto).
    // Si fotografa la visibilità appena aperto il file e la si rimette dopo i passi che la possono toccare.
    function fotografaVisibilita(doc) {
        var m = {};
        ogniLivello(doc, function (l) { try { m[l.id] = l.visible; } catch (e) {} });
        return m;
    }
    function ripristinaVisibilita(doc, m) {
        ogniLivello(doc, function (l) {
            try { var v = m[l.id]; if (v !== undefined && l.visible !== v) l.visible = v; } catch (e) {}
        });
    }
    function contaContenuti(contenitore) {               // livelli visibili con pixel (le regolazioni non contano)
        var n = 0;
        for (var i = 0; i < contenitore.layers.length; i++) {
            var l = contenitore.layers[i];
            if (!l.visible) continue;
            if (l.typename === "LayerSet") n += contaContenuti(l);
            else if (!eRegolazione(l)) n++;
        }
        return n;
    }
    function inCima(doc, layer) {
        try { if (doc.layers.length > 1) layer.move(doc.layers[0], ElementPlacement.PLACEBEFORE); } catch (e) {}
    }
    function inFondo(doc, layer) {
        try { layer.move(doc.layers[doc.layers.length - 1], ElementPlacement.PLACEAFTER); } catch (e) {}
    }
    function rimuovi(layer) { try { if (layer) layer.remove(); } catch (e) {} }

    // Mette un livello o un gruppo in cima a un gruppo. Photoshop non accetta «INSIDE» per i gruppi
    // (nel v3 «Mantieni livelli separati» si bloccava sui PSD con cartelle): si passa da un segnaposto.
    function mettiDentro(layer, gruppo) {
        if (layer.typename !== "LayerSet") { layer.move(gruppo, ElementPlacement.INSIDE); return; }
        var segnaposto = gruppo.artLayers.add();
        try { layer.move(segnaposto, ElementPlacement.PLACEBEFORE); }
        finally { rimuovi(segnaposto); }
    }

    // Copia appiattita di un livello o di un gruppo: maschere applicate, testi e oggetti avanzati resi, effetti nascosti.
    function copiaAppiattita(doc, layer, nome) {
        var dup = layer.duplicate(doc.layers[0], ElementPlacement.PLACEBEFORE);
        dup.visible = true;
        var gruppo = dup;
        if (dup.typename !== "LayerSet") {
            gruppo = doc.layerSets.add();
            gruppo.move(doc.layers[0], ElementPlacement.PLACEBEFORE);
            dup.move(gruppo, ElementPlacement.INSIDE);
        }
        gruppo.visible = true;
        togliEffettiVisibili(doc, gruppo);
        doc.activeLayer = gruppo;
        var r = gruppo.merge();
        r.name = nome;
        r.visible = true;
        return r;
    }


    // ============================================================ apertura e preparazione del documento
    function apri(a) {
        var f = a.file ? new File(a.file) : null, i, d, stesso;
        for (i = 0; i < app.documents.length; i++) {
            d = app.documents[i];
            stesso = false;
            try { if (f) stesso = stessoPercorso(d.fullName.fsName, f.fsName); } catch (e) {}
            if (!stesso && a.documento) { try { stesso = (d.name === a.documento); } catch (e2) {} }
            if (stesso) {                                   // già aperto: si lavora su una copia
                app.activeDocument = d;
                return {doc: d.duplicate(senzaEstensione(d.name) + " · BORIN"), giaAperto: true};
            }
        }
        if (!f) throw new Error("Documento aperto non trovato: " + a.documento);
        if (!f.exists) throw new Error("Il file non esiste più: " + f.fsName);
        return {doc: app.open(f), giaAperto: false};
    }

    function infoDocumento(doc) {
        var profilo = "";
        try { profilo = doc.colorProfileName; } catch (e) {}
        return {
            larghezza: Math.round(px(doc.width)), altezza: Math.round(px(doc.height)),
            dpi: Math.round(doc.resolution), modo: nomeEnum(doc.mode), bit: nomeEnum(doc.bitsPerChannel),
            profilo: profilo, livelli: doc.layers.length
        };
    }

    function normalizza(doc, cfg, R) {
        var modo = doc.mode;
        if (modo === DocumentMode.BITMAP) doc.changeMode(ChangeMode.GRAYSCALE);
        if (doc.mode !== DocumentMode.RGB) {
            doc.changeMode(ChangeMode.RGB);
            R.avvisi.push("Convertito in RGB (era " + nomeEnum(modo) + ").");
        }
        if (doc.bitsPerChannel !== BitsPerChannelType.EIGHT) doc.bitsPerChannel = BitsPerChannelType.EIGHT;
        try { doc.activeChannels = doc.componentChannels; } catch (e) {}
        if (!cfg.colore.mantieniProfilo) {
            try { doc.convertProfile("sRGB IEC61966-2.1", Intent.RELATIVECOLORIMETRIC, true, false); }
            catch (e2) { R.avvisi.push("Conversione in sRGB non riuscita: " + testoErrore(e2)); }
        }
        doc.resizeImage(undefined, undefined, cfg.tela.dpi, ResampleMethod.NONE);
    }

    // Lo «Sfondo» bloccato diventa un livello normale. Nei file a un solo livello è il soggetto; in quelli a più
    // livelli resta uno sfondo («Sfondo originale»), così le regole di esclusione lo riconoscono.
    function sbloccaSfondo(doc) {
        var bg = null;
        try { bg = doc.backgroundLayer; } catch (e) {}
        if (!bg) return null;
        var unico = doc.layers.length === 1;
        bg.isBackgroundLayer = false;
        bg.name = unico ? "Soggetto originale" : "Sfondo originale";
        return unico ? null : bg.id;
    }

    // ============================================================ livelli da escludere
    var GENERATI_BORIN = /^(-mappa sfumatura|-luminosit|-curve$|ombra_adattiva|sfondo[ _]bianco$|esclusi dal batch)/i;
    function parole(s) {
        var out = [], p = String(s || "").toLowerCase().split(/[,;\n]+/);
        for (var i = 0; i < p.length; i++) { var w = trim(p[i]); if (w) out.push(w); }
        return out;
    }
    function contieneParola(nome, lista) {
        for (var i = 0; i < lista.length; i++) if (nome.indexOf(lista[i]) >= 0) return true;
        return false;
    }
    function motivoEsclusione(layer, regole) {
        var n = "";
        try { n = String(layer.name).toLowerCase(); } catch (e) {}
        if (GENERATI_BORIN.test(n)) return "BORIN";        // livelli di una lavorazione precedente: si rifanno
        if (contieneParola(n, regole.ombre)) return "ombra";
        if (regole.sfondi.length) {
            var id = -1;
            try { id = layer.id; } catch (e2) {}
            if (id === regole.idSfondo || contieneParola(n, regole.sfondi)) return "sfondo";
        }
        return null;
    }
    function escludi(doc, regole) {
        var esclusi = [];
        function visita(cont) {
            for (var i = 0; i < cont.layers.length; i++) {
                var l = cont.layers[i], m = motivoEsclusione(l, regole);
                if (m) {
                    esclusi.push({layer: l, motivo: m, nome: String(l.name), eraVisibile: l.visible});
                    l.visible = false;
                    continue;
                }
                if (l.typename === "LayerSet") visita(l);
            }
        }
        visita(doc);
        return esclusi;
    }
    function riammetti(esclusi, motivo) {
        var n = 0;
        for (var i = esclusi.length - 1; i >= 0; i--) {
            if (motivo && esclusi[i].motivo !== motivo) continue;
            if (esclusi[i].motivo === "BORIN") continue;
            try { esclusi[i].layer.visible = esclusi[i].eraVisibile; } catch (e) {}
            esclusi.splice(i, 1);
            n++;
        }
        return n;
    }
    function raccogliEsclusi(doc) {                       // i livelli nascosti in cima vanno in un gruppo spento in fondo
        var nascosti = [], i;
        for (i = 0; i < doc.layers.length; i++) if (!doc.layers[i].visible) nascosti.push(doc.layers[i]);
        if (!nascosti.length) return null;
        var g = doc.layerSets.add();
        g.name = NOME_ESCLUSI;
        inFondo(doc, g);
        for (i = nascosti.length - 1; i >= 0; i--) {
            try { mettiDentro(nascosti[i], g); } catch (e) {}
        }
        g.visible = false;
        return g;
    }

    // ============================================================ analisi: trasparenza del composito
    // Composito di ciò che si vede, su una copia unita del documento (l'originale in memoria non cambia).
    function analizzaAlpha(doc) {
        var tmp = null;
        try { tmp = doc.duplicate("BORIN analisi", true); } catch (e) { return {vuoto: true, trasparente: true}; }
        var W = px(tmp.width), H = px(tmp.height);
        try {
            app.activeDocument = tmp;
            if (!tmp.layers.length) return {vuoto: true, trasparente: true};
            var lay = tmp.layers[0];
            if (lay.isBackgroundLayer) return {vuoto: false, trasparente: false};
            tmp.activeLayer = lay;
            selezionaTrasparenza();
            var b = bordiSelezione(tmp);
            if (!b) return {vuoto: true, trasparente: true};
            tmp.selection.invert();
            var qualcosaTrasparente = bordiSelezione(tmp) !== null;
            if (!qualcosaTrasparente) return {vuoto: false, trasparente: false, bordi: b};
            var tocca = b.l <= 0 && b.t <= 0 && b.r >= W && b.b >= H;
            var lato = Math.max(2, Math.round(Math.min(W, H) * 0.01)), angoli = 0;
            var A = [[0, 0], [W - lato, 0], [0, H - lato], [W - lato, H - lato]];
            for (var i = 0; i < 4; i++) {
                selezionaTrasparenza();
                selezionaRett(tmp, A[i][0], A[i][1], A[i][0] + lato, A[i][1] + lato, SelectionType.INTERSECT);
                if (!bordiSelezione(tmp)) angoli++;
            }
            // Ritaglio scontornato: margini trasparenti, oppure almeno un angolo vuoto.
            return {vuoto: false, trasparente: !tocca || angoli > 0, bordi: b, angoliVuoti: angoli};
        } finally {
            try { tmp.close(SaveOptions.DONOTSAVECHANGES); } catch (e2) {}
            try { app.activeDocument = doc; } catch (e3) {}
        }
    }

    function decidi(cfg, an) {
        var modo = cfg.preparazione.modo, p, l, motivo = "";
        if (modo === "AUTO") {
            if (!an.multilivello) {
                p = an.alpha.trasparente ? "PRECUT" : "CUTOUT";
                l = "ACTIVE";
                motivo = an.alpha.trasparente ? "ha già la trasparenza" : "foto con sfondo";
            } else if (an.alpha.trasparente) {
                p = "PRECUT"; l = "PRESERVE";
                motivo = "file a livelli con trasparenza: livelli conservati";
            } else {
                p = "CUTOUT"; l = "PRESERVE";
                motivo = "file a livelli senza trasparenza: scontorno sul gruppo";
            }
        } else if (modo === "PSD") {
            p = "PRECUT"; l = "PRESERVE";
        } else {
            p = modo === "PRECUT" ? "PRECUT" : "CUTOUT";
            l = cfg.livelli.gestione || "ACTIVE";
        }
        return {preparazione: p, livelli: l, automatico: modo === "AUTO", motivo: motivo};
    }

    // ============================================================ soggetto
    function primoContenutoVisibile(cont) {
        for (var i = 0; i < cont.layers.length; i++) {
            var l = cont.layers[i];
            if (!l.visible) continue;
            if (l.typename === "LayerSet") { var x = primoContenutoVisibile(l); if (x) return x; }
            else if (!eRegolazione(l)) return l;
        }
        return null;
    }
    function soloQuesto(doc, soggetto) {                  // nasconde gli altri livelli con pixel
        var catena = {}, x = soggetto;
        while (x && x.typename !== "Document") { try { catena[x.id] = true; } catch (e) {} x = x.parent; }
        function visita(cont) {
            for (var i = 0; i < cont.layers.length; i++) {
                var l = cont.layers[i], id = -1;
                try { id = l.id; } catch (e2) {}
                if (catena[id]) { if (l.typename === "LayerSet") visita(l); }
                else if (l.visible && (l.typename === "LayerSet" || !eRegolazione(l))) l.visible = false;
            }
        }
        visita(doc);
    }
    function preparaSoggetto(doc, gestione) {
        var i, l;
        if (gestione === "PRESERVE") {
            var lista = [];
            for (i = 0; i < doc.layers.length; i++) if (doc.layers[i].visible) lista.push(doc.layers[i]);
            if (!lista.length) throw new Error("Nessun livello visibile da usare come soggetto.");
            var g = doc.layerSets.add();
            g.name = "Soggetto";
            g.move(lista[0], ElementPlacement.PLACEBEFORE);
            for (i = lista.length - 1; i >= 0; i--) mettiDentro(lista[i], g);
            return g;
        }
        if (gestione === "MERGE") {
            var vuoto = doc.artLayers.add();
            inCima(doc, vuoto);
            doc.activeLayer = vuoto;
            doc.mergeVisibleLayers();
            l = doc.activeLayer;
            l.name = "Soggetto composito";
            return l;
        }
        l = null;
        try { l = doc.activeLayer; } catch (e) {}
        if (!l || l.typename !== "ArtLayer" || !l.visible || eRegolazione(l)) l = primoContenutoVisibile(doc);
        if (!l) throw new Error("Nessun livello utilizzabile come soggetto.");
        soloQuesto(doc, l);
        return l;
    }

    // ============================================================ scontorno AI
    function scontorna(doc, sogg, cfg, R) {
        var C = cfg.scontorno, gruppo = sogg.typename === "LayerSet", ordine, fatto = null, ultimo = "";
        if (gruppo) ordine = ["SOGGETTO"];
        else ordine = C.metodo === "SFONDO" ? ["SFONDO", "SOGGETTO"] : ["SOGGETTO", "SFONDO"];
        var mascheraPrima = haMaschera(sogg);
        for (var i = 0; i < ordine.length && !fatto; i++) {
            try {
                deseleziona(doc);
                doc.activeLayer = sogg;
                if (ordine[i] === "SFONDO") {
                    if (mascheraPrima) throw new Error("il livello ha già una maschera");
                    rimuoviSfondoAI();
                    if (!haMaschera(sogg)) throw new Error("nessuna maschera creata");
                    selezioneDaMaschera();
                    eliminaMaschera(false);
                } else {
                    selezionaSoggettoAI();
                }
                if (!bordiSelezione(doc)) throw new Error("nessun soggetto trovato");
                fatto = ordine[i];
            } catch (e) {
                ultimo = testoErrore(e);
                deseleziona(doc);
            }
        }
        if (!fatto) throw new Error("Lo scontorno AI non ha trovato un soggetto chiaro (" + ultimo + ").");
        if (C.contrai > 0) doc.selection.contract(UnitValue(C.contrai, "px"));
        if (C.sfuma > 0) doc.selection.feather(C.sfuma);
        if (!bordiSelezione(doc)) throw new Error("Dopo la rifinitura del bordo non resta nulla: riduci «Contrai».");
        doc.activeLayer = sogg;
        if (mascheraPrima) {                              // c'era già una maschera: si tiene l'intersezione
            try { intersecaConMaschera(); } catch (e3) {}
            eliminaMaschera(false);
        }
        mascheraDaSelezione();
        deseleziona(doc);
        if (!C.mascheraModificabile && !gruppo) {
            doc.activeLayer = sogg;
            eliminaMaschera(true);
        }
        R.scontorno = fatto === "SFONDO" ? "Rimuovi sfondo" : "Seleziona soggetto";
    }

    // ============================================================ sagoma pulita: la base dell'ombra
    // Il v3 usava il riquadro del livello: pixel quasi invisibili (residui dello scontorno, riflessi), livelli
    // nascosti nei gruppi o effetti di livello lo allungavano e l'ombra finiva lontana dall'oggetto.
    function creaSagoma(doc, sogg, cfg, R) {
        var piatta = copiaAppiattita(doc, sogg, "__BORIN_COPIA");
        var ch = null, pulita = false;
        try {
            doc.activeLayer = piatta;
            selezionaTrasparenza();
            if (!bordiSelezione(doc)) throw new Error("Il soggetto non ha pixel visibili.");
            var soglia = limita(Math.round((cfg.ombra.sogliaAlpha || 50) * 2.55), 1, 254);
            var lato = Math.max(px(doc.width), px(doc.height));
            var raggio = Math.max(1, Math.round(lato / 2500));
            try {
                ch = doc.channels.add();
                ch.name = "__BORIN_SAGOMA";
                doc.selection.store(ch, SelectionType.REPLACE);
                deseleziona(doc);
                doc.activeChannels = [ch];
                sogliaCanale(soglia);                     // alpha sotto la soglia = trasparente
                filtroCanale("Mnm ", raggio);             // via i puntini isolati...
                filtroCanale("Mxm ", raggio);             // ...senza assottigliare il resto
                pulita = true;
            } catch (e) {
                R.avvisi.push("Pulizia della sagoma non riuscita, uso l'alpha originale: " + testoErrore(e));
            }
            try { doc.activeChannels = doc.componentChannels; } catch (e2) {}
            if (pulita) doc.selection.load(ch, SelectionType.REPLACE);
            else { doc.activeLayer = piatta; selezionaTrasparenza(); }
            if (!bordiSelezione(doc)) {                   // soggetto quasi tutto semitrasparente: alpha originale
                doc.activeLayer = piatta;
                selezionaTrasparenza();
                pulita = false;
            }
            var sag = doc.artLayers.add();
            sag.name = "__BORIN_SAGOMA";
            inCima(doc, sag);
            doc.activeLayer = sag;
            doc.selection.fill(colore(18, 18, 18), ColorBlendMode.NORMAL, 100, false);  // OMBRA_COLORE del v3
            deseleziona(doc);
            sag.visible = false;
            return {layer: sag, pulita: pulita};
        } finally {
            deseleziona(doc);
            try { doc.activeChannels = doc.componentChannels; } catch (e3) {}
            if (ch) { try { ch.remove(); } catch (e4) {} }
            rimuovi(piatta);
        }
    }

    function parteOpaca(doc, sag, l, t, r, b) {           // riquadro della parte opaca della sagoma dentro un rettangolo
        if (r - l < 1 || b - t < 1) return null;
        doc.activeLayer = sag;
        selezionaTrasparenza();
        selezionaRett(doc, l, t, r, b, SelectionType.INTERSECT);
        var x = bordiSelezione(doc);
        deseleziona(doc);
        return x;
    }
    function larghezzaFascia(doc, sag, y1, y2) { return parteOpaca(doc, sag, 0, y1, px(doc.width), y2); }

    function pezziDelProfilo(p) {                          // tratti pieni separati da tratti vuoti
        var out = [], i = 0;
        while (i < p.length) {
            while (i < p.length && p[i] === 0) i++;
            if (i >= p.length) break;
            var da = i, area = 0, max = 0;
            while (i < p.length && p[i] > 0) { area += p[i]; max = Math.max(max, p[i]); i++; }
            out.push({da: da, a: i, area: area, max: max});
        }
        return out;
    }

    // Copia ridotta della sagoma in un documento a parte: lì le misure per fasce costano pochissimo.
    function sagomaRidotta(doc, sag, lato) {
        var B = bordi(sag), l = Math.max(0, Math.floor(B.l)), t = Math.max(0, Math.floor(B.t));
        var r = Math.min(px(doc.width), Math.ceil(B.r)), b = Math.min(px(doc.height), Math.ceil(B.b));
        var mini = app.documents.add(UnitValue(px(doc.width), "px"), UnitValue(px(doc.height), "px"), 72, "BORIN sagoma",
            NewDocumentMode.RGB, DocumentFill.TRANSPARENT);
        app.activeDocument = doc;
        var copia = sag.duplicate(mini, ElementPlacement.PLACEATBEGINNING);
        app.activeDocument = mini;
        copia.visible = true;
        mini.crop([l, t, r, b]);
        var s = Math.min(1, lato / Math.max(r - l, b - t));
        if (s < 1) mini.resizeImage(UnitValue(Math.max(8, Math.round((r - l) * s)), "px"), undefined, 72, ResampleMethod.BILINEAR);
        appiattisciSuBianco(mini);                        // sagoma scura su bianco: le fasce si misurano con l'istogramma
        return {doc: mini, ox: l, oy: t, sx: px(mini.width) / (r - l), sy: px(mini.height) / (b - t)};
    }
    function scuriNellaFascia(md, l, t, r, b) {          // pixel della sagoma dentro il rettangolo
        if (r - l < 1 || b - t < 1) return 0;
        selezionaRett(md, l, t, r, b);
        var h = md.histogram, n = 0;
        for (var i = 0; i < 250; i++) n += h[i];
        return n;
    }

    // Pezzi staccati attorno all'oggetto (residui dello scontorno, puntini, riflessi sul piano): si tolgono dalla
    // sagoma, così non spostano né la centratura né l'appoggio dell'ombra. Un pezzo è un residuo se è separato da
    // righe (o colonne) vuote e la sua area è meno del 3 % di quella del pezzo principale: un accessorio vero è più grande, gli aloni li toglie già la soglia. L'immagine non cambia.
    function togliResidui(doc, sag, R) {
        var B0 = bordi(sag);
        if (B0.w < 16 || B0.h < 16) return 0;
        var W = px(doc.width), H = px(doc.height), tagli = [], sotto = 0, m = null;
        try {
            m = sagomaRidotta(doc, sag, 480);
            var md = m.doc, mw = px(md.width), mh = px(md.height), bianco = colore(255, 255, 255);
            for (var verso = 0; verso < 2; verso++) {      // 0 = righe (sopra e sotto), 1 = colonne (ai lati)
                var righe = verso === 0, lung = righe ? mh : mw, inizio = 0;
                if (lung < 8) continue;
                var N = limita(Math.round(lung / 5), 8, righe ? 56 : 40), passo = lung / N, p = [], i;
                for (i = 0; i < N; i++) {
                    var a = Math.floor(i * passo), c = Math.ceil((i + 1) * passo);
                    p.push(righe ? scuriNellaFascia(md, 0, a, mw, c) : scuriNellaFascia(md, a, 0, c, mh));
                }
                deseleziona(md);
                var pz = pezziDelProfilo(p);
                if (pz.length < 2) continue;
                var princ = pz[0];
                for (i = 1; i < pz.length; i++) if (pz[i].area > princ.area) princ = pz[i];
                for (i = 0; i < pz.length; i++) {
                    var z = pz[i];
                    if (z === princ || z.area >= 0.03 * princ.area) continue;
                    // Dal mezzo del vuoto prima al mezzo del vuoto dopo (o fino al bordo): solo il residuo.
                    var da = i > 0 ? (pz[i - 1].a + z.da) / 2 : -1e6, fino = i < pz.length - 1 ? (z.a + pz[i + 1].da) / 2 : 1e6;
                    var a1 = inizio + da * passo, a2 = inizio + fino * passo;
                    if (righe) {
                        selezionaRett(md, 0, Math.max(0, a1), mw, Math.min(mh, a2));
                        tagli.push([0, Math.max(0, Math.floor(m.oy + a1 / m.sy)), W, Math.min(H, Math.ceil(m.oy + a2 / m.sy))]);
                        if (z.da > princ.da) sotto++;
                    } else {
                        selezionaRett(md, Math.max(0, a1), 0, Math.min(mw, a2), mh);
                        tagli.push([Math.max(0, Math.floor(m.ox + a1 / m.sx)), 0, Math.min(W, Math.ceil(m.ox + a2 / m.sx)), H]);
                    }
                    md.selection.fill(bianco);          // anche nella copia, così il giro sulle colonne non lo rivede
                    deseleziona(md);
                }
            }
        } finally {
            if (m) { try { m.doc.close(SaveOptions.DONOTSAVECHANGES); } catch (e) {} }
            try { app.activeDocument = doc; } catch (e2) {}
        }
        for (var j = 0; j < tagli.length; j++) {
            var q4 = tagli[j];
            if (q4[2] - q4[0] < 1 || q4[3] - q4[1] < 1) continue;
            doc.activeLayer = sag;
            selezionaRett(doc, q4[0], q4[1], q4[2], q4[3]);
            doc.selection.clear();
            deseleziona(doc);
        }
        if (!haPixel(sag)) throw new Error("La pulizia della sagoma ha tolto tutto: spegni «Ignora i pezzi staccati».");
        if (tagli.length) R.avvisi.push("Ignorat" + (tagli.length === 1 ? "o un pezzo staccato" : "i " + tagli.length + " pezzi staccati") +
            " attorno all'oggetto" + (sotto ? ", anche sotto la base" : "") +
            " (residui dello scontorno?): centratura e ombra seguono l'oggetto vero. Nell'immagine restano: controlla la maschera nel PSD.");
        return tagli.length;
    }

    // Piano d'appoggio reale (idea del v7): la fascia più bassa larga almeno il 55 % della più larga vicino alla
    // base. Serve quando sotto la base pendono cavi o leve. Il v7 guardava solo il 5,5 % più basso dell'oggetto:
    // qui si guarda fino al 25 %, così anche un cavo lungo viene riconosciuto.
    function pianoAppoggio(doc, sag, k) {
        var B = bordi(sag), alt = B.h, larg = B.w;
        if (alt < 20) return null;
        var fascia = Math.round(limita(alt * 0.006, 10 * k, 34 * k));
        var prof = Math.round(limita(alt * 0.25, 60 * k, 1400 * k));
        var passi = Math.max(1, Math.min(32, Math.ceil(prof / Math.max(fascia, 1))));
        var passo = prof / passi, misure = [], maxW = 0, i;
        for (i = 0; i <= passi; i++) {
            var yInf = B.b - i * passo, ySup = yInf - fascia;
            if (yInf <= B.t) break;
            var m = larghezzaFascia(doc, sag, Math.round(ySup), Math.round(yInf));
            misure.push(m);
            if (m && m.w > maxW) maxW = m.w;
        }
        if (maxW <= 0) return null;
        var minimo = Math.max(18 * k, larg * 0.06), soglia = Math.max(minimo, maxW * 0.55), scelta = null;
        for (i = 0; i < misure.length; i++) if (misure[i] && misure[i].w >= soglia) { scelta = misure[i]; break; }
        if (!scelta) return null;
        var y = limita(scelta.b, B.b - prof, B.b), correzione = B.b - y;
        if (correzione <= 1 || correzione > alt * 0.25 || scelta.w < minimo) return null;
        return {y: y, correzione: Math.round(correzione), larghezza: Math.round(scelta.w)};
    }

    // ============================================================ composizione: ritaglio + scala + tela, senza spostare livelli
    function metodoRicampionamento(s, cfg) {
        if (s > 1 && cfg.posizione.qualita === "DETTAGLI") {
            try { return ResampleMethod.PRESERVEDETAILS; } catch (e) {}
        }
        if (s < 1 && cfg.posizione.qualita === "NITIDA") return ResampleMethod.BICUBICSHARPER;
        return ResampleMethod.BICUBICAUTOMATIC;
    }

    function componi(doc, cfg, box, R) {
        var P = cfg.posizione, W = Math.round(cfg.tela.larghezza), H = Math.round(cfg.tela.altezza);
        var dw = px(doc.width), dh = px(doc.height), kRif = Math.sqrt(W * H) / RIF;
        var s = 1, cx = dw / 2, cy = dh / 2, yc = 0;
        if (P.modo === "CENTRA") {
            var f = limita(P.riempimento, 1, 100) / 100;
            if (P.ridimensiona) s = Math.min(W * f / box.w, H * f / box.h);
            if (P.centraX) cx = (box.l + box.r) / 2;
            if (P.centraY) { cy = (box.t + box.b) / 2; yc = (P.correzioneY || 0) * H / RIF; }
        } else if (P.modo === "COMPOSIZIONE") {
            s = Math.min(W / dw, H / dh) * limita(P.adatta || 100, 1, 100) / 100;
        }
        if (!(s > 0) || !isFinite(s)) throw new Error("Scala non valida: il soggetto è vuoto?");
        // Finestra finale espressa nelle coordinate del documento attuale.
        var fw = W / s, fh = H / s, fl = cx - fw / 2, ft = cy - (H / 2 + yc) / s;
        if (P.modo === "CENTRA") {                        // l'oggetto resta dentro la tela, con un margine
            var m = (P.margine || 0) * kRif / s;
            if (box.h + 2 * m <= fh) {
                if (box.t - ft < m) ft = box.t - m;
                if (ft + fh - box.b < m) ft = box.b + m - fh;
            }
            if (box.w + 2 * m <= fw) {
                if (box.l - fl < m) fl = box.l - m;
                if (fl + fw - box.r < m) fl = box.r + m - fw;
            }
        }
        // 1) ritaglio preventivo dentro il documento: meno memoria prima di ingrandire
        var cl = Math.max(0, Math.floor(fl)), ct = Math.max(0, Math.floor(ft));
        var cr = Math.min(dw, Math.ceil(fl + fw)), cb = Math.min(dh, Math.ceil(ft + fh));
        if (cr - cl < 1 || cb - ct < 1) throw new Error("Il soggetto è fuori dalla tela.");
        if (cl > 0 || ct > 0 || cr < dw || cb < dh) {
            doc.crop([cl, ct, cr, cb]);
            fl -= cl; ft -= ct;
        }
        // 2) una sola scala per tutto il documento (un solo ricampionamento)
        var w0 = px(doc.width), h0 = px(doc.height), sx = 1, sy = 1;
        if (Math.abs(s - 1) > 0.0005) {
            doc.resizeImage(UnitValue(Math.max(1, Math.round(w0 * s)), "px"), undefined, cfg.tela.dpi, metodoRicampionamento(s, cfg));
            sx = px(doc.width) / w0; sy = px(doc.height) / h0;
        }
        fl *= sx; ft *= sy;
        // 3) margine trasparente se la finestra esce dal documento
        var w1 = px(doc.width), h1 = px(doc.height);
        var pad = Math.ceil(Math.max(0, -fl, -ft, fl + W - w1, ft + H - h1));
        if (pad > 0) {
            pad += 2;
            doc.resizeCanvas(UnitValue(w1 + 2 * pad, "px"), UnitValue(h1 + 2 * pad, "px"), AnchorPosition.MIDDLECENTER);
            fl += pad; ft += pad;
        }
        // 4) ritaglio esatto alla tela finale
        var L = Math.round(fl), T = Math.round(ft);
        doc.crop([L, T, L + W, T + H]);
        if (Math.round(px(doc.width)) !== W || Math.round(px(doc.height)) !== H) {
            doc.resizeCanvas(UnitValue(W, "px"), UnitValue(H, "px"), AnchorPosition.MIDDLECENTER);
        }
        doc.resizeImage(undefined, undefined, cfg.tela.dpi, ResampleMethod.NONE);
        R.scala = Math.round(s * 1000) / 1000;
        var volte = String(Math.round(s * 10) / 10).replace(".", ",");
        if (s > 4) R.avvisi.push("Immagine molto piccola: ingrandita " + volte + " volte, la qualità sarà morbida.");
        else if (s > 2) R.avvisi.push("Immagine piccola: ingrandita " + volte + " volte: controlla la nitidezza.");
    }

    // ============================================================ ombra (parametri del v3, proporzionati alla tela)
    // mD e mC moltiplicano la sfocatura di diffusa e contatto. Nel v3 alle misure normali i limiti min/max non
    // intervenivano e tutti gli stili avevano la stessa sfocatura: «Premium» non era più morbida della Standard.
    // La Standard resta identica al v3.
    function stileOmbra(stile) {
        if (stile === "DELICATA") return {dB: 0.28, dSX: 103, dSY: 11, dO: 12, dBmin: 24, dBmax: 68, cB: 0.10, cSX: 98, cSY: 18, cO: 24, cBmin: 8, cBmax: 26, mD: 1.25, mC: 1.15};
        if (stile === "PREMIUM") return {dB: 0.35, dSX: 104, dSY: 12, dO: 16, dBmin: 26, dBmax: 72, cB: 0.11, cSX: 97, cSY: 18, cO: 30, cBmin: 7, cBmax: 24, mD: 1.35, mC: 1.1};
        if (stile === "CONTATTO") return {dB: 0.26, dSX: 101, dSY: 10, dO: 11, dBmin: 18, dBmax: 52, cB: 0.10, cSX: 98, cSY: 25, cO: 48, cBmin: 5, cBmax: 16, mD: 0.9, mC: 0.85};
        return {dB: 0.32, dSX: 102, dSY: 14, dO: 18, dBmin: 18, dBmax: 58, cB: 0.12, cSX: 98, cSY: 22, cO: 34, cBmin: 6, cBmax: 22, mD: 1, mC: 1};
    }
    function sfocature(st, B, k) {                         // B: riquadro dell'oggetto intero
        var dimRif = Math.max(B.w, B.h);
        return {
            d: limita(dimRif * 0.010 * st.mD, st.dBmin * k, st.dBmax * k),
            c: limita(dimRif * 0.0038 * st.mC, st.cBmin * k, st.cBmax * k)
        };
    }
    function tieniBandaBassa(doc, layer, perc, minPx, maxPx, yFondo) {
        var b = bordi(layer), fondo = (yFondo === undefined) ? b.b : yFondo, alt = fondo - b.t;
        if (alt <= 0) return;
        var banda = limita(alt * perc, minPx, maxPx), yTaglio = fondo - banda;
        doc.activeLayer = layer;
        if (yTaglio > b.t) { selezionaRett(doc, 0, 0, px(doc.width), yTaglio); doc.selection.clear(); deseleziona(doc); }
        if (fondo < b.b) { selezionaRett(doc, 0, fondo, px(doc.width), px(doc.height)); doc.selection.clear(); deseleziona(doc); }
    }
    function allineaAlSuolo(layer, y, scarto) {
        var b = bordi(layer);
        layer.translate(0, Math.round((y + scarto) - b.b));
    }
    function haPixel(layer) { try { var b = bordi(layer); return b.w > 1 && b.h > 1; } catch (e) { return false; } }

    // Diffusa sotto il contatto, metodo di fusione Moltiplica, unite in un livello se richiesto (come nel v3).
    function finisciOmbra(doc, d, c, st, f, sf, O, nome) {
        d.applyGaussianBlur(sf.d);
        d.blendMode = BlendMode.MULTIPLY;
        d.opacity = Math.min(100, st.dO * f);
        if (c && haPixel(c)) {
            c.applyGaussianBlur(sf.c);
            c.blendMode = BlendMode.MULTIPLY;
            c.opacity = Math.min(100, st.cO * f);
            if (O.unisci) { doc.activeLayer = c; var u = c.merge(); u.name = nome; }
        } else {
            rimuovi(c);
            if (O.unisci) d.name = nome;
        }
    }

    function creaOmbra(doc, sogg, sag, cfg, R) {
        var O = cfg.ombra;
        if (!(limita(O.intensita, 0, 200) > 0)) return null;        // intensità 0: nessun livello vuoto nel PSD
        if (O.segui === false) return creaOmbraDritta(doc, sogg, sag, cfg, R);
        try { return creaOmbraSegue(doc, sogg, sag, cfg, R); }
        catch (e) {
            R.avvisi.push("L'ombra che segue la base non è riuscita (" + testoErrore(e) + "): uso quella dritta.");
            ripulisciOmbra(doc, O.nomeLivello || "Ombra_Adattiva_Unificata");
            return creaOmbraDritta(doc, sogg, sag, cfg, R);
        }
    }
    function ripulisciOmbra(doc, nome) {                  // livelli d'ombra rimasti a metà da un tentativo fallito
        deseleziona(doc);
        for (var i = doc.artLayers.length - 1; i >= 0; i--) {
            try { if (doc.artLayers[i].name.indexOf(nome) === 0) doc.artLayers[i].remove(); } catch (e) {}
        }
    }

    // L'ombra del v3: la parte bassa della sagoma schiacciata in verticale verso una riga orizzontale.
    function creaOmbraDritta(doc, sogg, sag, cfg, R) {
        var O = cfg.ombra, st = stileOmbra(O.stile), f = limita(O.intensita, 0, 200) / 100;
        var W = px(doc.width), H = px(doc.height), k = Math.sqrt(W * H) / RIF;
        var B = bordi(sag);
        if (B.w < 2 || B.h < 2) return null;
        var piano = O.appoggioReale ? pianoAppoggio(doc, sag, k) : null;
        var suolo = piano ? piano.y : B.b, alt = B.h, sf = sfocature(st, B, k);
        var offD = limita(alt * 0.0030, 2 * k, 14 * k);
        var offC = limita(alt * 0.0012, 0, 6 * k);
        var nome = O.nomeLivello || "Ombra_Adattiva_Unificata";
        // Con il piano reale le parti sotto il piano (cavi, leve) restano fuori dall'ombra.
        var fondoBanda = piano ? Math.min(B.b, piano.y + Math.max(4 * k, 6)) : B.b;

        var d = sag.duplicate(sogg, ElementPlacement.PLACEAFTER);
        d.visible = true; d.name = nome + "_Diffusa";
        tieniBandaBassa(doc, d, st.dB, 80 * k, 1400 * k, fondoBanda);
        if (!haPixel(d)) { rimuovi(d); return null; }
        d.resize(st.dSX, st.dSY, AnchorPosition.BOTTOMCENTER);
        allineaAlSuolo(d, suolo, offD);

        var c = sag.duplicate(sogg, ElementPlacement.PLACEAFTER);   // sopra la diffusa, come nel v3
        c.visible = true; c.name = nome + "_Contatto";
        tieniBandaBassa(doc, c, st.cB, 35 * k, 520 * k, fondoBanda);
        if (haPixel(c)) {
            c.resize(st.cSX, st.cSY, AnchorPosition.BOTTOMCENTER);
            allineaAlSuolo(c, suolo, offC);
        }
        finisciOmbra(doc, d, c, st, f, sf, O, nome);
        return {
            suolo: Math.round(suolo), baseOggetto: Math.round(B.b), pianoReale: !!piano,
            correzione: piano ? piano.correzione : 0, sfocatura: Math.round(sf.d), sagomaPulita: true, segue: false
        };
    }

    // ============================================================ ombra che segue la base (8.1)
    // Il v3 schiaccia in verticale la parte bassa della sagoma verso una riga orizzontale sotto il punto più basso.
    // Con la base ad angolo (prodotto di tre quarti) l'ombra restava dritta e i piedini dietro sospesi; con più pezzi in
    // diagonale c'era ombra solo sotto il pezzo più basso. Qui la stessa fascia si schiaccia, colonna per colonna, verso
    // il «pavimento» di ogni pezzo: la linea che unisce i suoi punti d'appoggio (il bordo inferiore dell'involucro
    // convesso) con le pendenze vere, fino a 40°. I tratti più ripidi (la canna di una pistola in aria) non sono
    // appoggio; le parti sottili che pendono sotto la base (un cavo) si ignorano. Con la base dritta è l'ombra del v3.
    var PENDENZA_MAX = 1.0;                               // tan 45°
    var LATO_PROFILO = 640;                               // lato lungo della copia ridotta su cui si misura la base

    // Copia ridotta della sagoma salvata in RAW (un byte per pixel, scuro = oggetto) e riletta qui.
    function leggiSagoma(doc, sag, lato) {
        var m = sagomaRidotta(doc, sag, lato), md = m.doc, f = null;
        try {
            app.activeDocument = md;
            md.changeMode(ChangeMode.GRAYSCALE);
            f = new File(Folder.temp.fsName + "/borin_sagoma_" + ora() + "_" + (++CONTATORE) + ".raw");
            md.saveAs(f, new RawSaveOptions(), true, Extension.LOWERCASE);
            var w = Math.round(px(md.width)), h = Math.round(px(md.height));
            f.encoding = "BINARY";
            if (!f.open("r")) throw new Error("copia della sagoma non leggibile");
            var s = f.read();
            f.close();
            if (s.length < w * h) throw new Error("copia della sagoma incompleta (" + s.length + " byte su " + (w * h) + ")");
            return {w: w, h: h, s: s, ox: m.ox, oy: m.oy, sx: m.sx, sy: m.sy};
        } finally {
            try { md.close(SaveOptions.DONOTSAVECHANGES); } catch (e) {}
            if (f) { try { f.remove(); } catch (e2) {} }
            try { app.activeDocument = doc; } catch (e3) {}
        }
    }

    // Pezzi staccati (8-connessi) e, per ognuno, la riga più bassa di ogni colonna.
    function pezziSagoma(S) {
        var w = S.w, h = S.h, runs = [], padre = [], inizio = [], y, j, k;
        function radice(a) { while (padre[a] !== a) { padre[a] = padre[padre[a]]; a = padre[a]; } return a; }
        for (y = 0; y < h; y++) {
            var riga = S.s.substr(y * w, w), re = /[\x00-\x7f]+/g, m, da = runs.length;
            while ((m = re.exec(riga)) !== null) { padre.push(runs.length); runs.push({y: y, a: m.index, b: m.index + m[0].length - 1}); }
            inizio.push(da);
            if (y > 0) {
                j = inizio[y - 1]; k = da;
                while (j < da && k < runs.length) {
                    var A = runs[j], C = runs[k];
                    if (A.b + 1 >= C.a && C.b + 1 >= A.a) { var ra = radice(j), rc = radice(k); if (ra !== rc) padre[rc] = ra; }
                    if (A.b < C.b) j++; else k++;
                }
            }
        }
        var mappa = {}, pezzi = [], i, x;
        for (i = runs.length - 1; i >= 0; i--) {           // dal basso: il primo run che copre una colonna ne è il fondo
            var r = runs[i], id = radice(i), p = mappa[id];
            if (!p) { p = mappa[id] = {x0: r.a, x1: r.b, y0: r.y, y1: r.y, area: 0, fondo: {}, cima: {}, pieni: {}}; pezzi.push(p); }
            p.area += r.b - r.a + 1;
            if (r.a < p.x0) p.x0 = r.a;
            if (r.b > p.x1) p.x1 = r.b;
            if (r.y < p.y0) p.y0 = r.y;
            for (x = r.a; x <= r.b; x++) {
                if (p.fondo[x] === undefined) { p.fondo[x] = r.y; p.pieni[x] = 0; }
                p.cima[x] = r.y;                               // si sale: l'ultimo run visto è il più alto
                p.pieni[x]++;
            }
        }
        pezzi.sort(function (a, b) { return b.area - a.area; });
        return pezzi;
    }

    // Un pezzo minore «pende» sopra quello grande se, dove si sovrappongono, il suo fondo sta ben più in alto.
    function pendeSopra(p, g) {
        var sopra = 0, tot = 0, soglia = 0.05 * (g.y1 - g.y0 + 1);
        for (var x = Math.max(p.x0, g.x0); x <= Math.min(p.x1, g.x1); x++) {
            if (p.fondo[x] === undefined || g.fondo[x] === undefined) continue;
            tot++;
            if (p.fondo[x] < g.fondo[x] - soglia) sopra++;
        }
        return tot > 0 && sopra >= 0.5 * tot;
    }

    // Pavimento di un pezzo, in pixel della tela: per ogni colonna la Y della linea d'appoggio.
    function pavimentoPezzo(p, S, yPiano) {
        var n = p.x1 - p.x0 + 1, X = [], Y = [], F = [], i, j;
        for (i = 0; i < n; i++) {
            X.push(S.ox + (p.x0 + i + 0.5) / S.sx);
            Y.push(S.oy + (p.fondo[p.x0 + i] + 1) / S.sy);
        }
        var P = {X: X, Y: Y, F: F, colonna: 1 / S.sx, alt: (p.y1 - p.y0 + 1) / S.sy, larg: n / S.sx, inclinato: false, punte: 0};
        if (yPiano !== null && yPiano !== undefined) {   // appoggio reale: piano orizzontale trovato dal motore
            for (i = 0; i < n; i++) F.push(yPiano);
            return P;
        }
        // parti sottili che pendono (cavi): «apertura» del profilo con una finestra dell'1,2 % della larghezza
        var r = Math.max(1, Math.round(n * 0.006)), e = [], Yh = [];
        for (i = 0; i < n; i++) { var mn = Infinity; for (j = Math.max(0, i - r); j <= Math.min(n - 1, i + r); j++) if (Y[j] < mn) mn = Y[j]; e.push(mn); }
        for (i = 0; i < n; i++) {
            var mx = -Infinity;
            for (j = Math.max(0, i - r); j <= Math.min(n - 1, i + r); j++) if (e[j] > mx) mx = e[j];
            if (Y[i] - mx > 0.08 * P.alt) { Yh.push(mx); P.punte++; } else Yh.push(Y[i]);
        }
        // bordo inferiore dell'involucro convesso (Y cresce verso il basso)
        var Hc = [];
        for (i = 0; i < n; i++) {
            while (Hc.length >= 2) {
                var a = Hc[Hc.length - 2], b = Hc[Hc.length - 1];
                if ((X[b] - X[a]) * (Yh[i] - Yh[a]) - (Yh[b] - Yh[a]) * (X[i] - X[a]) >= 0) Hc.pop(); else break;
            }
            Hc.push(i);
        }
        // Il pavimento parte dal punto più basso e prosegue, a destra e a sinistra, lungo l'involucro finché i tratti sono
        // appoggi veri: quasi piani, oppure inclinati fino a 40°, lunghi almeno il 12 % del pezzo e diretti verso un
        // appoggio. Un appoggio è l'estremità del pezzo o un punto più basso dei vicini (piedino, gamba, spigolo) con
        // l'oggetto pieno sopra di sé: un tubo che pende ad ansa o una curva che sale non lo sono.
        for (i = 0; i < n; i++) F.push(null);
        var win = Math.max(2, Math.round(n * 0.008)), tol = 0.004 * P.alt;
        function sopra(v) {                                   // sopra la colonna v: altezza dell'oggetto (px) e quanto è pieno (0–1)
            var m = {alto: 0, pieno: 0};
            for (var q = Math.max(0, v - 1); q <= Math.min(n - 1, v + 1); q++) {
                var x = p.x0 + q, alto = p.fondo[x] - p.cima[x] + 1;
                if (alto > 0 && p.pieni[x] / alto >= m.pieno) m = {alto: alto / S.sy, pieno: p.pieni[x] / alto};
            }
            return m;
        }
        // Appoggio: sopra c'è l'oggetto pieno per almeno un quarto della sua altezza (piedino o gamba che sale nel corpo,
        // spigolo di un mobile), e il punto è più basso dei vicini o è l'estremità del pezzo. Un serbatoio appeso di
        // lato o l'ansa di un tubo non lo sono.
        function appoggio(v) {
            var m = sopra(v);
            if (m.pieno < 0.6 || m.alto < 0.25 * P.alt) return false;
            if (v === 0 || v === n - 1) return true;
            for (var q = Math.max(0, v - win); q <= Math.min(n - 1, v + win); q++) if (Yh[q] > Yh[v] + tol) return false;
            return true;
        }
        // Dal punto più basso si salta, a destra e a sinistra, al vertice dell'involucro più lontano che è ancora
        // pavimento: la linea dritta fino a lì non supera i 40° e passa vicino a tutti i vertici in mezzo (entro il 2 %
        // dell'altezza: gli spigoli arrotondati di un piedino o le gobbe di una lancia non fermano niente); se è
        // inclinata, è lunga almeno il 12 % del pezzo e arriva su un appoggio. Poi si riparte da lì.
        var devMin = 0.02 * P.alt + 2 / S.sy;
        function riempi(a, b) {                                  // a < b, indici nell'involucro: F lungo i vertici
            for (var t = a; t < b; t++) {
                var u = Hc[t], v = Hc[t + 1], ddx = Math.max(X[v] - X[u], 1e-6);
                for (var q = u; q <= v; q++) F[q] = Yh[u] + (Yh[v] - Yh[u]) * (X[q] - X[u]) / ddx;
            }
        }
        function salto(da, verso) {
            for (var v = verso > 0 ? Hc.length - 1 : 0; v !== da; v -= verso) {
                var a = Math.min(da, v), b = Math.max(da, v), ia = Hc[a], ib = Hc[b];
                var dx = Math.max(X[ib] - X[ia], 1e-6), dy = Yh[ib] - Yh[ia], pd = Math.abs(dy) / dx, ok = pd <= PENDENZA_MAX;
                var devMax = devMin + 0.02 * Math.sqrt(dx * dx + dy * dy);
                for (var t = a + 1; t < b && ok; t++) if (Yh[Hc[t]] - (Yh[ia] + dy * (X[Hc[t]] - X[ia]) / dx) > devMax) ok = false;
                // un pezzo lungo e dritto (una lancia distesa) è pavimento da un capo all'altro anche senza «appoggi»
                var disteso = dx >= 0.9 * P.larg;
                if (ok && pd > 0.04 && (dx < 0.12 * P.larg || !(disteso || appoggio(Hc[v])))) ok = false;
                if (!ok) continue;
                if (pd > 0.04) P.inclinato = true;
                riempi(a, b);
                return v;
            }
            return -1;
        }
        var jMin = 0, jj, v2;
        for (j = 1; j < Hc.length; j++) if (Yh[Hc[j]] > Yh[Hc[jMin]]) jMin = j;
        F[Hc[jMin]] = Yh[Hc[jMin]];
        for (jj = jMin; jj < Hc.length - 1 && (v2 = salto(jj, 1)) >= 0;) jj = v2;
        for (jj = jMin; jj > 0 && (v2 = salto(jj, -1)) >= 0;) jj = v2;
        // colonne senza appoggio: in orizzontale dal tratto più vicino, o in linea fra due tratti se non è ripida
        var basso = -Infinity;
        for (i = 0; i < n; i++) if (Yh[i] > basso) basso = Yh[i];
        var sx = -1;
        for (i = 0; i <= n; i++) {
            if (i < n && F[i] === null) continue;
            if (i - sx > 1) {                                // buco da sx+1 a i-1
                for (j = sx + 1; j < i; j++) {
                    if (sx < 0 && i >= n) F[j] = basso;
                    else if (sx < 0) F[j] = F[i];
                    else if (i >= n) F[j] = F[sx];
                    else {
                        var pend2 = Math.abs(F[i] - F[sx]) / Math.max(X[i] - X[sx], 1e-6);
                        F[j] = pend2 <= PENDENZA_MAX ? F[sx] + (F[i] - F[sx]) * (X[j] - X[sx]) / (X[i] - X[sx]) : (j - sx <= i - j ? F[sx] : F[i]);
                    }
                }
            }
            sx = i;
        }
        return P;
    }

    // Fascia bassa di un pezzo schiacciata verso il suo pavimento: «tieniBandaBassa» + «resize» del v3, colonna per colonna.
    // In ogni colonna la fascia va dal fondo del pezzo (D sopra il pavimento) all'altezza «banda»: schiacciata diventa
    // [F - s·banda, F - s·D], più lo scarto verso il basso. Restituisce i poligoni da riempire.
    function poligoniFascia(P, perc, minPx, maxPx, s, largX, scarto) {
        var n = P.X.length, banda = limita(P.alt * perc, minPx, maxPx), D = [], i, a = -1, b = -1, poli = [];
        for (i = 0; i < n; i++) {
            var d = Math.max(0, P.F[i] - P.Y[i]);
            D.push(d <= banda ? d : -1);
            if (D[i] >= 0) { if (a < 0) a = i; b = i; }
        }
        if (a < 0) return poli;
        var cx = (P.X[a] + P.X[b]) / 2, kx = largX / 100, mezza = P.colonna / 2;
        function xx(v) { return Math.round((cx + (v - cx) * kx) * 10) / 10; }
        function yy(v) { return Math.round(v * 10) / 10; }
        i = 0;
        while (i < n) {
            if (D[i] < 0) { i++; continue; }
            var da = i;
            while (i < n && D[i] >= 0) i++;
            var fino = i - 1, sotto = [], sopra = [], c;
            for (c = da; c <= fino; c++) {
                var E = P.F[c] - s * D[c] + scarto, T = P.F[c] - s * banda + scarto;
                if (c === da) { sotto.push([xx(P.X[c] - mezza), yy(E)]); sopra.push([xx(P.X[c] - mezza), yy(T)]); }
                sotto.push([xx(P.X[c]), yy(E)]); sopra.push([xx(P.X[c]), yy(T)]);
                if (c === fino) { sotto.push([xx(P.X[c] + mezza), yy(E)]); sopra.push([xx(P.X[c] + mezza), yy(T)]); }
            }
            var punti = semplifica(sotto).concat(semplifica(sopra).reverse());
            if (punti.length >= 3) poli.push(punti);
        }
        return poli;
    }
    function semplifica(l) {                               // toglie i punti allineati (meno di 0,3 px dalla retta)
        if (l.length < 3) return l;
        var out = [l[0]];
        for (var i = 1; i < l.length - 1; i++) {
            var a = out[out.length - 1], b = l[i], c = l[i + 1], dx = c[0] - a[0], dy = c[1] - a[1], L = Math.sqrt(dx * dx + dy * dy);
            if (L > 0 && Math.abs((b[0] - a[0]) * dy - (b[1] - a[1]) * dx) / L < 0.3) continue;
            out.push(b);
        }
        out.push(l[l.length - 1]);
        return out;
    }
    function livelloDaPoligoni(doc, sogg, sag, poligoni, nome) {
        if (!poligoni.length) return null;
        var l = sag.duplicate(sogg, ElementPlacement.PLACEAFTER);   // stessa posizione delle ombre del v3
        l.visible = true; l.name = nome;
        doc.activeLayer = l;
        doc.selection.selectAll(); doc.selection.clear(); deseleziona(doc);
        for (var i = 0; i < poligoni.length; i++) doc.selection.select(poligoni[i], i ? SelectionType.EXTEND : SelectionType.REPLACE, 0, true);
        doc.selection.fill(colore(18, 18, 18), ColorBlendMode.NORMAL, 100, false);   // OMBRA_COLORE del v3
        deseleziona(doc);
        if (!haPixel(l)) { rimuovi(l); return null; }
        return l;
    }

    function creaOmbraSegue(doc, sogg, sag, cfg, R) {
        var O = cfg.ombra, st = stileOmbra(O.stile), f = limita(O.intensita, 0, 200) / 100;
        var W = px(doc.width), H = px(doc.height), k = Math.sqrt(W * H) / RIF;
        var B = bordi(sag);
        if (B.w < 2 || B.h < 2) return null;
        var S = leggiSagoma(doc, sag, LATO_PROFILO), pezzi = pezziSagoma(S);
        if (!pezzi.length) return null;
        // Più pezzi simili (un kit, due prodotti): ognuno ha la sua ombra. Con un pezzo che domina, gli altri l'hanno
        // solo se non stanno sospesi sopra il suo fondo (un tubo staccato dallo scontorno non deve fare ombra a mezz'aria).
        var g = pezzi[0], gruppo = pezzi.length > 1 && pezzi[1].area >= 0.25 * g.area, scelti = [], i;
        for (i = 0; i < pezzi.length; i++) {
            var p = pezzi[i];
            if (p.area < 0.03 * g.area) continue;
            if (p !== g && !gruppo && pendeSopra(p, g)) continue;
            scelti.push(p);
        }
        var piano = (O.appoggioReale && scelti.length === 1) ? pianoAppoggio(doc, sag, k) : null;
        var poliD = [], poliC = [], suolo = -Infinity, inclinata = false, punte = 0;
        for (i = 0; i < scelti.length; i++) {
            var P = pavimentoPezzo(scelti[i], S, piano ? piano.y : null);
            var offD = limita(P.alt * 0.0030, 2 * k, 14 * k), offC = limita(P.alt * 0.0012, 0, 6 * k);
            poliD = poliD.concat(poligoniFascia(P, st.dB, 80 * k, 1400 * k, st.dSY / 100, st.dSX, offD));
            poliC = poliC.concat(poligoniFascia(P, st.cB, 35 * k, 520 * k, st.cSY / 100, st.cSX, offC));
            for (var c = 0; c < P.F.length; c++) if (P.F[c] > suolo) suolo = P.F[c];
            if (P.inclinato) inclinata = true;
            punte += P.punte;
        }
        var nome = O.nomeLivello || "Ombra_Adattiva_Unificata";
        var d = livelloDaPoligoni(doc, sogg, sag, poliD, nome + "_Diffusa");
        if (!d) return null;
        var cc = livelloDaPoligoni(doc, sogg, sag, poliC, nome + "_Contatto");   // sopra la diffusa, come nel v3
        finisciOmbra(doc, d, cc, st, f, sfocature(st, B, k), O, nome);
        if (punte && !piano) R.avvisi.push("Una parte sottile pende sotto la base (un cavo?): l'ombra la ignora e resta sotto l'oggetto.");
        return {
            suolo: Math.round(suolo), baseOggetto: Math.round(B.b), pianoReale: !!piano, correzione: piano ? piano.correzione : 0,
            sfocatura: Math.round(sfocature(st, B, k).d), sagomaPulita: true, segue: true, pezzi: scelti.length, inclinata: inclinata,
            cavoIgnorato: punte > 0 && !piano
        };
    }

    // ============================================================ i livelli colore BORIN (dall'azione «Color+Curve_Imm Sito Borin»)
    function mappaSfumatura(doc, opacita) {
        if (doc.layers.length > 0) doc.activeLayer = doc.layers[0];
        var dMk = new ActionDescriptor(), rMk = new ActionReference();
        rMk.putClass(cID("AdjL"));
        dMk.putReference(cID("null"), rMk);
        var dAdj = new ActionDescriptor(), dMap = new ActionDescriptor();
        try { dMap.putEnumerated(sID("gradientsInterpolationMethod"), sID("gradientInterpolationMethodType"), cID("Smoo")); } catch (e) {}
        var dGr = new ActionDescriptor();
        dGr.putString(cID("Nm  "), "BORIN 26");
        dGr.putEnumerated(cID("GrdF"), cID("GrdF"), cID("CstS"));
        dGr.putDouble(cID("Intr"), 4096.0);
        var stops = new ActionList();
        function stop(r, g, b, pos) {
            var s = new ActionDescriptor(), c = new ActionDescriptor();
            c.putDouble(cID("Rd  "), r); c.putDouble(cID("Grn "), g); c.putDouble(cID("Bl  "), b);
            s.putObject(cID("Clr "), cID("RGBC"), c);
            s.putEnumerated(cID("Type"), cID("Clry"), cID("UsrS"));
            s.putInteger(cID("Lctn"), pos);
            s.putInteger(cID("Mdpn"), 50);
            stops.putObject(cID("Clrt"), s);
        }
        stop(31.99951171875, 41.999359130859375, 63.0029296875, 0);            // #202a3f
        stop(53.003082275390625, 119.9981689453125, 163.00140380859375, 2173); // #3578a3
        stop(233.99642944335938, 231.9964599609375, 233.00033569335938, 4096); // #eae8e9
        dGr.putList(cID("Clrs"), stops);
        var trasp = new ActionList();
        function stopT(pos) {
            var s = new ActionDescriptor();
            s.putUnitDouble(cID("Opct"), cID("#Prc"), 100.0);
            s.putInteger(cID("Lctn"), pos);
            s.putInteger(cID("Mdpn"), 50);
            trasp.putObject(cID("TrnS"), s);
        }
        stopT(0); stopT(4096);
        dGr.putList(cID("Trns"), trasp);
        dMap.putObject(cID("Grad"), cID("Grdn"), dGr);
        dAdj.putObject(cID("Type"), cID("GdMp"), dMap);
        dMk.putObject(cID("Usng"), cID("AdjL"), dAdj);
        executeAction(cID("Mk  "), dMk, DialogModes.NO);
        var l = doc.activeLayer;
        l.name = "-MAPPA SFUMATURA";
        l.blendMode = BlendMode.SOFTLIGHT;
        l.opacity = opacita;
        inCima(doc, l);
        return l;
    }

    function tonalitaSaturazione(doc, C) {
        if (doc.layers.length > 0) doc.activeLayer = doc.layers[0];
        var dMk = new ActionDescriptor(), rMk = new ActionReference();
        rMk.putClass(cID("AdjL"));
        dMk.putReference(cID("null"), rMk);
        var dAdj = new ActionDescriptor(), dDef = new ActionDescriptor();
        dDef.putEnumerated(sID("presetKind"), sID("presetKindType"), sID("presetKindDefault"));
        dDef.putBoolean(sID("GeneratedPreset"), false);
        dDef.putBoolean(cID("Clrz"), false);
        dAdj.putObject(cID("Type"), cID("HStr"), dDef);
        dMk.putObject(cID("Usng"), cID("AdjL"), dAdj);
        executeAction(cID("Mk  "), dMk, DialogModes.NO);
        var l = doc.activeLayer;
        l.name = "-LUMINOSITA'/SATURAZIONE";
        inCima(doc, l);
        doc.activeLayer = l;
        // Come nell'azione: due intervalli, Ciani (4) e Blu (5), senza voce principale.
        var dSet = new ActionDescriptor(), rSet = new ActionReference();
        rSet.putEnumerated(cID("AdjL"), cID("Ordn"), cID("Trgt"));
        dSet.putReference(cID("null"), rSet);
        var dHue = new ActionDescriptor();
        dHue.putEnumerated(sID("presetKind"), sID("presetKindType"), sID("presetKindCustom"));
        var lista = new ActionList();
        function intervallo(n, a, b, c, d, sat, lum) {
            var x = new ActionDescriptor();
            x.putInteger(cID("LclR"), n);
            x.putInteger(cID("BgnR"), a); x.putInteger(cID("BgnS"), b);
            x.putInteger(cID("EndS"), c); x.putInteger(cID("EndR"), d);
            x.putInteger(cID("H   "), 0);
            x.putInteger(cID("Strt"), sat);
            x.putInteger(cID("Lght"), lum);
            lista.putObject(cID("Hst2"), x);
        }
        intervallo(4, 135, 165, 195, 225, Math.round(C.cianiSat), Math.round(C.cianiLum));
        intervallo(5, 195, 225, 255, 285, Math.round(C.bluSat), Math.round(C.bluLum));
        dHue.putList(cID("Adjs"), lista);
        dSet.putObject(cID("T   "), cID("HStr"), dHue);
        executeAction(cID("setd"), dSet, DialogModes.NO);
        return l;
    }

    function curvaImmSito(doc) {                          // terzo passo dell'azione, facoltativo
        if (doc.layers.length > 0) doc.activeLayer = doc.layers[0];
        var dMk = new ActionDescriptor(), rMk = new ActionReference();
        rMk.putClass(cID("AdjL"));
        dMk.putReference(cID("null"), rMk);
        var dAdj = new ActionDescriptor(), dDef = new ActionDescriptor();
        dDef.putEnumerated(sID("presetKind"), sID("presetKindType"), sID("presetKindDefault"));
        dAdj.putObject(cID("Type"), cID("Crvs"), dDef);
        dMk.putObject(cID("Usng"), cID("AdjL"), dAdj);
        executeAction(cID("Mk  "), dMk, DialogModes.NO);
        var l = doc.activeLayer;
        l.name = "-CURVE";
        inCima(doc, l);
        doc.activeLayer = l;
        var dSet = new ActionDescriptor(), rSet = new ActionReference();
        rSet.putEnumerated(cID("AdjL"), cID("Ordn"), cID("Trgt"));
        dSet.putReference(cID("null"), rSet);
        var dCrv = new ActionDescriptor();
        dCrv.putEnumerated(sID("presetKind"), sID("presetKindType"), sID("presetKindCustom"));
        var adj = new ActionList(), crvA = new ActionDescriptor(), rCh = new ActionReference();
        rCh.putEnumerated(cID("Chnl"), cID("Chnl"), cID("Cmps"));
        crvA.putReference(cID("Chnl"), rCh);
        var punti = new ActionList(), P = [[0, 0], [63, 44], [191, 196], [255, 255]];
        for (var i = 0; i < P.length; i++) {
            var p = new ActionDescriptor();
            p.putDouble(cID("Hrzn"), P[i][0]);
            p.putDouble(cID("Vrtc"), P[i][1]);
            punti.putObject(cID("Pnt "), p);
        }
        crvA.putList(cID("Crv "), punti);
        adj.putObject(cID("CrvA"), crvA);
        dCrv.putList(cID("Adjs"), adj);
        dSet.putObject(cID("T   "), cID("Crvs"), dCrv);
        executeAction(cID("setd"), dSet, DialogModes.NO);
        return l;
    }

    function livelliColore(doc, cfg, R) {
        var C = cfg.colore;
        if (C.mappa) { try { mappaSfumatura(doc, C.mappaOpacita); } catch (e) { R.avvisi.push("Mappa sfumatura non creata: " + testoErrore(e)); } }
        if (C.tonalita) { try { tonalitaSaturazione(doc, C); } catch (e2) { R.avvisi.push("Tonalità/Saturazione non creata: " + testoErrore(e2)); } }
        if (C.curva) { try { curvaImmSito(doc); } catch (e3) { R.avvisi.push("Curva non creata: " + testoErrore(e3)); } }
    }

    function livelloBianco(doc) {                         // livello di riempimento bianco, modificabile, in fondo
        var d = new ActionDescriptor(), r = new ActionReference();
        r.putClass(sID("contentLayer"));
        d.putReference(cID("null"), r);
        var u = new ActionDescriptor(), sc = new ActionDescriptor(), c = new ActionDescriptor();
        c.putDouble(cID("Rd  "), 255); c.putDouble(cID("Grn "), 255); c.putDouble(cID("Bl  "), 255);
        sc.putObject(cID("Clr "), cID("RGBC"), c);
        u.putObject(cID("Type"), sID("solidColorLayer"), sc);
        d.putObject(cID("Usng"), sID("contentLayer"), u);
        if (doc.layers.length > 0) doc.activeLayer = doc.layers[0];
        executeAction(cID("Mk  "), d, DialogModes.NO);
        var l = doc.activeLayer;
        l.name = "Sfondo bianco";
        inFondo(doc, l);
        return l;
    }

    // ============================================================ salvataggi
    function scriviSicuro(percorso, scrivi) {             // prima su un file temporaneo, poi lo scambio
        var dest = new File(percorso), cartella = dest.parent;
        if (!cartella.exists && !cartella.create()) throw new Error("Impossibile creare la cartella " + cartella.fsName);
        var tmp = new File(cartella.fsName + "/~borin_" + ora() + "_" + (++CONTATORE) + "." + estensione(percorso)), fatto = false;
        try {
            scrivi(tmp);
            if (!tmp.exists || tmp.length < 1) throw new Error("Photoshop non ha scritto " + nomeFile(dest));
            if (dest.exists && !dest.remove()) throw new Error("Impossibile sostituire " + dest.fsName + ": forse è aperto in un altro programma.");
            if (!tmp.rename(nomeFile(dest))) throw new Error("Impossibile dare il nome definitivo a " + nomeFile(dest));
            fatto = true;                                 // dopo rename, tmp punta al file definitivo: non va cancellato
        } finally {
            if (!fatto) { try { if (tmp.exists) tmp.remove(); } catch (e) {} }
        }
        return percorso;
    }
    function salvaPSD(doc, percorso) {
        var o = new PhotoshopSaveOptions();
        o.layers = true; o.embedColorProfile = true; o.alphaChannels = true; o.annotations = true; o.spotColors = true;
        return scriviSicuro(percorso, function (f) { doc.saveAs(f, o, true, Extension.LOWERCASE); });
    }
    function salvaPNG(doc, percorso) {
        var o = new PNGSaveOptions();
        o.interlaced = false;
        try { o.compression = 6; } catch (e) {}
        return scriviSicuro(percorso, function (f) { doc.saveAs(f, o, true, Extension.LOWERCASE); });
    }
    function salvaJPG(doc, percorso, qualita) {
        var o = new JPEGSaveOptions();
        o.quality = limita(Math.round(qualita), 0, 12);
        o.embedColorProfile = true;
        o.formatOptions = FormatOptions.STANDARDBASELINE;
        o.matte = MatteType.NONE;
        return scriviSicuro(percorso, function (f) { doc.saveAs(f, o, true, Extension.LOWERCASE); });
    }
    function salvaWebP(doc, percorso, E) {
        return scriviSicuro(percorso, function (f) {
            var o = new ActionDescriptor(), s = new ActionDescriptor();
            o.putEnumerated(sID("compression"), sID("WebPCompression"), sID(E.webpLossless ? "compressionLossless" : "compressionLossy"));
            if (!E.webpLossless) o.putInteger(sID("quality"), limita(Math.round(E.webpQualita), 0, 100));
            o.putBoolean(sID("includeXMPData"), false);
            o.putBoolean(sID("includeEXIFData"), false);
            o.putBoolean(sID("includePsExtras"), false);
            s.putObject(sID("as"), sID("WebPFormat"), o);
            s.putPath(sID("in"), f);
            s.putBoolean(sID("copy"), true);
            s.putBoolean(sID("lowerCase"), true);
            executeAction(sID("save"), s, DialogModes.NO);
        });
    }
    function webpHaAlpha(percorso) {                      // legge l'intestazione RIFF del WebP
        var f = new File(percorso);
        f.encoding = "BINARY";
        if (!f.open("r")) return null;
        function u32(s, p) { return s.charCodeAt(p) + s.charCodeAt(p + 1) * 256 + s.charCodeAt(p + 2) * 65536 + s.charCodeAt(p + 3) * 16777216; }
        try {
            var h = f.read(12);
            if (h.substr(0, 4) !== "RIFF" || h.substr(8, 4) !== "WEBP") return null;
            var off = 12, fine = f.length, alpha = false;
            while (off + 8 <= fine) {
                f.seek(off, 0);
                var c = f.read(8), tipo = c.substr(0, 4), dim = u32(c, 4);
                if (tipo === "VP8X") { if (f.read(1).charCodeAt(0) & 16) alpha = true; }
                else if (tipo === "ALPH") alpha = true;
                else if (tipo === "VP8L") { var b = f.read(5); if (b.charCodeAt(4) & 16) alpha = true; }
                off += 8 + dim + (dim % 2);
            }
            return alpha;
        } finally { f.close(); }
    }

    function copiaRidotta(doc, lato) {                    // copia unita, lato maggiore = lato
        var d = doc.duplicate("BORIN copia", true);
        var w = px(d.width), h = px(d.height), s = lato / Math.max(w, h);
        if (s < 1) d.resizeImage(UnitValue(Math.max(1, Math.round(w * s)), "px"), undefined, d.resolution, ResampleMethod.BICUBICSHARPER);
        return d;
    }
    function appiattisciSuBianco(doc) {
        var l = doc.artLayers.add();
        l.name = "Sfondo bianco";
        inFondo(doc, l);
        doc.activeLayer = l;
        doc.selection.selectAll();
        doc.selection.fill(colore(255, 255, 255), ColorBlendMode.NORMAL, 100, false);
        deseleziona(doc);
        doc.flatten();
    }
    function miniatura(doc, percorso, lato) {
        var d = copiaRidotta(doc, lato);
        try {
            var o = new PNGSaveOptions();
            try { o.compression = 3; } catch (e) {}
            d.saveAs(new File(percorso), o, true, Extension.LOWERCASE);
        } finally { d.close(SaveOptions.DONOTSAVECHANGES); }
        return percorso;
    }

    // Esporta JPG, PNG e WebP dalla copia unita (trasparente). Le misure diverse partono sempre dalla tela piena.
    function esporta(ex, cfg, U, R) {
        var E = cfg.export, lavori = [], lati = [], i, j;
        var latoPieno = Math.max(px(ex.width), px(ex.height));
        function aggiungi(formato, percorso, lato, bianco) {
            if (!percorso) return;
            lato = (lato && lato > 0 && lato < latoPieno) ? Math.round(lato) : latoPieno;
            lavori.push({formato: formato, percorso: percorso, lato: lato, bianco: bianco});
            for (var x = 0; x < lati.length; x++) if (lati[x] === lato) return;
            lati.push(lato);
        }
        aggiungi("PNG", U.png, E.pngLato, E.sfondoBiancoPNG);
        aggiungi("WEBP", U.webp, E.webpLato, E.sfondoBiancoWebP);
        aggiungi("PNG_CWEBP", U.pngPerCwebp, E.webpLato, E.sfondoBiancoWebP);
        aggiungi("JPG", U.jpg, E.jpgLato, true);
        lati.sort(function (a, b) { return b - a; });
        if (E.webSRGB) {
            var prof = "";
            try { prof = ex.colorProfileName; } catch (e) {}
            if (prof.indexOf("sRGB") < 0) {
                try { ex.convertProfile("sRGB IEC61966-2.1", Intent.RELATIVECOLORIMETRIC, true, false); }
                catch (e2) { R.avvisi.push("Formati web non convertiti in sRGB: " + testoErrore(e2)); }
            }
        }
        for (i = 0; i < lati.length; i++) {
            var lato = lati[i], d = (lato === latoPieno) ? ex : copiaRidotta(ex, lato), piatto = null;
            try {
                for (j = 0; j < lavori.length; j++) {         // prima i trasparenti
                    var L = lavori[j];
                    if (L.lato !== lato || L.bianco) continue;
                    app.activeDocument = d;
                    if (L.formato === "WEBP") {
                        salvaWebP(d, L.percorso, E);
                        var a = webpHaAlpha(L.percorso);
                        if (a === false) R.avvisi.push("Il WebP salvato da Photoshop non ha la trasparenza: prova il motore cwebp nelle impostazioni.");
                    } else salvaPNG(d, L.percorso);
                    R.uscite.push({formato: L.formato === "PNG_CWEBP" ? "PNG per cwebp" : L.formato, percorso: L.percorso, lato: lato});
                }
                for (j = 0; j < lavori.length; j++) {         // poi quelli su bianco
                    L = lavori[j];
                    if (L.lato !== lato || !L.bianco) continue;
                    if (!piatto) { piatto = d.duplicate("BORIN bianco", true); app.activeDocument = piatto; appiattisciSuBianco(piatto); }
                    app.activeDocument = piatto;
                    if (L.formato === "JPG") salvaJPG(piatto, L.percorso, E.jpgQualita);
                    else if (L.formato === "WEBP") salvaWebP(piatto, L.percorso, E);
                    else salvaPNG(piatto, L.percorso);
                    R.uscite.push({formato: L.formato === "PNG_CWEBP" ? "PNG per cwebp" : L.formato, percorso: L.percorso, lato: lato, bianco: true});
                }
            } finally {
                if (piatto) { try { piatto.close(SaveOptions.DONOTSAVECHANGES); } catch (e3) {} }
                if (d !== ex) { try { d.close(SaveOptions.DONOTSAVECHANGES); } catch (e4) {} }
            }
        }
    }

    // ============================================================ lavorazione di un file
    function elabora(a) {
        return conPreferenze(function () {
            var cfg = a.cfg, U = a.uscite || {}, R = {file: a.file || a.documento, avvisi: [], uscite: [], tempi: {}};
            var t0 = ora(), tFase = t0, faseAttuale = null, doc = null, ex = null;
            function passo(nome) {
                var t = ora();
                if (faseAttuale) R.tempi[faseAttuale] = (R.tempi[faseAttuale] || 0) + (t - tFase);
                tFase = t; faseAttuale = nome;
                fase(nome, {file: R.file});
            }
            try {
                passo("apertura");
                var ap = apri(a);
                doc = ap.doc;
                app.activeDocument = doc;
                R.originale = infoDocumento(doc);
                R.giaAperto = ap.giaAperto;
                var visibili = fotografaVisibilita(doc);
                if (a.anteprimaPrima) { try { miniatura(doc, a.anteprimaPrima, a.latoAnteprima || 1400); } catch (e0) {} app.activeDocument = doc; }
                normalizza(doc, cfg, R);
                var idSfondo = sbloccaSfondo(doc);
                ogniLivello(doc, sblocca);
                ripristinaVisibilita(doc, visibili);

                passo("analisi");
                var regole = {
                    ombre: cfg.livelli.escludiOmbre ? parole(cfg.livelli.paroleOmbre) : [],
                    sfondi: cfg.livelli.escludiSfondi ? parole(cfg.livelli.paroleSfondi) : [],
                    idSfondo: idSfondo
                };
                var esclusi = escludi(doc, regole);
                if (contaContenuti(doc) < 1) {            // ha escluso tutto: si riammettono gli sfondi, poi il resto
                    riammetti(esclusi, "sfondo");
                    if (contaContenuti(doc) < 1) riammetti(esclusi, null);
                }
                var an = {multilivello: contaContenuti(doc) > 1};
                an.alpha = analizzaAlpha(doc);
                if (an.alpha.vuoto) throw new Error("Nessun pixel visibile da elaborare: controlla i livelli nascosti o esclusi.");
                var flusso = decidi(cfg, an);
                R.flusso = flusso;
                R.analisi = {multilivello: an.multilivello, trasparente: an.alpha.trasparente, esclusi: []};
                for (var ei = 0; ei < esclusi.length; ei++) R.analisi.esclusi.push(esclusi[ei].nome + " (" + esclusi[ei].motivo + ")");

                var sogg = preparaSoggetto(doc, flusso.livelli);
                raccogliEsclusi(doc);
                var conTrasparenza = an.alpha.trasparente;
                if (flusso.preparazione === "CUTOUT") {
                    passo("scontorno");
                    scontorna(doc, sogg, cfg, R);
                    conTrasparenza = true;
                } else if (!conTrasparenza) {
                    R.avvisi.push("Il file non ha trasparenza e lo scontorno è spento: niente ombra (sarebbe un rettangolo). Usa «Foto da scontornare».");
                }

                passo("sagoma");
                var sg = creaSagoma(doc, sogg, cfg, R);
                if (cfg.ombra.togliResidui !== false && conTrasparenza) { passo("residui"); togliResidui(doc, sg.layer, R); }
                var box = bordi(sg.layer);
                R.soggetto = {larghezza: Math.round(box.w), altezza: Math.round(box.h)};

                passo("composizione");
                componi(doc, cfg, box, R);
                var boxFinale = bordi(sg.layer);
                R.soggettoFinale = {l: Math.round(boxFinale.l), t: Math.round(boxFinale.t), r: Math.round(boxFinale.r), b: Math.round(boxFinale.b)};

                if (cfg.ombra.attiva && conTrasparenza) {
                    passo("ombra");
                    R.ombra = creaOmbra(doc, sogg, sg.layer, cfg, R);
                }
                rimuovi(sg.layer);

                passo("colore");
                livelliColore(doc, cfg, R);

                passo("salvataggio");
                var serveExport = U.jpg || U.png || U.webp || U.pngPerCwebp || a.miniatura || a.anteprimaDopo;
                if (serveExport) { app.activeDocument = doc; ex = doc.duplicate("BORIN export", true); }
                if (U.psd) {
                    app.activeDocument = doc;
                    if (cfg.export.sfondoBiancoPSD) livelloBianco(doc);
                    salvaPSD(doc, U.psd);
                    R.uscite.push({formato: "PSD", percorso: U.psd});
                }
                doc.close(SaveOptions.DONOTSAVECHANGES);
                doc = null;
                if (ex) {
                    passo("export");
                    app.activeDocument = ex;
                    esporta(ex, cfg, U, R);
                    app.activeDocument = ex;
                    if (a.miniatura) { try { miniatura(ex, a.miniatura, 360); R.miniatura = a.miniatura; } catch (e1) {} }
                    if (a.anteprimaDopo) { try { miniatura(ex, a.anteprimaDopo, a.latoAnteprima || 1400); R.anteprimaDopo = a.anteprimaDopo; } catch (e2) {} }
                }
                if (a.anteprimaPrima) R.anteprimaPrima = a.anteprimaPrima;
                R.ok = true;
            } catch (e) {
                R.ok = false;
                R.errore = testoErrore(e);
                R.faseErrore = faseAttuale;
            } finally {
                if (ex) { try { ex.close(SaveOptions.DONOTSAVECHANGES); } catch (e5) {} }
                if (doc) { try { doc.close(SaveOptions.DONOTSAVECHANGES); } catch (e6) {} }
                if (faseAttuale) R.tempi[faseAttuale] = (R.tempi[faseAttuale] || 0) + (ora() - tFase);
                R.durata = ora() - t0;
            }
            return R;
        });
    }

    // Analisi senza salvare nulla: dice che cosa farebbe il batch con quel file.
    function analizza(a) {
        return conPreferenze(function () {
            var doc = null, R = {file: a.file || a.documento, avvisi: []};
            try {
                doc = apri(a).doc;
                app.activeDocument = doc;
                R.originale = infoDocumento(doc);
                var visibili = fotografaVisibilita(doc);
                normalizza(doc, a.cfg, R);
                var idSfondo = sbloccaSfondo(doc);
                ogniLivello(doc, sblocca);
                ripristinaVisibilita(doc, visibili);
                var regole = {
                    ombre: a.cfg.livelli.escludiOmbre ? parole(a.cfg.livelli.paroleOmbre) : [],
                    sfondi: a.cfg.livelli.escludiSfondi ? parole(a.cfg.livelli.paroleSfondi) : [],
                    idSfondo: idSfondo
                };
                var esclusi = escludi(doc, regole);
                if (contaContenuti(doc) < 1) { riammetti(esclusi, "sfondo"); if (contaContenuti(doc) < 1) riammetti(esclusi, null); }
                var an = {multilivello: contaContenuti(doc) > 1};
                an.alpha = analizzaAlpha(doc);
                R.flusso = decidi(a.cfg, an);
                R.analisi = {multilivello: an.multilivello, trasparente: an.alpha.trasparente, vuoto: an.alpha.vuoto, esclusi: []};
                for (var i = 0; i < esclusi.length; i++) R.analisi.esclusi.push(esclusi[i].nome + " (" + esclusi[i].motivo + ")");
                R.ok = true;
            } catch (e) {
                R.ok = false; R.errore = testoErrore(e);
            } finally {
                if (doc) { try { doc.close(SaveOptions.DONOTSAVECHANGES); } catch (e2) {} }
            }
            return R;
        });
    }

    function info() {
        var v = String(app.version), p = v.split("."), M = parseInt(p[0], 10), m = parseInt(p[1] || "0", 10);
        return {
            motore: VERSIONE, photoshop: v, sistema: $.os, lingua: app.locale,
            webpNativo: M > 23 || (M === 23 && m >= 2), documenti: app.documents.length,
            righello: nomeEnum(app.preferences.rulerUnits), temp: Folder.temp.fsName
        };
    }

    function documentiAperti() {
        var out = [];
        for (var i = 0; i < app.documents.length; i++) {
            var d = app.documents[i], percorso = null;
            try { percorso = d.fullName.fsName; } catch (e) {}
            out.push({nome: d.name, percorso: percorso, larghezza: Math.round(px(d.width)), altezza: Math.round(px(d.height)), livelli: d.layers.length});
        }
        return out;
    }

    function apriFile(a) {
        var f = new File(a.percorso);
        if (!f.exists) throw new Error("File non trovato: " + a.percorso);
        app.open(f);
        app.bringToFront();
        return true;
    }

    function pulisciMemoria() {
        try { app.purge(PurgeTarget.HISTORYCACHES); } catch (e) {}
        try { app.purge(PurgeTarget.CLIPBOARDCACHE); } catch (e2) {}
        return true;
    }

    var API = {
        versione: function () { return VERSIONE; }, info: info, elabora: elabora, analizza: analizza,
        documentiAperti: documentiAperti, apriFile: apriFile, pulisciMemoria: pulisciMemoria
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

    return {chiama: chiama, versione: VERSIONE, json: json, _interno: {stileOmbra: stileOmbra}};
})();
