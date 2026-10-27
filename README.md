# Copilot Workflow Guide

Estensione VS Code (Windows e macOS, VS Code ≥ 1.105) che guida lo sviluppatore in un workflow standard integrato con GitHub Copilot Chat e registra ogni step in un file versionato nel repository.

L'unica UI aggiunta è una vista **Workflow** nella Secondary Side Bar (la stessa dove vive Copilot Chat); tutta l'interazione con l'AI resta nella chat.

## Workflow

| Step | Cosa fa l'estensione |
|---|---|
| 1. Analisi | Cattura requisiti (messaggi in modalità Plan) e piano (ultima risposta Plan): con il pulsante **Cattura**, oppure in automatico quando dopo il Plan parte un'implementazione. |
| 2. Implementazione | Libera (manuale, Copilot o misto). |
| 3. Review | **Avvia review AI** invia in chat requisiti, piano e `git diff HEAD`; l'agente produce *Piano finale e divergenze* + *Code review*. La risposta viene catturata automaticamente (o con **Cattura ultima risposta**). Ripetibile. |
| 4. Stile | **Avvia verifica stilistica** invia il prompt in chat; nessuna cattura. |
| 5. Test | Checkbox + note per test automatici e manuali. |
| 6. Note finali | Campo libero opzionale. |
| 7. Commit | **Aggiungi il file di workflow allo stage** (abilitato solo con analisi, ≥1 review e verifica stilistica). Opzionale: **Installa guardia pre-commit** (hook git che blocca i commit senza file di workflow; bypass con `--no-verify`). |

Ogni sessione di chat Copilot genera un file `.copilot-workflow/<AAAAMMGG-HHMMSS>-<id>.json` (JSON con LF, diff stabili tra OS).

## Impostazioni

- `copilotWorkflow.outputFolder` (default `.copilot-workflow`)
- `copilotWorkflow.autoCaptureAnalysis` (default `true`)
- `copilotWorkflow.planModeNamePattern` (regex, default `plan`)
- `copilotWorkflow.maxDiffCharacters` (default `80000`)

## Limiti noti (da conoscere)

- VS Code non espone un'API pubblica per leggere la chat né per aggiungere tab alla vista di Copilot. L'estensione:
  - legge i file di sessione `chatSessions/*.json(l)` nello storage del workspace (formato interno, isolato in `src/infrastructure/chat/`; può cambiare tra versioni di VS Code);
  - mostra la vista nella Secondary Side Bar, accanto a Copilot Chat.
- I prompt sono inviati con `workbench.action.chat.open` in modalità *ask*.
- Si assume che la prima cartella del workspace sia la root del repository git.
- Il riconoscimento della modalità Plan si basa sul nome della modalità (`planModeNamePattern`); se non riconosciuta, **Cattura** usa l'ultima risposta della chat.

## Architettura

```
src/domain          modello della sessione e calcolo dell'avanzamento (puro)
src/application     casi d'uso (WorkflowService), prompt, estrazione piano/review, porte
src/infrastructure  adattatori: file JSON, chat di VS Code, git CLI, hook, API vscode
src/ui              vista webview (provider, HTML, script) e contratto dei messaggi
test                vitest (dominio, applicazione con fake, adattatori su repo git reali)
```

## Sviluppo

```
npm install
npm run typecheck && npm test
npm run build        # F5 per avviare l'Extension Development Host
npm run package      # genera il .vsix
```
