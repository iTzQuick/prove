# Blocking Studio — note per Claude

Editor 3D da browser (Three.js, nessuna build) che produce prompt e richieste per Higgsfield.
Parla con l'utente in italiano; prompt, tag e descrizioni Element in inglese. Per regole di prompt
e routing dei modelli usa la skill `higgsfield-director`.

## Struttura
- `src/prompt.js` — analisi scena e prompt; `buildMcpRequests()` crea i parametri per il connettore.
- `src/main.js` — UI; `window.blocking` è l'API headless usata da `tools/handoff.cjs`.
- `tools/handoff.cjs` — esporta per ogni shot blockout PNG, video di blocking e `request.json` in `handoff/<SHOT>/`.
- `higgsfield/elements.json` — copia locale della libreria "My elements" (git-ignored: contiene progetti dell'utente).

## Connettore Higgsfield: procedura
Comandi tipici dell'utente: "aggiorna libreria", "genera keyframe SC01_SH02", "genera bozza SC01_SH02", "finalizza SC01_SH02".

1. **Libreria Elements** ("aggiorna libreria"): `elements_search` (size 100, segui `cursor`) → riscrivi
   `higgsfield/elements.json` come `{source, synced, elements:[{id,name,category,description}]}`.
2. **Progetto**: l'utente salva il progetto (Progetto → Salva .json) nel repo, oppure usa la demo.
   `node tools/handoff.cjs [progetto.json] --shots SC01_SH02` → `handoff/SC01_SH02/`.
   Leggi `request.json` → `higgsfield` (`keyframe`, `video`, `missing`, `notes`).
   Se `missing` non è vuoto, dillo prima di generare.
3. **Risolvere i segnaposto** in `medias[].value`:
   - `upload:<file>` → `media_upload` (filename) → `curl -X PUT --upload-file handoff/<SHOT>/<file> "<upload_url>"` → `media_confirm` (type image/video).
   - `element:<id>` → `elements_get` → `image_url` → `media_import_url` → media_id.
   - `job:<SHOT>_keyframe_start` → job_id del keyframe approvato dall'utente.
   I `<<<element_id>>>` nel prompt del keyframe restano così (gpt_image_2_6 li risolve).
4. **Costo prima di tutto**: `estimate_image_cost` / `estimate_video_cost` con gli stessi params; riporta il
   costo e **chiedi conferma**. Mai generare né spendere crediti senza un sì esplicito per quella richiesta.
   Non impostare `use_unlim` se l'utente non lo chiede.
5. **Ordine**: keyframe (`generate_image`) → l'utente approva → bozza video (`generate_video`, 480p, `draft: true`
   su Seedance) → l'utente approva → finale (Seedance: `draft_job_id` + risoluzione finale entro 7 giorni;
   CS4: rigenera alla risoluzione finale). Aspetta con `jobs_wait`, controlla inizio/metà/fine.
6. **Preferenze**: prima della prima generazione `get_preferences`; non creare progetti se `auto_create_project` è false.

## Limiti noti
- Gli id del Director's Panel di Cinema Studio 4.0 (`genre_id`, `camera_lens_id`, ...) non sono elencati dal
  connettore: per questo il prompt via connettore scrive per esteso stile, lente e luce.
- Con `start_image` + `image_references`, la numerazione `@Image N` conta solo le `image_references`
  (scelta da verificare sul primo risultato reale).
- Kling 4.0 e Veo 3.1: solo prompt da interfaccia web, nessuna richiesta via connettore.

## Test
Server: `python3 -m http.server 8765`; Playwright è preinstallato (`require('playwright')`).

## Aggiornamenti e cache del telefono
Dopo ogni modifica ai file dell'app esegui `node tools/stamp-version.cjs` prima del commit: mette una versione
negli URL di CSS e moduli (import map), così Safari e l'app sulla schermata Home scaricano i file nuovi.
La versione si legge nel menu ⋯ del telefono ("Ricarica l'app").

## Versione online (claude.ai)
Link privato: https://claude.ai/artifact/9PLHmeN6d7aX3WbCzYDxVJ
Per aggiornarla: `node tools/stamp-version.cjs && node tools/build-artifact.cjs`, poi ripubblica
`dist/artifact/index.html` con gli stessi `files` (src/*.js, projects/arena.blocking.json, higgsfield/elements.json).
Dentro claude.ai i download automatici sono bloccati: `deliverFiles` mostra i file in una finestra (salva con tasto destro / pressione lunga).
