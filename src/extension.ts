import * as vscode from 'vscode';
import { TasksViewProvider } from './tasks/tasksViewProvider';

export function activate(context: vscode.ExtensionContext): void {
    const tasksViewProvider = new TasksViewProvider(context.extensionUri);
    context.subscriptions.push(
        tasksViewProvider,
        vscode.window.registerWebviewViewProvider(TasksViewProvider.viewType, tasksViewProvider, {
            webviewOptions: { retainContextWhenHidden: true },
        }),
        vscode.commands.registerCommand('tasks.addTask', () => tasksViewProvider.openCreateForm()),
    );
    void vscode.commands.executeCommand('setContext', 'tasks.repositoryAvailable', false);
}

export function deactivate(): void { }
