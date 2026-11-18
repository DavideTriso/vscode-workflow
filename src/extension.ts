import * as vscode from 'vscode';
import { HistoryEncryptionController, openHistoryEncryptionCommand } from './crypt/historyEncryptionController';
import { activateClaudeRegistration } from './claude/claudeRegistration';
import { activateCommitMessage } from './scm/commitMessageCommand';
import { TaskRepository } from './tasks/taskRepository';
import { TasksViewProvider } from './tasks/tasksViewProvider';
import { configuredUserIdentityProvider, getConfiguredRepositoryGroups } from './tasks/userSettings';

export function activate(context: vscode.ExtensionContext): void {
    const taskRepository = new TaskRepository(configuredUserIdentityProvider, getConfiguredRepositoryGroups);
    const historyEncryption = new HistoryEncryptionController(() => {
        const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        return workspacePath ? taskRepository.findRepositoryRoot(workspacePath) : Promise.resolve(undefined);
    });
    const tasksViewProvider = new TasksViewProvider(context.extensionUri, context.workspaceState, taskRepository, historyEncryption);
    activateClaudeRegistration(context);
    activateCommitMessage(context);
    context.subscriptions.push(
        historyEncryption,
        tasksViewProvider,
        vscode.commands.registerCommand(openHistoryEncryptionCommand, () => tasksViewProvider.revealHistoryEncryption()),
        vscode.window.registerWebviewViewProvider(TasksViewProvider.viewType, tasksViewProvider, {
            webviewOptions: { retainContextWhenHidden: true },
        }),
    );
}

export function deactivate(): void { }
