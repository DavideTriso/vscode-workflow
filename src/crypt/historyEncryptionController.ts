import * as vscode from 'vscode';
import os from 'node:os';
import { runProcess, type CommandRunner } from '../scm/processRunner';
import {
    addTeammateKey,
    enableHistoryEncryption,
    exportPublicKey,
    HistoryEncryptionError,
    renormalizeHistory,
} from './historyEncryptionActions';
import {
    isHistoryEncryptionCopyRequest,
    type HistoryEncryptionCopyRequest,
    type HistoryEncryptionNotice,
    type HistoryEncryptionRequest,
} from './historyEncryptionMessages';
import { describeStatus, readHistoryEncryptionStatus, type HistoryEncryptionStatus } from './historyEncryptionStatus';

/** Requests that change or read the repository; they run one at a time. */
type QueuedRequest = Exclude<HistoryEncryptionRequest, HistoryEncryptionCopyRequest>;

export const openHistoryEncryptionCommand = 'vscode-workflow.openHistoryEncryption';

/**
 * Owns the History encryption status bar item and runs the actions the panel requests. Silent steps
 * (enable, add a teammate, export a key) use child processes. Unlock and lock run in a terminal, because
 * gpg may ask for the key passphrase there.
 */
export class HistoryEncryptionController implements vscode.Disposable {
    private readonly statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
    private readonly notices = new vscode.EventEmitter<HistoryEncryptionNotice>();
    private readonly disposables: vscode.Disposable[] = [this.statusBarItem, this.notices];
    private queue: Promise<void> = Promise.resolve();

    readonly onDidNotify = this.notices.event;

    constructor(
        private readonly findRepositoryRoot: () => Promise<string | undefined>,
        private readonly run: CommandRunner = runProcess,
    ) {
        this.statusBarItem.command = openHistoryEncryptionCommand;
        const gitattributesWatcher = vscode.workspace.createFileSystemWatcher('**/.gitattributes');
        this.disposables.push(
            gitattributesWatcher,
            gitattributesWatcher.onDidCreate(() => void this.refresh()),
            gitattributesWatcher.onDidChange(() => void this.refresh()),
            gitattributesWatcher.onDidDelete(() => void this.refresh()),
            vscode.workspace.onDidChangeWorkspaceFolders(() => void this.refresh()),
            vscode.window.onDidChangeWindowState((state) => state.focused && void this.refresh()),
            vscode.window.onDidCloseTerminal((terminal) => terminal.name === terminalName && void this.refresh()),
        );
        void this.refresh();
    }

    dispose(): void {
        this.disposables.forEach((disposable) => disposable.dispose());
    }

    /** Reads the status, updates the status bar item and tells the panel. */
    async refresh(): Promise<HistoryEncryptionStatus | undefined> {
        const status = await this.readStatus();
        this.updateStatusBar(status);
        this.notices.fire({ type: 'historyEncryptionStatus', status });
        return status;
    }

    /**
     * Runs one panel request. Copies run at once, because they only read gpg and the clipboard. Other
     * requests run after the previous one, so two actions never touch the repository together, and end
     * with a status refresh.
     */
    handle(request: HistoryEncryptionRequest): Promise<void> {
        if (isHistoryEncryptionCopyRequest(request)) {
            return this.copy(request);
        }
        const next = this.queue.then(() => this.execute(request));
        this.queue = next.catch(() => undefined);
        return next;
    }

    private async readStatus(): Promise<HistoryEncryptionStatus | undefined> {
        const repositoryRoot = await this.findRepositoryRoot();
        return repositoryRoot ? readHistoryEncryptionStatus({ repositoryRoot, run: this.run }) : undefined;
    }

    private async execute(request: QueuedRequest): Promise<void> {
        const repositoryRoot = await this.findRepositoryRoot();
        if (!repositoryRoot) {
            this.report('Open a Git repository first.', true);
            return;
        }
        try {
            await this.perform(request, repositoryRoot);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.report(error instanceof HistoryEncryptionError ? message : `History encryption failed: ${message}`, true);
        }
        await this.refresh();
    }

    private async perform(request: QueuedRequest, repositoryRoot: string): Promise<void> {
        const context = { repositoryRoot, run: this.run };
        if (request.type === 'refreshHistoryEncryption') {
            return;
        }
        if (request.type === 'enableHistoryEncryption') {
            if (!await confirm(enableConfirmation, 'Enable')) {
                return;
            }
            await withProgress('Enabling .history encryption', () => enableHistoryEncryption(context, request.fingerprint));
            this.report('Encryption is enabled and the changes are staged. Review them and commit. Commits made before this one stay readable in Git history.', false);
            return;
        }
        if (request.type === 'addTeammateKey') {
            await this.addTeammate(context, request.armoredKey);
            return;
        }
        if (request.type === 'unlockHistory') {
            runInTerminal(repositoryRoot, 'git-crypt unlock');
            this.report('Unlock is running in the git-crypt terminal. Enter your GPG passphrase there if asked.', false);
            return;
        }
        await withProgress('Staging .history', () => renormalizeHistory(context));
        this.report('.history is staged again. Commit to store the plain text files encrypted.', false);
    }

    private async addTeammate(context: { repositoryRoot: string; run: CommandRunner }, armoredKey: string): Promise<void> {
        const fingerprint = await withProgress('Adding teammate', () => addTeammateKey(context, { armoredKey }));
        this.report(`Key ${fingerprint} was added and staged. Commit it, push, and ask the teammate to pull and unlock.`, false);
    }

    private async copy(request: HistoryEncryptionCopyRequest): Promise<void> {
        try {
            const text = request.type === 'copyFingerprint'
                ? request.fingerprint
                : await exportPublicKey({ repositoryRoot: os.homedir(), run: this.run }, request.fingerprint);
            await vscode.env.clipboard.writeText(text);
            this.notices.fire({ type: 'historyEncryptionCopied', requestId: request.requestId, ok: true, message: '' });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.notices.fire({ type: 'historyEncryptionCopied', requestId: request.requestId, ok: false, message });
        }
    }

    private report(message: string, error: boolean): void {
        this.notices.fire({ type: 'historyEncryptionResult', message, error });
    }

    private updateStatusBar(status: HistoryEncryptionStatus | undefined): void {
        if (!status) {
            this.statusBarItem.hide();
            return;
        }
        const presentation = describeStatus(status);
        this.statusBarItem.text = presentation.text;
        this.statusBarItem.tooltip = presentation.tooltip;
        this.statusBarItem.backgroundColor = presentation.warning
            ? new vscode.ThemeColor('statusBarItem.warningBackground')
            : undefined;
        this.statusBarItem.show();
    }
}

const terminalName = 'git-crypt';

const enableConfirmation = 'Enable encryption for .history? This runs git-crypt init, adds a rule to .gitattributes and stages .history so your next commit stores it encrypted. Earlier commits stay readable in Git history.';

function runInTerminal(repositoryRoot: string, command: string): void {
    const terminal = vscode.window.createTerminal({ name: terminalName, cwd: repositoryRoot });
    terminal.show();
    terminal.sendText(`${command} && exit`);
}

async function confirm(message: string, action: string): Promise<boolean> {
    return await vscode.window.showWarningMessage(message, { modal: true }, action) === action;
}

function withProgress<T>(title: string, task: () => Promise<T>): Thenable<T> {
    return vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title }, task);
}
