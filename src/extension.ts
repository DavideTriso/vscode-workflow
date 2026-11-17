import * as vscode from 'vscode';
import { activateClaudeRegistration } from './claude/claudeRegistration';
import { activateCommitMessage } from './scm/commitMessageCommand';
import { TaskRepository } from './tasks/taskRepository';
import { TasksViewProvider } from './tasks/tasksViewProvider';
import { configuredUserIdentityProvider, getConfiguredRepositoryGroups } from './tasks/userSettings';

export function activate(context: vscode.ExtensionContext): void {
    const taskRepository = new TaskRepository(configuredUserIdentityProvider, getConfiguredRepositoryGroups);
    const tasksViewProvider = new TasksViewProvider(context.extensionUri, context.workspaceState, taskRepository);
    activateClaudeRegistration(context);
    activateCommitMessage(context);
    context.subscriptions.push(
        tasksViewProvider,
        vscode.window.registerWebviewViewProvider(TasksViewProvider.viewType, tasksViewProvider, {
            webviewOptions: { retainContextWhenHidden: true },
        }),
    );
}

export function deactivate(): void { }
