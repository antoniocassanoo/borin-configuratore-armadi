# Concept · BORIN Configuratore armadi

Lo stile è quello di BORIN Batch (`../../BORIN/photoshop-batch/concept.md`), fissato dall'utente: stessa tavolozza
ufficiale, Gotham, tema chiaro Inox o scuro Ossidiana come Photoshop, intro col logo a ogni apertura. Qui si decide
solo come il mondo BORIN porta il configuratore.

## Il mondo stampato
1. **Prospetto frontale del catalogo spogliatoi**: l'armadio disegnato di fronte, con le ante e le quote. Presta i tre
   disegni per scegliere il tipo (1, 2, 3 ante), con larghezze in proporzione.
2. **Pagina del catalogo**: il prodotto vero su bianco. È l'anteprima: i pezzi del PSD impilati come in Photoshop.
3. **Riquadri di dettaglio del catalogo** (la serratura, i piedini ingranditi in un tondo o in un quadrato a lato):
   prestano le caselle delle opzioni, ognuna con il proprio dettaglio fotografico ingrandito, niente icone.
4. **Scheda d'ordine**: righe con caselle da spuntare, una scelta per riga. Presta i gruppi Base, Scomparti, Serratura.
5. **Etichetta della scatola**: il nome dell'articolo in chiaro. Presta la targhetta con il nome del file che uscirà.

## Le contraddizioni
- *Tutte le combinazioni ma semplice*: una sola schermata con tre righe di scelte e un pulsante; «Tutte le
  combinazioni» è il secondo pulsante, non una modalità.
- *Dentro Photoshop ma con l'identità BORIN*: il fondo segue Photoshop; il prodotto sta sempre su bianco, come nel catalogo.

## La direzione
Deve sembrare **la scheda d'ordine di un armadio spogliatoio BORIN, con prospetto e dettagli del catalogo, rifatta come
banco di lavoro** per chi prepara le immagini e-commerce.

## Il piano
- Colori, caratteri, pulsanti, blocchi e intro: `css/borin.css` di BORIN Batch, copiato senza modifiche.
- `css/armadi.css` aggiunge: prospetti dei tipi, piatto bianco dell'anteprima, caselle con il dettaglio, targhetta.
- Passi numerati solo dove sono una sequenza vera: Tipo → Scelte → Dove salvare.

## Prova dello scambio
- I prospetti con 1, 2, 3 ante e il tetto inclinato valgono solo per questi armadi.
- Le caselle mostrano il pezzo vero del PSD (serratura, piedini, scomparto), non un'icona: cambiano se cambia il PSD.
