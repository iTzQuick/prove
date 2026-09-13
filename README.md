# jdscraper — catalogo prodotti in database

Pipeline per estrarre un catalogo e-commerce (nome, brand, style code, colore,
immagini, taglie con disponibilita', prezzo, prezzo pieno, sconto) e salvarlo in
un database relazionale, con storico prezzi.

Configurato di serie per `jdsports.it`, ma la parte specifica del sito sta tutta
in un file JSON: `jdscraper/config/<sito>.json`.

## Stato

| Componente | Stato |
|---|---|
| Schema database + upsert + storico prezzi | completo, 43 test verdi |
| Estrazione JSON-LD / blob JS / selettori CSS | completa e testata su fixture |
| Robots.txt, rate limit, retry, sitemap | completi, testati offline |
| CLI (discover / scrape / export / stats / diagnostica) | completa |
| **Selettori CSS tarati sul sito reale** | **da validare** (vedi sotto) |
| Ingestione offline di pagine salvate | completa, testata |
| **Esecuzione su jdsports.it** | **non eseguita** (vedi sotto) |

### Cosa NON e' stato fatto, e perche'

**Il database non e' stato popolato con i prodotti reali di jdsports.it.**
L'ambiente in cui il codice e' stato scritto non ha accesso al web: il proxy di
uscita risponde `403` al CONNECT per qualsiasi host esterno (verificato sia su
`www.jdsports.it` sia su un host neutro), quindi non e' stato possibile scaricare
neanche il `robots.txt`. Tutte le verifiche sono state fatte su fixture HTML
locali, non sulle pagine reali.

Conseguenza pratica: i **selettori CSS** in `jdscraper/config/jdsports_it.json`
sono candidati ragionevoli ma **non verificati sul sito**. I due livelli piu'
importanti (JSON-LD e blob di stato JS) sono generici e funzionano senza taratura;
i selettori servono solo come rete di sicurezza. Il comando `check-selectors`
esiste apposta per validarli in un minuto sulla tua macchina.

### Prima di lanciarlo: regole d'uso

Questo strumento fa richieste a un sito di terzi. Prima di usarlo su tutto il
catalogo:

- leggi i **Termini di servizio** di jdsports.it e il suo `robots.txt`;
- lo scraping massivo di un catalogo commerciale puo' violare i ToS anche quando
  `robots.txt` non lo vieta tecnicamente: se il dato ti serve per lavoro, la via
  pulita e' chiedere un **feed prodotti** o l'accesso al **programma affiliazione**
  (Awin/Rakuten per JD), che danno gli stessi campi in CSV/XML, aggiornati e senza
  rischi;
- il database costruito contiene dati (descrizioni, immagini) su cui il sito ha
  diritti: attenzione a ripubblicarli.

Il codice **non ha un flag per ignorare `robots.txt`**: se una URL e' vietata,
viene saltata e contata, punto.

### Se non vuoi (o non puoi) far uscire richieste automatiche

C'e' un percorso completamente offline: salvi le pagine dal browser (Ctrl+S) in
una cartella e il tool le importa in blocco, senza aprire nessuna connessione.

```bash
python -m jdscraper ingest-dir ./pagine-salvate --db sqlite:///catalogo.db
```

L'URL di origine, che una pagina salvata perde, viene ripreso dal
`<link rel="canonical">` o da `og:url` dentro la pagina stessa; se mancano, puoi
affiancare un file `pagina.html.url` con dentro l'indirizzo. Serve a ricostruire
`source_id` e a rendere assolute le immagini con percorso relativo.

## Il comando unico

```bash
./ottieni-catalogo.sh
```

Crea il virtualenv, installa le dipendenze, scopre le URL dalle sitemap,
scarica i prodotti, costruisce `catalogo.db` ed esporta `catalogo.csv`,
`catalogo.json` e `sconti.csv`. E' interrompibile con Ctrl+C — il database resta
valido a meta' e rilanciando lo stesso comando riprende senza duplicare nulla,
aggiornando prezzi e storico.

```bash
./ottieni-catalogo.sh --limit 200            # prova su 200 prodotti
./ottieni-catalogo.sh --images               # scarica anche le immagini
./ottieni-catalogo.sh --offline ./pagine     # da pagine salvate, senza rete
```

## Installazione manuale

```bash
pip install -r requirements.txt
```

## Uso comando per comando

```bash
# 1. Verifica che i selettori reggano su una pagina prodotto reale
python -m jdscraper check-selectors "https://www.jdsports.it/product/..."

# 2. Elenca le URL prodotto dalle sitemap (nessuna pagina scaricata)
python -m jdscraper discover --limit 100 --out urls.txt

# 3. Prova su poche pagine prima di allargare
python -m jdscraper scrape --urls urls.txt --limit 20 --db sqlite:///catalogo.db

# 4. Crawl completo, con immagini su disco
python -m jdscraper scrape --db sqlite:///catalogo.db --download-images ./immagini --delay 3

# 5. Risultati
python -m jdscraper stats --db sqlite:///catalogo.db
python -m jdscraper export --db sqlite:///catalogo.db --out catalogo.csv
python -m jdscraper export --db sqlite:///catalogo.db --out sconti.json --format json --only-discounted
```

Per PostgreSQL basta cambiare la stringa di connessione:
`--db postgresql+psycopg://utente:password@host/catalogo`.

Estrazione da un HTML gia' salvato, senza rete:

```bash
python -m jdscraper parse-file pagina.html --url "https://www.jdsports.it/product/x/1/"

# oppure un'intera cartella (ricorsiva)
python -m jdscraper ingest-dir ./pagine-salvate --db sqlite:///catalogo.db
```

## Schema

```
products ──┬── product_images   (url, posizione, percorso locale)
           ├── product_sizes    (taglia, disponibile, sku variante, prezzo)
           └── price_history    (snapshot: prezzo, prezzo pieno, sconto, stock)
crawl_runs (una riga per esecuzione: URL viste, nuovi, aggiornati, errori)
```

Campi principali di `products`: `source`, `source_id`, `url`, `name`, `brand`,
`style_code`, `sku`, `gtin`, `colour`, `gender`, `category`, `breadcrumb`,
`description`, `currency`, `price`, `list_price`, `discount_amount`,
`discount_percent`, `is_discounted`, `availability`, `in_stock`, `rating`,
`review_count`, `first_seen`, `last_seen`, `extraction_method`, `raw`.

Chiave naturale: `(source, source_id)` — lo stesso database puo' ospitare piu'
negozi. `source_id` e' lo style code se disponibile, altrimenti l'ID numerico
ricavato dall'URL.

Note di comportamento:

- `is_discounted` e' vero solo quando esiste un prezzo pieno **maggiore** di
  quello corrente; se i due valori arrivano invertiti dalla pagina, vengono
  normalizzati.
- Un crawl che non riesce a leggere un campo **non azzera** il valore gia' in
  database: i dati parziali non distruggono quelli buoni.
- `price_history` cresce solo quando prezzo, sconto o disponibilita' cambiano
  davvero, quindi ricrawlare ogni giorno non gonfia la tabella.

## Quanto ci mette

Il collo di bottiglia e' il rate limiter, non la banda: le richieste partono una
ogni `--delay` secondi (default 3), e i worker non cambiano il conto. Quindi la
durata e' `numero di prodotti x delay`, e basta contare le URL che restituisce
`discover` per sapere in anticipo dove si va a finire — il comando la stampa da
solo. Con delay 3s:

| Prodotti | Solo dati | Con `--images` |
|---|---|---|
| 1.000  | ~52 minuti | ~80 minuti |
| 10.000 | ~8,8 ore   | ~13 ore |
| 20.000 | ~17,5 ore  | ~27 ore |
| 40.000 | ~35 ore    | ~2,2 giorni |

Le immagini hanno un limitatore separato e molto piu' rapido (`asset_delay`,
0,25s): stanno su CDN dimensionate per il traffico dei browser, e applicargli il
delay delle pagine moltiplicherebbe la durata per il numero di immagini per
prodotto senza alcun guadagno in cortesia. Restano comunque soggette a robots.txt.

