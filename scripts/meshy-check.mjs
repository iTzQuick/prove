#!/usr/bin/env node
// Diagnostica connettività + autenticazione verso l'API Meshy.
// Uso: node scripts/meshy-check.mjs
//
// Funziona con entrambe le strade di configurazione:
//  - API credentials dell'environment: il proxy aggiunge l'header Authorization
//    da solo, quindi MESHY_API_KEY non esiste e lo script non lo manda.
//  - Variabile d'ambiente MESHY_API_KEY: lo script manda l'header lui stesso.

const URL_PROBE = 'https://api.meshy.ai/openapi/v2/text-to-3d';
const key = process.env.MESHY_API_KEY;

const headers = { Accept: 'application/json' };
if (key) headers.Authorization = `Bearer ${key}`;

console.log(`→ GET ${URL_PROBE}`);
console.log(`  header Authorization: ${key ? 'inviato dallo script (MESHY_API_KEY)' : 'non inviato (atteso dal proxy)'}`);

let res;
try {
  res = await fetch(URL_PROBE, { headers, signal: AbortSignal.timeout(30_000) });
} catch (err) {
  console.error(`\n✖ Connessione fallita: ${err.message}`);
  console.error('  → La rete è ancora bloccata. Controlla che Network access sia su');
  console.error('    "Custom" con *.meshy.ai fra gli Allowed domains, e soprattutto');
  console.error('    che tu abbia aperto una sessione NUOVA dopo aver salvato.');
  process.exit(1);
}

const body = await res.text();
console.log(`\n← HTTP ${res.status} ${res.statusText}`);
console.log(body.slice(0, 600) || '(corpo vuoto)');

// Il proxy dell'environment risponde 403 con un messaggio proprio quando l'host
// non è in allowlist: va distinto da un 403 che arriva davvero da Meshy.
const bloccatoDalProxy = /not in allowlist|network egress settings/i.test(body);

console.log('\nLettura:');
if (bloccatoDalProxy) {
  console.log('  ✖ Rete ANCORA BLOCCATA: la risposta viene dal proxy, non da Meshy.');
  console.log('    → Network access su "Custom" con *.meshy.ai fra gli Allowed domains,');
  console.log('      e soprattutto apri una sessione NUOVA dopo aver salvato:');
  console.log('      le sessioni già avviate non rileggono la configurazione.');
  process.exit(1);
} else if (res.status === 200) {
  console.log('  ✔ Rete OK e autenticazione OK. Si può costruire.');
} else if (res.status === 401 || res.status === 403) {
  console.log('  ● Rete OK: siamo arrivati a Meshy. È la chiave a non andare.');
  console.log('    Verifica il valore, il prefisso "Bearer" e gli Allowed websites.');
} else if (res.status === 404) {
  console.log('  ● Rete OK: Meshy risponde, ma questo endpoint non esiste più.');
  console.log('    Va solo corretto il path sulla documentazione attuale.');
} else if (res.status === 429) {
  console.log('  ● Rete e auth OK, ma sei a rate limit o senza crediti.');
} else {
  console.log('  ● Rete OK (la risposta arriva da Meshy). Vedi il corpo qui sopra.');
}
