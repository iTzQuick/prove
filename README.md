# Blocking Studio — regia 3D per Higgsfield

Editor 3D da browser per **dirigere una scena con forme e manichini** e trasformarla in materiale pronto per Higgsfield: frame puliti, video di blocking, location pack, prompt Seedance 2.5 / Cinema Studio 4.0 / Kling 4.0 / Veo 3.1, asset bible e shot list.
Le regole di scrittura seguono la skill **Higgsfield Director**.

## Avvio

Non servono installazioni né build: basta un server statico.

```bash
python3 -m http.server 8000
# poi apri http://localhost:8000
```

Al primo avvio si apre una scena demo con due shot. *Progetto → Nuovo progetto* riparte da zero. Il lavoro si salva da solo nel browser; per conservarlo usa *Progetto → Salva progetto (.json)*.

## Cosa fa

| Area | Funzioni |
|---|---|
| Scena | Manichini articolati (17 articolazioni, 15 pose preset, altezza fissa, colore = identità), forme (cubo, sfera, cilindro, cono), set (muri, porta, finestra, scale, colonne, tavolo, sedia, divano, letto, albero, lampada pratica), oggetti (auto, telefono, bottiglia, valigetta) |
| Regia | Gizmo sposta/ruota/scala, modalità **Posa** (clic su un arto e lo ruoti), vista libera o **Camera shot** con formato 16:9 / 9:16 / 21:9 / 1:1, griglia dei terzi, lente in mm, 10 rig camera |
| Tempo | Timeline per shot con key per oggetti e camera (trascinabili), play/loop, beat d'azione in secondi interi |
| Luce | Preset del Director's Panel (Window, Contre-jour, Silhouette, Overhead fall, Soft cross, Practicals) orientati rispetto alla camera, più regolazione manuale |
| Prompt | Prompt video a sezioni (References, Style, Scene, Characters, Location, First frame, Action, Camera, Physics, Lighting, Audio, Locks), keyframe start/end, sheet Element, prompt location, impostazioni + costo indicativo, rischi |
| Export | Start/end frame PNG senza griglia né gizmo, depth map, **video di blocking** (MP4/WebM) da usare come `@Video 1`, location pack vuoto (3 viste), shot list Markdown, pacchetto JSON per shot |

## Come si lavora (flusso consigliato)

1. **Progetto**: look, style lock, `@tag` della location, descrizione e ora del giorno.
2. **Blocca il set** con muri e arredi. **Aggiungi i manichini**, uno per personaggio, ognuno con un colore diverso, il suo `@tag` Element, la descrizione fissa e l'altezza.
3. **Camera shot** (`V`): inquadra col mouse e scegli lente e rig nel tab *Shot*. Premi `C` per i key camera.
4. **Anima**: seleziona un personaggio, porta la timeline al secondo giusto, muovilo o mettilo in posa e premi `K`. Ogni modifica successiva crea o aggiorna il key.
5. **Azione**: il tab *Azione* genera i beat dai keyframe. Puoi riscriverli in inglese, una sola azione per intervallo.
6. **Prompt Higgsfield**:
   - tab *Elements* → crea gli Element;
   - tab *Location* → con *Esporta → Location pack* crei l'Element location;
   - tab *Keyframe* → con *Esporta → Start frame* crei il keyframe realistico;
   - tab *Video* → bozza a 480p con start frame + `@Video 1` + prompt, poi la versione finale.

Il prompt sa da solo **chi è in campo** e conta solo quello. È la regola della skill: ciò che è fuori campo non esiste. Mappa il colore di ogni manichino sul suo `@tag`, così il video di blocking guida camera e blocking senza che il modello ne copi forme o materiali.

## Scorciatoie

`W` `E` `R` sposta/ruota/scala · `P` posa · `K` key oggetto · `C` key camera · `V` vista libera/camera · `F` centra · `Spazio` play · `←` `→` scorri (Shift = 1 s) · `Ctrl+Z` / `Ctrl+Shift+Z` · `Ctrl+D` duplica · `Canc` elimina

## Struttura

```
index.html          interfaccia
css/style.css       stile
src/main.js         viewport, selezione, gizmo, timeline, inspector, modale
src/mannequin.js    manichino articolato e pose
src/objects.js      forme, set e oggetti
src/anim.js         keyframe, interpolazione, lente/campo visivo
src/prompt.js       analisi della scena e scrittura dei prompt Higgsfield
src/export.js       frame puliti, depth, video di blocking, location pack
vendor/three/       Three.js r160 (MIT)
```

Note: costi e limiti dei modelli sono indicativi (Higgsfield cambia spesso). Fa fede il pulsante *Generate*. Se Higgsfield rifiuta un video WebM, convertilo in MP4.
