import * as vscode from 'vscode';
import { TasksViewProvider } from './tasks/tasksViewProvider';

export function activate(context: vscode.ExtensionContext): void {
    const tasksViewProvider = new TasksViewProvider(context.extensionUri, context.workspaceState);
    context.subscriptions.push(
        tasksViewProvider,
        vscode.window.registerWebviewViewProvider(TasksViewProvider.viewType, tasksViewProvider, {
            webviewOptions: { retainContextWhenHidden: true },
        }),
    );
}

export function deactivate(): void { }
