# prove

## Verifica connessione Meshy AI

Le sessioni cloud girano dietro un proxy con allowlist di domini. Per usare
l'API Meshy va configurato l'environment su claude.ai/code (icona nuvola sopra
la casella del messaggio -> ingranaggio sull'environment):

- **Network access**: `Custom`, con `*.meshy.ai` fra gli **Allowed domains**,
  e la casella "Also include default list of common package managers" spuntata
  (altrimenti si perdono npm, PyPI e gli altri registri).
- **La chiave**, in alternativa:
  - **API credentials** (piani Pro/Max): tipo `Bearer`, allowed website
    `api.meshy.ai`, header `Authorization` con prefisso `Bearer`. La chiave
    resta fuori dalla VM.
  - **Environment variables**: `MESHY_API_KEY=...`. Leggibile da chiunque usi
    l'environment.

Le sessioni leggono la configurazione **una sola volta all'avvio**: dopo aver
salvato bisogna aprire una sessione nuova.

Per verificare:

```sh
node scripts/meshy-check.mjs
```

Lo script distingue i tre casi: host ancora bloccato dal proxy, Meshy
raggiungibile ma chiave non valida, tutto funzionante.
