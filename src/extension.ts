import * as vscode from 'vscode';
import { activateClaudeRegistration } from './claude/claudeRegistration';
import { registerImplementationTodoTools } from './tasks/implementationTodoTools';
import { TaskRepository } from './tasks/taskRepository';
import { TasksViewProvider } from './tasks/tasksViewProvider';
import { configuredUserIdentityProvider } from './tasks/userSettings';

export function activate(context: vscode.ExtensionContext): void {
    const taskRepository = new TaskRepository(configuredUserIdentityProvider);
    const tasksViewProvider = new TasksViewProvider(context.extensionUri, context.workspaceState, taskRepository);
    registerImplementationTodoTools(context, taskRepository);
    activateClaudeRegistration(context);
    context.subscriptions.push(
        tasksViewProvider,
        vscode.window.registerWebviewViewProvider(TasksViewProvider.viewType, tasksViewProvider, {
            webviewOptions: { retainContextWhenHidden: true },
        }),
    );
}

export function deactivate(): void { }
