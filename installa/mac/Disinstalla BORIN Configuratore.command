#!/bin/bash
# BORIN Configuratore · disinstallazione per Mac. Doppio clic per lanciarla.
# Toglie ~/Library/Application Support/Adobe/CEP/extensions/com.borin.configuratore.
# Lascia le impostazioni e i PSD scaricati in ~/Library/Application Support/BORIN/Configuratore armadi,
# e PlayerDebugMode, che può servire ad altre estensioni.

ID="com.borin.configuratore"

fine() {
  echo
  read -r -s -n 1 -p "Premi un tasto per chiudere questa finestra." || true
  echo
  exit "$1"
}

errore() {
  echo
  echo "ERRORE: $1"
  echo "La disinstallazione non è finita. Chiudi Photoshop e riprova."
  fine 1
}

echo "BORIN Configuratore · disinstallazione"
echo

[ -n "$HOME" ] && [ -d "$HOME" ] || errore "non trovo la tua cartella utente."
DEST="$HOME/Library/Application Support/Adobe/CEP/extensions/$ID"
DATI="$HOME/Library/Application Support/BORIN/Configuratore armadi"

if [ -e "$DEST" ] || [ -L "$DEST" ]; then
  rm -rf "$DEST" || errore "non riesco a togliere $DEST"
  echo "• BORIN Configuratore è stato tolto da Photoshop."
else
  echo "• BORIN Configuratore non era installato: non c'era niente da togliere."
fi
if [ -d "$DATI" ]; then
  echo "• Le impostazioni e i PSD scaricati restano in $DATI"
  echo "  e tornano se reinstalli. Per liberare spazio puoi spostare quella cartella nel Cestino."
fi

echo
echo "Chiudi e riapri Photoshop: il pannello non ci sarà più."
fine 0
