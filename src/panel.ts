import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import { WorkflowController } from './controller';

export class WorkflowPanel implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  constructor(private readonly extensionUri: vscode.Uri, private readonly controller: WorkflowController) {}

  refresh(): void {
    void this.view?.webview.postMessage({ type: 'state', session: this.controller.current });
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    const media = vscode.Uri.joinPath(this.extensionUri, 'media');
    view.webview.options = { enableScripts: true, localResourceRoots: [media] };
    const nonce = randomBytes(18).toString('base64');
    const script = view.webview.asWebviewUri(vscode.Uri.joinPath(media, 'panel.js'));
    const css = view.webview.asWebviewUri(vscode.Uri.joinPath(media, 'panel.css'));
    view.webview.html = `<!DOCTYPE html>
<html lang="it"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${view.webview.cspSource}; script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${css}"><title>Development Workflow</title></head>
<body>
<h2>Development Workflow</h2>
<p id="session">Nessuna sessione attiva</p>
<button data-action="new">Nuova sessione</button>
<button data-action="record">Apri file sessione</button>
<section><h3>1 · Analisi <span id="analysis-status"></span></h3>
<p>Usa <code>@workflow /plan</code> nella chat per pianificare senza modificare codice.
Per Plan nativo, importa il piano completo dall’editor o dagli appunti.</p>
<button data-action="plan">Pianifica in Copilot</button>
<button data-action="capture">Acquisisci piano</button></section>
<section><h3>2 · Implementazione <span id="implementation-status"></span></h3>
<button data-action="implement">Avvia con Copilot</button>
<button data-action="manual">Avvia manualmente</button>
<p>L’avvio con <code>@workflow /implement</code> acquisisce anche l’ultimo piano della chat.</p></section>
<section><h3>3 · Test e review funzionale <span id="review-status"></span></h3>
<button data-action="review">Confronta piano e rivedi codice</button>
<p>Ogni esecuzione salva piano finale, divergenze e rilievi. Ripeti dopo le correzioni.</p></section>
<section><h3>4 · Stile <span id="style-status"></span></h3>
<button data-action="style">Verifica stile in Copilot</button>
<p>La valutazione rimane solo in chat.</p></section>
<section><h3>5 · Test finali</h3>
<label><input id="automated" type="checkbox"> Ho eseguito i test automatici necessari</label>
<label for="automatedNotes">Test automatici e motivazioni (opzionale)</label>
<textarea id="automatedNotes" maxlength="100000" rows="3"></textarea>
<label><input id="manual" type="checkbox"> Ho eseguito i test manuali necessari</label>
<label for="manualNotes">Descrizione test manuali (opzionale)</label>
<textarea id="manualNotes" maxlength="100000" rows="3"></textarea>
<p>Lascia la casella vuota se i test non sono necessari. Le conferme vengono azzerate dopo una nuova review.</p></section>
<section><h3>6 · Note finali</h3>
<label for="finalNotes">Note sull’implementazione (opzionale)</label>
<textarea id="finalNotes" maxlength="100000" rows="4"></textarea>
<button data-action="save">Salva test e note</button></section>
<section><h3>7 · Commit</h3>
<button data-action="commit">Verifica e prepara commit</button>
<p>Verifica i passi e aggiunge solo il JSON allo staging. Il commit resta sotto il tuo controllo.</p></section>
<p id="message" role="status" aria-live="polite"></p>
<script nonce="${nonce}" src="${script}"></script></body></html>`;
    view.onDidDispose(() => { this.view = undefined; });
    view.webview.onDidReceiveMessage(async (message: unknown) => {
      try {
        if (!message || typeof message !== 'object') { throw new Error('Messaggio non valido.'); }
        const data = message as Record<string, unknown>;
        if (data.action === 'ready') {
          await this.controller.exclusive(async () => { await this.controller.ensure(); });
          this.refresh();
          return;
        }
        await view.webview.postMessage({ type: 'busy', value: true });
        let captureChat = false;
        await this.controller.exclusive(async () => {
          if (data.sessionId !== this.controller.current?.id) { throw new Error('Sessione cambiata: ricarica il pannello prima di salvare.'); }
          const actions = ['new', 'plan', 'capture', 'implement', 'manual', 'review', 'style', 'save', 'record', 'commit'];
          if (typeof data.action !== 'string' || !actions.includes(data.action)) { throw new Error('Azione non riconosciuta.'); }
          if (data.action !== 'new' && data.action !== 'record') { await this.controller.notes(data.notes); }
          switch (data.action) {
            case 'new':
              if (this.controller.current) { await this.controller.notes(data.notes); }
              await this.controller.newSession(); break;
            case 'capture': captureChat = await this.controller.importAnalysis(); break;
            case 'manual': await this.controller.implement(); break;
            case 'plan': case 'implement': case 'review': case 'style': break;
            case 'save': break;
            case 'record': await this.controller.showRecord(); break;
            case 'commit': await this.controller.prepareCommit(); break;
            default: throw new Error('Azione non riconosciuta.');
          }
        });
        if (['plan', 'implement', 'review', 'style'].includes(data.action as string)) {
          await this.controller.openChat(data.action as string);
        }
        if (captureChat) { await this.controller.openChat('capture'); }
        await view.webview.postMessage({ type: 'saved' });
        await view.webview.postMessage({ type: 'message', text: 'Operazione completata.' });
      } catch (error) {
        await view.webview.postMessage({ type: 'message', text: error instanceof Error ? error.message : 'Errore workflow.' });
      } finally {
        await view.webview.postMessage({ type: 'busy', value: false });
      }
    });
  }
}
