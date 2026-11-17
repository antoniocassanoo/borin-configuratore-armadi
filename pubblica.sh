#!/bin/bash
# BORIN Configuratore · pubblica una versione nuova: pannello e progetti PSD. I colleghi la ricevono dal pannello.
#
#   ./pubblica.sh 1.0.1 "Prima novità|Seconda novità"
#
# Un solo repository GitHub, pubblico, perché i pannelli lo leggono senza token: «repo» in
# estensione/com.borin.configuratore/aggiornamento.json e il remote «origin» devono essere lo stesso.
#   - Codice nel ramo main, senza il font Gotham (.gitignore).
#   - In ogni release: BORIN-Configuratore-<v>-aggiornamento.zip (l'estensione senza font), aggiornamento.json
#     (versione, sha256, elenco dei PSD), BORIN-Configuratore-Mac.zip e BORIN-Configuratore-Windows.zip (pacchetti
#     completi, con nome fisso per i link releases/latest/download/… del README) e i PSD cambiati dall'ultima release.
# I PSD si prendono da ../progetti (nomi in armadi.json). Un PSD uguale a quello dell'ultima release non si ricarica:
# aggiornamento.json dice in quale release sta. Serve gh collegato a GitHub (gh auth login); qui gh sta in ~/.local/bin/gh.
set -euo pipefail
cd "$(dirname "$0")"
GH="$(command -v gh || echo "$HOME/.local/bin/gh")"
QUI="$PWD"; EST="$QUI/estensione/com.borin.configuratore"; PROGETTI="${BORIN_PROGETTI:-$QUI/../progetti}"
V="${1:-}"; NOVITA="${2:-}"
if ! [[ "$V" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then echo 'Uso: ./pubblica.sh 1.0.1 "novità|altra novità"'; exit 1; fi
"$GH" auth status >/dev/null 2>&1 || { echo "GitHub non è collegato: lancia «$GH auth login»."; exit 1; }
REPO=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("repo",""))' "$EST/aggiornamento.json")
ORIGINE=$(git remote get-url origin 2>/dev/null | sed -E 's#.*github\.com[:/]##; s#\.git$##')
[ -n "$REPO" ] && [ "$REPO" = "$ORIGINE" ] || { echo "«repo» in aggiornamento.json ($REPO) e remote origin ($ORIGINE) devono coincidere."; exit 1; }
ATTUALE=$(sed -n 's/.*ExtensionBundleVersion="\([^"]*\)".*/\1/p' "$EST/CSXS/manifest.xml")
if ! python3 -c 'import sys; a, b = [tuple(int(x) for x in s.split(".")) for s in sys.argv[1:3]]; sys.exit(0 if b > a else 1)' "$ATTUALE" "$V"; then
  if [ "$V" != "$ATTUALE" ] || git rev-parse -q --verify "refs/tags/v$V" >/dev/null; then
    echo "La versione nuova deve essere più alta della $ATTUALE."; exit 1
  fi
fi
for f in $(python3 -c 'import json,sys; print("\n".join(t["psd"].replace(" ","%20") for t in json.load(open(sys.argv[1]))["tipi"]))' "$EST/armadi.json"); do
  [ -f "$PROGETTI/${f//%20/ }" ] || { echo "Manca il PSD: $PROGETTI/${f//%20/ }"; exit 1; }
done
NOTE=$(python3 -c 'import sys; r=[("- "+x.strip()) for x in sys.argv[1].split("|") if x.strip()]; print("\n".join(r) or "Aggiornamento.")' "$NOVITA")

echo "1/6 · versione $ATTUALE → $V"
sed -i '' -E "s/(ExtensionBundleVersion=\")[^\"]+/\1$V/; s/(<Extension Id=\"com\.borin\.configuratore\.[a-z]+\" Version=\")[^\"]+/\1$V/g" "$EST/CSXS/manifest.xml"
sed -i '' -E "s/(var VERSIONE = \")[^\"]+/\1$V/" "$EST/jsx/armadi.jsx"
node estensione/sorgenti/monta.js >/dev/null

OUT="$QUI/dist/rilascio-$V"; rm -rf "$OUT"; mkdir -p "$OUT/psd"
echo "2/6 · PSD: confronto con l'ultima release"
"$GH" release download -R "$REPO" -p aggiornamento.json -O "$OUT/precedente.json" 2>/dev/null || echo '{}' > "$OUT/precedente.json"
python3 - "$EST/armadi.json" "$PROGETTI" "$OUT/precedente.json" "$OUT/psd" "$V" > "$OUT/progetti.json" <<'PY'
import hashlib, json, os, shutil, sys
armadi, cartella, prec, dest, v = sys.argv[1:6]
prima = {p["nome"]: p for p in json.load(open(prec)).get("progetti", [])}
out = []
for t in json.load(open(armadi))["tipi"]:
    f = os.path.join(cartella, t["psd"]); h = hashlib.sha256()
    with open(f, "rb") as x:
        for blocco in iter(lambda: x.read(1 << 20), b""): h.update(blocco)
    sha, asset = h.hexdigest(), t["psd"].replace(" ", "-")
    p = prima.get(t["psd"])
    if p and p.get("sha256") == sha: versione = p["versione"]
    else:
        versione = v
        shutil.copyfile(f, os.path.join(dest, asset))
    out.append({"nome": t["psd"], "asset": asset, "sha256": sha, "byte": os.path.getsize(f), "versione": versione})
    print(("    nuovo:   " if versione == v else "    uguale:  ") + t["psd"], file=sys.stderr)
json.dump(out, sys.stdout)
PY

echo "3/6 · pacchetto di aggiornamento (senza font)"
ZIP="$OUT/BORIN-Configuratore-$V-aggiornamento.zip"
(cd estensione && zip -r -X -q "$ZIP" com.borin.configuratore -x "com.borin.configuratore/fonts/*" "com.borin.configuratore/.debug" "*/.DS_Store" "*.map")
SHA=$(shasum -a 256 "$ZIP" | cut -d' ' -f1)
python3 -c 'import json,sys,datetime; v,sha,prog,out=sys.argv[1:5]; json.dump({"versione":v,"sha256":sha,"minimoPhotoshop":"23.0","data":datetime.datetime.now().isoformat(timespec="seconds"),"progetti":json.load(open(prog))},open(out,"w"),indent=2)' \
  "$V" "$SHA" "$OUT/progetti.json" "$OUT/aggiornamento.json"

echo "4/6 · pacchetti completi (con Gotham)"
./crea_pacchetti.sh >/dev/null
if [[ "$V" =~ ^([0-9]+)\.([0-9]+)\.0$ ]]; then NOME="${BASH_REMATCH[1]}.${BASH_REMATCH[2]}"; else NOME="$V"; fi
cp "dist/BORIN Configuratore $NOME - Mac.zip" "$OUT/BORIN-Configuratore-Mac.zip"
cp "dist/BORIN Configuratore $NOME - Windows.zip" "$OUT/BORIN-Configuratore-Windows.zip"

echo "5/6 · git: commit, tag e push"
git add -A
git commit -q -m "BORIN Configuratore $V" -m "$NOTE" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" || true
git tag -a "v$V" -m "BORIN Configuratore $V"
git push -q origin HEAD "v$V"

echo "6/6 · release su GitHub (i PSD possono richiedere qualche minuto)"
PSD_NUOVI=()
while IFS= read -r -d '' f; do PSD_NUOVI+=("$f"); done < <(find "$OUT/psd" -name '*.psd' -print0)
"$GH" release create "v$V" -R "$REPO" --title "BORIN Configuratore $V" --notes "$NOTE" \
  "$ZIP" "$OUT/aggiornamento.json" "$OUT/BORIN-Configuratore-Mac.zip" "$OUT/BORIN-Configuratore-Windows.zip" ${PSD_NUOVI[@]+"${PSD_NUOVI[@]}"} >/dev/null
echo "Fatto: https://github.com/$REPO/releases/tag/v$V"
echo "I pannelli dei colleghi lo vedono alla prossima apertura, o subito con Info › Cerca aggiornamenti."
