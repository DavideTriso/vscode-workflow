import * as vscode from 'vscode';
import { realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { GitRepository } from './git';
import { SessionStore, isInside } from './store';
import { capture, invalidateChecks, readiness, RECORD_DIRECTORY, requireAnalysis, Session, updateNotes } from './session';

export interface ActiveSession {
  session: Session;
  store: SessionStore;
  git: GitRepository;
}

export class WorkflowController implements vscode.Disposable {
  private active?: ActiveSession;
  private readonly changes = new vscode.EventEmitter<Session | undefined>();
  readonly onDidChange = this.changes.event;
  private busy = false;

  constructor(private readonly state: vscode.Memento) {}

  get current(): Session | undefined { return this.active?.session; }

  async exclusive<T>(operation: () => Promise<T>): Promise<T> {
    if (this.busy) { throw new Error('Un’operazione workflow è già in corso. Attendi il completamento.'); }
    this.busy = true;
    try { return await operation(); } finally { this.busy = false; }
  }

  async repository(): Promise<string> {
    if (!vscode.workspace.isTrusted) { throw new Error('È necessario un workspace attendibile.'); }
    const folders = (vscode.workspace.workspaceFolders ?? []).filter(folder => folder.uri.scheme === 'file');
    const folder = folders.length === 1 ? folders[0]
      : await vscode.window.showWorkspaceFolderPick({ placeHolder: 'Seleziona il repository per il workflow' });
    if (!folder || folder.uri.scheme !== 'file') { throw new Error('Apri una cartella locale con un repository Git.'); }
    const git = new GitRepository(folder.uri.fsPath);
    const root = await realpath((await git.run(['rev-parse', '--show-toplevel'])).trim());
    if (!isInside(root, await realpath(folder.uri.fsPath))) { throw new Error('Repository non valido.'); }
    return root;
  }

  async select(root: string, id?: string, fresh = false): Promise<ActiveSession> {
    if (!vscode.workspace.isTrusted) { throw new Error('È necessario un workspace attendibile.'); }
    const folders = vscode.workspace.workspaceFolders ?? [];
    let allowed = false;
    for (const folder of folders) {
      if (folder.uri.scheme === 'file') {
        const path = await realpath(folder.uri.fsPath);
        if (isInside(root, path) || isInside(path, root)) { allowed = true; }
      }
    }
    if (!allowed) { throw new Error('La sessione non appartiene al workspace aperto.'); }
    const store = new SessionStore(root);
    const key = `workflow.session:${root}`;
    const saved = fresh ? undefined : id ?? this.state.get<string>(key);
    let session: Session;
    if (saved) {
      try { session = await store.load(saved); }
      catch (error) {
        if (id || (error as NodeJS.ErrnoException).code !== 'ENOENT') { throw error; }
        session = await store.create();
      }
    } else { session = await store.create(); }
    this.active = { session, store, git: new GitRepository(root) };
    await this.state.update(key, session.id);
    this.changes.fire(session);
    return this.active;
  }

  async ensure(): Promise<ActiveSession> {
    if (!vscode.workspace.isTrusted) { throw new Error('È necessario un workspace attendibile.'); }
    return this.active ?? this.select(await this.repository());
  }

  async save(active: ActiveSession): Promise<void> {
    await active.store.save(active.session);
    this.changes.fire(this.current);
  }

  async newSession(): Promise<void> {
    await this.select(await this.repository(), undefined, true);
  }

  async openChat(command: string): Promise<void> {
    const active = await this.exclusive(async () => this.ensure());
    await vscode.commands.executeCommand('workbench.action.chat.open', {
      mode: 'ask',
      isPartialQuery: command === 'plan',
      query: `@workflow /${command} [[workflow:${active.session.id}]] `
    });
  }

  async importAnalysis(): Promise<boolean> {
    const active = await this.ensure();
    const choice = await vscode.window.showQuickPick([
      'Acquisisci ultimo piano @workflow', 'Importa da editor attivo', 'Importa dagli appunti'
    ], { placeHolder: 'Plan nativo non è leggibile via API: importa esplicitamente il piano completo.' });
    if (!choice) { return false; }
    if (choice === 'Acquisisci ultimo piano @workflow') { return true; }
    let plan: string;
    if (choice === 'Importa da editor attivo') {
      const editor = vscode.window.activeTextEditor;
      if (!editor) { throw new Error('Apri il documento contenente il piano.'); }
      plan = editor.selection.isEmpty ? editor.document.getText() : editor.document.getText(editor.selection);
    } else { plan = await vscode.env.clipboard.readText(); }
    const requirements = await vscode.window.showInputBox({
      title: 'Requisiti e perimetro', prompt: 'Inserisci i requisiti approvati (il piano verrà salvato integralmente).',
      ignoreFocusOut: true, validateInput: value => value.trim() ? undefined : 'I requisiti sono obbligatori.'
    });
    if (requirements === undefined) { return false; }
    capture(active.session, requirements, plan, 'explicit-import');
    await this.save(active);
    return false;
  }

  async implement(): Promise<void> {
    const active = await this.ensure();
    requireAnalysis(active.session);
    active.session.implementationStartedAt = new Date().toISOString();
    invalidateChecks(active.session);
    await this.save(active);
  }

  async handoff(active: ActiveSession): Promise<void> {
    const analysis = requireAnalysis(active.session);
    await vscode.commands.executeCommand('workbench.action.chat.open', {
      mode: 'agent',
      isPartialQuery: true,
      query: `Implementa i requisiti e il piano approvati qui sotto. Non modificare i file .workflow. `
        + `Prima di eseguire operazioni distruttive chiedi conferma.\n`
        + JSON.stringify({ requirements: analysis.requirements, plan: analysis.plan })
    });
  }

  async notes(value: unknown): Promise<void> {
    const active = await this.ensure();
    updateNotes(active.session, value);
    await this.save(active);
  }

  async prepareCommit(): Promise<void> {
    const active = await this.ensure();
    const missing = readiness(active.session, await active.git.snapshot());
    if (missing.length) { throw new Error(`Completa prima: ${missing.join(', ')}.`); }
    const confirmation = await vscode.window.showWarningMessage(
      'Confermi di aver risolto o valutato i rilievi AI e indicato i test necessari? Verrà aggiunto allo staging solo il file workflow.',
      { modal: true }, 'Prepara commit'
    );
    if (!confirmation) { return; }
    active.session.readyAt = new Date().toISOString();
    await this.save(active);
    const path = `${RECORD_DIRECTORY}/${active.store.fileName(active.session.id)}`;
    await active.git.run(['add', '--', path]);
    await vscode.commands.executeCommand('workbench.view.scm');
    void vscode.window.showInformationMessage('File workflow incluso nello staging. Controlla il diff e crea il commit.');
  }

  async showRecord(): Promise<void> {
    const active = await this.ensure();
    await vscode.window.showTextDocument(vscode.Uri.file(join(active.store.root, RECORD_DIRECTORY, active.store.fileName(active.session.id))));
  }

  dispose(): void { this.changes.dispose(); }
}
