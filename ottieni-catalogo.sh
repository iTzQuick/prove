#!/usr/bin/env bash
# Costruisce il database del catalogo da zero, in un comando solo.
#
#   ./ottieni-catalogo.sh                 # catalogo completo
#   ./ottieni-catalogo.sh --limit 200     # prova su 200 prodotti
#   ./ottieni-catalogo.sh --offline ./pagine-salvate
#
# Interrompibile: il database e' valido anche a meta' e rilanciando riprende
# senza duplicare nulla.

set -euo pipefail

DB="${DB:-sqlite:///catalogo.db}"
CONFIG="${CONFIG:-jdsports_it}"
DELAY="${DELAY:-3}"
LIMIT=""
OFFLINE_DIR=""
IMAGES=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --limit)   LIMIT="$2"; shift 2 ;;
    --offline) OFFLINE_DIR="$2"; shift 2 ;;
    --images)  # la cartella e' opzionale: "--images" da solo usa ./immagini
               if [[ -n "${2:-}" && "${2}" != --* ]]; then IMAGES="$2"; shift 2
               else IMAGES="./immagini"; shift 1; fi ;;
    --db)      DB="$2"; shift 2 ;;
    --delay)   DELAY="$2"; shift 2 ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "opzione sconosciuta: $1" >&2; exit 2 ;;
  esac
done

cd "$(dirname "$0")"
step() { printf '\n\033[1;34m==> %s\033[0m\n' "$1"; }
warn() { printf '\033[1;33m!! %s\033[0m\n' "$1" >&2; }

step "Ambiente Python"
if [[ ! -d .venv ]]; then
  python3 -m venv .venv
  echo "creato .venv"
fi
# shellcheck disable=SC1091
source .venv/bin/activate
pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt
echo "dipendenze pronte: $(python -c 'import sys; print(sys.version.split()[0])')"

if [[ -n "$OFFLINE_DIR" ]]; then
  step "Importo le pagine gia' salvate in $OFFLINE_DIR"
  python -m jdscraper ingest-dir "$OFFLINE_DIR" --db "$DB" --config "$CONFIG"
else
  step "Cerco le URL prodotto nelle sitemap"
  DISCOVER_ARGS=(--config "$CONFIG" --delay "$DELAY" --out urls.txt)
  [[ -n "$LIMIT" ]] && DISCOVER_ARGS+=(--limit "$LIMIT")

  if ! python -m jdscraper discover "${DISCOVER_ARGS[@]}"; then
    warn "Scoperta fallita."
    warn "Se il messaggio sopra parla di robots.txt irraggiungibile, il problema"
    warn "e' la rete di QUESTA macchina (proxy/VPN/firewall), non il catalogo."
    warn "Alternativa senza crawl: salva le pagine dal browser e lancia"
    warn "  ./ottieni-catalogo.sh --offline ./pagine-salvate"
    exit 1
  fi

  COUNT=$(wc -l < urls.txt | tr -d ' ')
  echo "URL trovate: $COUNT"
  [[ "$COUNT" -eq 0 ]] && { warn "Nessuna URL prodotto: controlla product_url_pattern nel config."; exit 1; }

  step "Scarico i prodotti (delay ${DELAY}s, interrompibile con Ctrl+C)"
  SCRAPE_ARGS=(--config "$CONFIG" --db "$DB" --urls urls.txt --delay "$DELAY")
  [[ -n "$LIMIT" ]] && SCRAPE_ARGS+=(--limit "$LIMIT")
  [[ -n "$IMAGES" ]] && SCRAPE_ARGS+=(--download-images "$IMAGES")
  python -m jdscraper scrape "${SCRAPE_ARGS[@]}" || warn "Crawl interrotto: il database contiene quanto scaricato finora."
fi

step "Statistiche"
python -m jdscraper stats --db "$DB"

step "Export"
python -m jdscraper export --db "$DB" --out catalogo.csv
python -m jdscraper export --db "$DB" --out catalogo.json --format json
python -m jdscraper export --db "$DB" --out sconti.csv --only-discounted

printf '\n\033[1;32mFatto.\033[0m  database: %s\n' "${DB#sqlite:///}"
echo "        tabelle: catalogo.csv, catalogo.json, sconti.csv"
echo "        rilancia lo stesso comando per aggiornare prezzi e storico."
