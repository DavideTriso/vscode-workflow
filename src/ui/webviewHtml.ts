import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';

function button(id: string, label: string, isSecondary = false): string {
  return `<button id="${id}" class="${isSecondary ? 'secondary' : ''}">${label}</button>`;
}

function step(id: string, title: string, body: string): string {
  return `<section class="step" id="step-${id}">
  <h2><span class="badge" id="badge-${id}"></span>${title}</h2>
  ${body}
</section>`;
}

export function renderWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const nonce = randomBytes(16).toString('base64');
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview.js'));
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'webview.css'));

  const steps = [
    step(
      'analysis',
      '1. Analisi',
      `<p class="hint">Definisci requisiti e piano con Copilot in modalità <strong>Plan</strong>. Le informazioni vengono catturate con il pulsante oppure <span id="autoCaptureHint">automaticamente all'avvio dell'implementazione</span>.</p>
       ${button('captureAnalysis', 'Cattura requisiti e piano')}
       <p class="status" id="analysisStatus"></p>`,
    ),
    step('implementation', '2. Implementazione', `<p class="hint">Implementa a mano, con Copilot o in modo misto.</p>`),
    step(
      'review',
      '3. Test e review funzionali',
      `<p class="hint">L'agente confronta piano e stato attuale (git diff) e poi esegue la code review. Ripetibile dopo ogni correzione.</p>
       ${button('startReview', 'Avvia review AI')}
       ${button('captureReviewResponse', 'Cattura ultima risposta', true)}
       <p class="status" id="reviewStatus"></p>`,
    ),
    step(
      'styleCheck',
      '4. Verifica stilistica',
      `<p class="hint">L'agente verifica l'allineamento stilistico con il codice esistente. L'esito resta nella chat.</p>
       ${button('startStyleCheck', 'Avvia verifica stilistica')}
       <p class="status" id="styleCheckStatus"></p>`,
    ),
    step(
      'tests',
      '5. Test finali',
      `<label class="check"><input type="checkbox" id="automatedExecuted"> Ho eseguito i test automatici</label>
       <textarea id="automatedNotes" rows="3" placeholder="Note opzionali: quali test (intera suite, solo una classe...) e perché"></textarea>
       <label class="check"><input type="checkbox" id="manualExecuted"> Ho eseguito i test manuali</label>
       <textarea id="manualNotes" rows="3" placeholder="Note opzionali: quali test manuali hai eseguito"></textarea>`,
    ),
    step(
      'finalNotes',
      '6. Note finali',
      `<textarea id="finalNotes" rows="4" placeholder="Note finali opzionali sull'implementazione"></textarea>`,
    ),
    step(
      'commit',
      '7. Commit',
      `<ul class="missing" id="missingRequirements"></ul>
       <p class="status" id="commitStatus"></p>
       ${button('stageSessionFile', 'Aggiungi il file di workflow allo stage')}
       ${button('openSourceControl', 'Apri Source Control', true)}`,
    ),
  ].join('\n');

  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${styleUri}">
</head>
<body>
  <p class="notice" id="noChatNotice">Nessuna chat Copilot trovata. Avvia una conversazione con Copilot Chat (modalità Plan) per iniziare.</p>
  <div id="content" hidden>
    <p class="status" id="sessionFile"></p>
    ${steps}
    <footer>
      ${button('openSessionFile', 'Apri file di workflow', true)}
      ${button('installCommitGuard', 'Installa guardia pre-commit', true)}
    </footer>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
