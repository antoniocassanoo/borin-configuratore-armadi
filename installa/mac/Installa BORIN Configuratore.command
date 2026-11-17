#!/bin/bash
# BORIN Configuratore · installatore per Mac. Doppio clic per lanciarlo.
# - Copia l'estensione «com.borin.configuratore» (la cartella accanto a questo file) in
#   ~/Library/Application Support/Adobe/CEP/extensions, al posto della versione di prima.
# - Accende PlayerDebugMode (CSXS 9-15): serve a Photoshop per caricare un'estensione non firmata.
# - Toglie la quarantena di macOS dalla copia.
# Non chiede la password e non tocca le impostazioni né i PSD in ~/Library/Application Support/BORIN/Configuratore armadi.
# Lanciato dalla cartella di lavoro (installa/mac), prende l'estensione da ../../estensione.

ID="com.borin.configuratore"
QUI="$(cd "$(dirname "$0")" && pwd)"

fine() {
  echo
  read -r -s -n 1 -p "Premi un tasto per chiudere questa finestra." || true
  echo
  exit "$1"
}

errore() {
  echo
  echo "ERRORE: $1"
  echo "L'installazione non è finita. Chiudi Photoshop e riprova; se l'errore torna,"
  echo "manda una foto di questa finestra a chi ti ha dato BORIN Configuratore."
  fine 1
}

echo "BORIN Configuratore · installazione"
echo

[ -n "$HOME" ] && [ -d "$HOME" ] || errore "non trovo la tua cartella utente."
DEST_DIR="$HOME/Library/Application Support/Adobe/CEP/extensions"
DEST="$DEST_DIR/$ID"

SRC="$QUI/$ID"
[ -f "$SRC/CSXS/manifest.xml" ] || SRC="$QUI/../../estensione/$ID"
[ -f "$SRC/CSXS/manifest.xml" ] || errore "non trovo la cartella «$ID» accanto a questo file.
Se hai ricevuto uno zip, aprilo con un doppio clic e lancia l'installatore dalla cartella che compare."
SRC="$(cd "$SRC" && pwd -P)"
VERSIONE="$(sed -n 's/.*ExtensionBundleVersion="\([^"]*\)".*/\1/p' "$SRC/CSXS/manifest.xml" | head -n 1)"

# 1. Copia, al posto della versione di prima.
mkdir -p "$DEST_DIR" || errore "non riesco a creare la cartella $DEST_DIR"
if [ -e "$DEST" ] || [ -L "$DEST" ]; then
  # Senza barra finale: se al posto della cartella c'è un collegamento, si toglie il collegamento e non la cartella.
  rm -rf "$DEST" || errore "non riesco a togliere la versione installata prima ($DEST)."
  echo "• Tolta la versione installata prima."
fi
ditto "$SRC" "$DEST" || errore "non riesco a copiare l'estensione in $DEST"
xattr -dr com.apple.quarantine "$DEST" 2>/dev/null || true
echo "• Estensione copiata in $DEST"

# 2. PlayerDebugMode per le versioni di CEP da 9 a 15.
for N in 9 10 11 12 13 14 15; do
  defaults write "com.adobe.CSXS.$N" PlayerDebugMode 1 || errore "non riesco a scrivere PlayerDebugMode per CSXS.$N."
  [ "$(defaults read "com.adobe.CSXS.$N" PlayerDebugMode 2>/dev/null)" = "1" ] \
    || errore "PlayerDebugMode per CSXS.$N non risulta acceso."
done
echo "• Photoshop può caricare estensioni non firmate (PlayerDebugMode 1, CSXS 9-15)."

echo
echo "Fatto: BORIN Configuratore $VERSIONE è installato."
echo "Chiudi Photoshop se è aperto e riaprilo. Il pannello è in"
echo "Finestra › Estensioni (precedenti) › BORIN Configuratore."
echo "Alla prima apertura scarica da solo i progetti PSD degli armadi (circa 85 MB)."
fine 0
