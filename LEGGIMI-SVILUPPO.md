# BORIN Configuratore 1.0 · note di sviluppo

Estensione CEP per Photoshop 2022+ (Mac e Windows): compone gli armadi dai PSD a livelli ed esporta con il motore di
BORIN Batch. Repository pubblico `antoniocassanoo/borin-configuratore-armadi` (codice e release; i pannelli lo leggono
senza token).

## Com'è fatto

| File | Cosa fa |
|---|---|
| `estensione/com.borin.configuratore/CSXS/manifest.xml` | pannello `…pannello` (menu «BORIN Configuratore») e `…avvio` invisibile; Photoshop 23.0–99.9, CSXS 11, Node attivo |
| `…/jsx/armadi.jsx` | **motore**: `ARMADI.chiama(nome, argomenti URI-JSON)`. API: `info`, `leggi`, `anteprime`, `componi`, `esporta`, `mostraInPhotoshop`, `chiudi`, `chiudiTutti`, `caricaBatch` |
| `…/jsx/borin_motore.jsx` | **copia identica** del motore di BORIN Batch (8.1.0): `esporta` gli passa la composizione con `elabora` |
| `…/js/app.js` | pannello: tipi, anteprima a pezzi, scelte, nome del file, export, controllo dei livelli, PSD, aggiornamenti |
| `…/js/aggiorna.js` | aggiornamenti da GitHub Releases: pannello (zip senza font) e PSD (solo quelli cambiati, con sha256) |
| `…/js/disco.js` | Node: cartella dei dati, cache delle anteprime, nomi e percorsi delle uscite (come BORIN Batch) |
| `…/js/cep.js` | ponte con Photoshop; le chiamate al motore passano una alla volta |
| `…/js/preset.js`, `…/css/borin.css` | copiati da BORIN Batch senza modifiche (valori BORIN, stile); `css/armadi.css` aggiunge il resto |
| `…/js/avvio.js` | estensione invisibile: apre il pannello quando trova `apri-pannello` nella cartella dei dati |
| `…/armadi.json` | i tre tipi (nome, PSD, nome nel file), colore, ordine e prefissi del nome del file |
| `estensione/sorgenti/` | `index.modello.html` + logo → `node estensione/sorgenti/monta.js` scrive `index.html` |
| `installa/`, `crea_pacchetti.sh`, `pubblica.sh` | installatori, pacchetti in `dist/`, pubblicazione |
| `test/` | `motore.jsx` (motore in Photoshop via osascript), `pannello.js` + `finto.js` (pannello in Chrome), `cdp.js` (pannello aperto in Photoshop, porta 8089) |

Dove finiscono le cose:
- estensione: `~/Library/Application Support/Adobe/CEP/extensions/com.borin.configuratore` (Mac), `%APPDATA%\Adobe\CEP\extensions\…` (Windows);
- dati, nella cartella `BORIN/Configuratore armadi` dentro Application Support o `%APPDATA%`:
  `impostazioni.json`, `PSD/` (scaricati, con `progetti.json` degli sha256), `anteprime/<tipo>-<chiave>/`, `errori.log`.

## Convenzione dei PSD

Il pannello legge i gruppi dal file: un livello nuovo dentro un gruppo EXTRA diventa una scelta, senza toccare il codice.
- `STANDARD`: sempre acceso, con i figli come sono nel file (anche i ritocchi, es. «Riempimento generativo»).
- `EXTRA <n> · <Nome>`: una sola opzione accesa; le opzioni sono i figli diretti, in ordine alfabetico nel pannello.
  L'opzione accesa nel file è quella proposta la prima volta. I livelli di ritaglio vanno con il loro livello.
- Un'opzione può essere un gruppo: «Scomparto…» sempre acceso, «Contenuto · …» spegnibile (casella «Con le scarpe dentro»),
  gli altri livelli come nel file.