Se `robots.txt` dichiara un `Crawl-delay` piu' alto di quello impostato, vince il
suo e i tempi si allungano di conseguenza.

Non serve fare tutto in una volta: il crawl e' interrompibile e riprendibile, e
`--limit` permette di lavorare a blocchi.

## Come funziona l'estrazione

Tre livelli in cascata, dal piu' stabile al piu' fragile:

1. **JSON-LD** (`schema.org/Product`): nome, brand, sku/mpn, colore, immagini,
   rating, offerte. Le offerte multiple vengono lette come taglie; il prezzo
   pieno arriva da `priceSpecification` con `priceType: ListPrice`.
2. **Blob di stato JS** (`__NEXT_DATA__`, `window.__INITIAL_STATE__`, ...):
   copre cio' che il sito rende lato client, tipicamente taglie e prezzo barrato.
3. **Selettori CSS** dal file di configurazione: ultima spiaggia.

Ogni campo viene preso dal primo livello che lo fornisce, quindi un cambio di
markup degrada la qualita' del dato invece di rompere l'estrazione. Il campo
`extraction_method` registra quali livelli hanno contribuito.

## Adattare a un altro sito

Copia `jdscraper/config/jdsports_it.json`, cambia `source`, `root`,
`product_url_pattern` e i selettori. Nessuna modifica al codice.

## Test

```bash
pip install -r requirements-dev.txt
python -m pytest tests/ -q      # 58 test, tutti offline
```

I test coprono parsing prezzi in formato italiano, i tre livelli di estrazione,
il calcolo dello sconto, upsert e storico prezzi, export, l'ingestione offline di
una cartella di pagine salvate e — con una sessione HTTP finta — il rispetto di
`robots.txt`, il crawl-delay e i retry.
