#!/bin/bash
# BORIN Configuratore · crea i pacchetti da dare ai colleghi.
#
#   ./crea_pacchetti.sh
#
# In dist/, con la versione di ExtensionBundleVersion nel manifest (1.0.0 diventa «1.0»):
#   «BORIN Configuratore <v> - Mac/»      estensione + Installa/Disinstalla BORIN Configuratore.command + LEGGIMI.txt
#   «BORIN Configuratore <v> - Windows/»  estensione + Installa/Disinstalla BORIN Configuratore.bat + LEGGIMI.txt
#   più uno zip per ciascuna cartella, fatto con zip da shell: i .command restano eseguibili.
# I PSD non ci sono: il pannello li scarica da GitHub alla prima apertura (vedi pubblica.sh).
# Il font Gotham va nei pacchetti: se manca in estensione/…/fonts/gotham si prende da BORIN Batch (../../BORIN/photoshop-batch).
# Controlla: i file richiamati dal manifest, la sintassi dei .command, i .bat solo ASCII, il fine riga CRLF dei file
# per Windows e il permesso di esecuzione dei .command nello zip.
set -euo pipefail

QUI="$(cd "$(dirname "$0")" && pwd)"
ID="com.borin.configuratore"
EST="$QUI/estensione/$ID"
DIST="${BORIN_DIST:-$QUI/dist}"
MAC="$QUI/installa/mac"
WIN="$QUI/installa/windows"
MANIFEST="$EST/CSXS/manifest.xml"
GOTHAM_BATCH="$QUI/../../BORIN/photoshop-batch/estensione/com.borin.batch/fonts/gotham"

errore() { echo "ERRORE: $*" >&2; exit 1; }

[ -f "$MANIFEST" ] || errore "manca il manifest: $MANIFEST"
V="$(sed -n 's/.*ExtensionBundleVersion="\([^"]*\)".*/\1/p' "$MANIFEST" | head -n 1)"
re_ok='^[0-9]+(\.[0-9]+)*$'; re_tre='^([0-9]+)\.([0-9]+)\.0$'
[[ "$V" =~ $re_ok ]] || errore "ExtensionBundleVersion non valida nel manifest: «$V»"
if [[ "$V" =~ $re_tre ]]; then VERSIONE="${BASH_REMATCH[1]}.${BASH_REMATCH[2]}"; else VERSIONE="$V"; fi

# Font Gotham: nei pacchetti completi sì, nel repository no (.gitignore).
if [ ! -f "$EST/fonts/gotham/Gotham-Book.otf" ]; then
  [ -d "$GOTHAM_BATCH" ] || errore "manca il font Gotham in $EST/fonts/gotham (e non c'è BORIN Batch accanto da cui prenderlo)."
  mkdir -p "$EST/fonts/gotham" && cp "$GOTHAM_BATCH"/*.otf "$EST/fonts/gotham/"
fi

MANCANO=""
while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  [ -e "$EST/${rel#./}" ] || MANCANO="$MANCANO ${rel#./}"
done <<< "$(grep -oE '>\./[^<]+<' "$MANIFEST" | sed 's/^>//; s/<$//' | sort -u || true)"
[ -z "$MANCANO" ] || errore "il manifest richiama file che non ci sono:$MANCANO"
for f in "$MAC/Installa BORIN Configuratore.command" "$MAC/Disinstalla BORIN Configuratore.command" "$MAC/LEGGIMI.txt" \
         "$WIN/Installa BORIN Configuratore.bat" "$WIN/Disinstalla BORIN Configuratore.bat" "$WIN/LEGGIMI.txt"; do
  [ -f "$f" ] || errore "manca $f"
done
for f in "$MAC"/*.command; do bash -n "$f" || errore "errore di sintassi in $f"; done

copia_estensione() {  # $1 = cartella del pacchetto
  ditto "$EST" "$1/$ID"
  find "$1/$ID" -type f \( -name '.DS_Store' -o -name '._*' -o -name 'Thumbs.db' -o -name '.debug' -o -name '*.map' \) -delete
  xattr -cr "$1/$ID" 2>/dev/null || true
  chmod -R u=rwX,go=rX "$1/$ID"
}
senza_bom() { perl -pe 's/^\xEF\xBB\xBF// if $. == 1' "$1"; }
riempi()    { senza_bom "$1" | sed -e "s/{{VERSIONE}}/$VERSIONE/g"; }
a_crlf()    { perl -pe 's/\r?\n/\r\n/'; }
a_lf()      { perl -pe 's/\r\n/\n/'; }

mkdir -p "$DIST"

NOME_MAC="BORIN Configuratore $VERSIONE - Mac"
OUT="$DIST/$NOME_MAC"
rm -rf "$OUT" "$OUT.zip"; mkdir -p "$OUT"
copia_estensione "$OUT"
for c in "Installa BORIN Configuratore.command" "Disinstalla BORIN Configuratore.command"; do
  a_lf < "$MAC/$c" > "$OUT/$c"; chmod 755 "$OUT/$c"
done
riempi "$MAC/LEGGIMI.txt" | a_lf > "$OUT/LEGGIMI.txt"; chmod 644 "$OUT/LEGGIMI.txt"

NOME_WIN="BORIN Configuratore $VERSIONE - Windows"
OUT="$DIST/$NOME_WIN"
rm -rf "$OUT" "$OUT.zip"; mkdir -p "$OUT"
copia_estensione "$OUT"
for b in "Installa BORIN Configuratore.bat" "Disinstalla BORIN Configuratore.bat"; do
  NONASCII="$(LC_ALL=C perl -ne 'print "  riga $.: $_" if /[^\x00-\x7F]/' "$WIN/$b")"
  [ -z "$NONASCII" ] || errore "in «$b» ci sono caratteri non ASCII (lettere accentate?):"$'\n'"$NONASCII"
  a_crlf < "$WIN/$b" > "$OUT/$b"
done
{ printf '\357\273\277'; riempi "$WIN/LEGGIMI.txt" | a_crlf; } > "$OUT/LEGGIMI.txt"
chmod 644 "$OUT"/*.bat "$OUT/LEGGIMI.txt"
for f in "$OUT"/*.bat "$OUT/LEGGIMI.txt"; do
  perl -0777 -ne 'exit 1 if /(?<!\r)\n/' "$f" || errore "$(basename "$f"): non tutte le righe finiscono con CRLF"
done

zippa() { ( cd "$DIST" && zip -r -X -q "$1.zip" "$1" -x '*.DS_Store' ); }
zippa "$NOME_MAC"
zippa "$NOME_WIN"
for c in "Installa BORIN Configuratore.command" "Disinstalla BORIN Configuratore.command"; do
  zipinfo "$DIST/$NOME_MAC.zip" "$NOME_MAC/$c" 2>/dev/null | grep -q '^-rwxr-xr-x' || errore "nello zip per Mac «$c» non risulta eseguibile"
done

echo "BORIN Configuratore $VERSIONE (manifest $V): pacchetti pronti in $DIST"
for n in "$NOME_MAC" "$NOME_WIN"; do
  echo "  $n/  $(find "$DIST/$n" -type f | wc -l | tr -d ' ') file  ·  $n.zip  $(du -h "$DIST/$n.zip" | cut -f1 | tr -d ' ')"
done