- Ordine e prefissi nel nome del file: `armadi.json` (`ordineNelNome`, `prefissi`, `nomiNelFile`, `vuoto`).

**Controllo dei livelli** (Info, e una notifica in cima e del sistema quando cambia l'elenco):
spazi in più, nomi lasciati da Photoshop, gruppi vuoti, livelli fuori dai gruppi, nomi scritti in modo diverso tra i PSD,
gruppi che mancano in un tipo e **livelli fuori posto**: un livello dentro un'opzione che negli altri PSD è un'opzione di un
altro gruppo (anche con un nome simile, distanza ≤ 2). I livelli fuori posto restano spenti in anteprima ed export.

## Anteprime ed export

- `anteprime`: copia del PSD ridotta a 1000 px di altezza, un PNG per pezzo (corpo, ogni opzione, ogni parte), tutti della
  stessa tela; il pannello li impila con `mix-blend-mode` (le ombre in Moltiplica). Cache per percorso, peso e data del PSD:
  se il PSD cambia, le anteprime si rifanno da sole (circa 8 s per tipo).
- `esporta`: accende i livelli nel PSD (o in una copia, se l'utente lo ha già aperto), ne fa una copia unita a un livello,
  la passa a `BATCH.chiama("elabora", …)` con il preset «Già scontornata» di BORIN Batch e i formati scelti, poi chiude tutto
  senza salvare. Con «Tutte le …» il PSD resta aperto fino all'ultima combinazione.
- Il motore di BORIN Batch si carica in privato (`caricaBatch`): se il pannello BORIN Batch è aperto, il suo `BORIN` globale
  resta suo. Gli eventi `com.borin.batch.fase` danno le fasi nella barra.

## Comandi

```zsh
node estensione/sorgenti/monta.js                     # rifà index.html dal modello
node test/pannello.js <cartella anteprime> <scatti>   # pannello in Chrome con anteprime vere (vedi test/motore.jsx)
node test/cdp.js eval "<js>"  ·  node test/cdp.js foto x.png   # pannello aperto in Photoshop (porta 8089, file .debug)
./crea_pacchetti.sh                                   # dist/: cartelle e zip per Mac e Windows (Gotham da BORIN Batch)
./pubblica.sh 1.0.1 "novità|altra novità"             # versione, zip, PSD cambiati, commit, tag, push, release
```

Motore senza pannello (Mac): `test/motore.jsx` con `FUNZ` = `anteprime`, `componi` o `esporta` e gli argomenti in un file JSON.

**Installazione di sviluppo su questo Mac**: collegamento simbolico
`~/Library/Application Support/Adobe/CEP/extensions/com.borin.configuratore` → `estensione/com.borin.configuratore`,
PlayerDebugMode=1 (CSXS 9–14), file `.debug` (porta 8089, escluso dai pacchetti). Dopo una modifica:
`node test/cdp.js eval "location.reload()"`; il motore si ricarica da Info › «Ricarica il motore».
La copia di sviluppo non si aggiorna da GitHub (si aggiorna con git).

## Collaudi fatti (17/11/2026, Photoshop 28.0 su Mac)

- Motore: anteprime dei 3 PSD (7–10 s ciascuno), composizione al pixel, export BORIN del doppio (15 s, 4 formati, 5120 × 5120, oggetto 3073 px).
- Pannello dentro Photoshop (CEF 99): scelte con clic, «Crea l'immagine» (15 s), «Tutte le 9» del singolo (1 min 48 s), nessun documento lasciato aperto.
- Pannello in Chrome: temi chiaro e scuro, larghezze 340, 460 e 1000 px, Gotham caricato, nessuna tracimazione.

## Da fare / idee

- Colori delle ante (facoltativi): un gruppo EXTRA in più nei PSD basterebbe al pannello.
- Windows: installatori controllati solo staticamente, da provare su un PC.
- App «BORIN Configuratore» come in BORIN Batch (l'estensione invisibile c'è già).
