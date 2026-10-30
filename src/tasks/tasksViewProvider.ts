import * as vscode from 'vscode';
import { TaskRepository } from './taskRepository';
import { validateTaskInput } from './taskModel';
import type { CreateTaskInput, ExtensionToWebviewMessage, WebviewToExtensionMessage } from './taskProtocol';
import { getTasksWebviewHtml } from './tasksWebviewHtml';

export class TasksViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
    static readonly viewType = 'tasks.list';

    private view: vscode.WebviewView | undefined;
    private viewDisposables: vscode.Disposable[] = [];
    private repositoryRoot: string | undefined;

    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly taskRepository = new TaskRepository(),
    ) { }

    resolveWebviewView(view: vscode.WebviewView): void {
        this.disposeViewListeners();
        this.view = view;
        view.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this.extensionUri, 'dist'),
                vscode.Uri.joinPath(this.extensionUri, 'media'),
            ],
        };
        view.webview.html = getTasksWebviewHtml(view.webview, this.extensionUri);
        this.viewDisposables.push(
            view.webview.onDidReceiveMessage((message: unknown) => this.handleMessage(message)),
            view.onDidDispose(() => {
                this.view = undefined;
                this.disposeViewListeners();
            }),
        );
    }

    dispose(): void {
        this.view = undefined;
        this.disposeViewListeners();
    }

    async openCreateForm(): Promise<void> {
        if (!this.view || !this.repositoryRoot) {
            return;
        }
        this.view.show(false);
        await this.postMessage({ type: 'openCreateForm' });
    }

    private async refresh(): Promise<void> {
        const view = this.view;
        if (!view) {
            return;
        }

        try {
            const repositoryRoot = await this.findCurrentRepositoryRoot();
            if (!repositoryRoot) {
                await this.postMessage({ type: 'repositoryUnavailable' });
                return;
            }
            const tasks = await this.taskRepository.listOpenTasks(repositoryRoot);
            await this.postMessage({ type: 'taskList', tasks });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            void vscode.window.showErrorMessage(`Unable to load tasks: ${message}`);
        }
    }

    private async handleMessage(message: unknown): Promise<void> {
        if (isWebviewReadyMessage(message)) {
            await this.refresh();
            return;
        }
        if (isCreateTaskMessage(message)) {
            try {
                await this.createTask(message.input);
            } catch (error) {
                const detail = error instanceof Error ? error.message : String(error);
                await this.postMessage({ type: 'createTaskFailed', message: detail });
            }
            return;
        }
        if (!isDeleteTaskMessage(message)) {
            return;
        }

        try {
            await this.deleteTask(message.taskId);
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            void vscode.window.showErrorMessage(`Unable to delete task: ${detail}`);
        }
    }

    private async deleteTask(taskId: string): Promise<void> {
        const repositoryRoot = await this.findCurrentRepositoryRoot();
        if (!repositoryRoot) {
            await this.postMessage({ type: 'repositoryUnavailable' });
            return;
        }

        const openTasks = await this.taskRepository.listOpenTasks(repositoryRoot);
        const task = openTasks.find((candidate) => candidate.id === taskId);
        if (!task) {
            await this.refresh();
            return;
        }

        const isTracked = await this.taskRepository.isTracked(repositoryRoot, task.id);
        if (!isTracked && !(await this.confirmUntrackedDeletion(task.name))) {
            return;
        }

        await this.taskRepository.deleteTask(repositoryRoot, task.id);
        await this.refresh();
    }

    private async createTask(input: CreateTaskInput): Promise<void> {
        const errors = validateTaskInput(input);
        if (Object.keys(errors).length > 0) {
            await this.postMessage({ type: 'createTaskValidationError', errors });
            return;
        }

        const repositoryRoot = await this.findCurrentRepositoryRoot();
        if (!repositoryRoot) {
            await this.postMessage({ type: 'repositoryUnavailable' });
            return;
        }

        const normalizedInput = {
            name: input.name.trim(),
            projectManagementUrl: input.projectManagementUrl.trim(),
            description: input.description.trim(),
        };
        await this.taskRepository.createTask(repositoryRoot, normalizedInput);
        await this.refresh();
        await this.postMessage({ type: 'taskCreated' });
    }

    private async confirmUntrackedDeletion(taskName: string): Promise<boolean> {
        const choice = await vscode.window.showWarningMessage(
            `Delete untracked task "${taskName}"?`,
            { modal: true },
            'Delete',
        );
        return choice === 'Delete';
    }

    private async findCurrentRepositoryRoot(): Promise<string | undefined> {
        const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        this.repositoryRoot = workspacePath
            ? await this.taskRepository.findRepositoryRoot(workspacePath)
            : undefined;
        await vscode.commands.executeCommand('setContext', 'tasks.repositoryAvailable', Boolean(this.repositoryRoot));
        return this.repositoryRoot;
    }

    private async postMessage(message: ExtensionToWebviewMessage): Promise<void> {
        await this.view?.webview.postMessage(message);
    }

    private disposeViewListeners(): void {
        const disposables = this.viewDisposables;
        this.viewDisposables = [];
        disposables.forEach((disposable) => disposable.dispose());
    }
}

function isWebviewReadyMessage(message: unknown): boolean {
    return typeof message === 'object' && message !== null && 'type' in message && message.type === 'ready';
}

function isDeleteTaskMessage(
    message: unknown,
): message is Extract<WebviewToExtensionMessage, { type: 'deleteTask' }> {
    if (typeof message !== 'object' || message === null || !('type' in message) || !('taskId' in message)) {
        return false;
    }
    return message.type === 'deleteTask' && typeof message.taskId === 'string';
}

function isCreateTaskMessage(
    message: unknown,
): message is Extract<WebviewToExtensionMessage, { type: 'createTask' }> {
    if (typeof message !== 'object' || message === null || !('type' in message) || !('input' in message)) {
        return false;
    }
    const input = message.input;
    return typeof input === 'object' && input !== null &&
        'name' in input && typeof input.name === 'string' &&
        'projectManagementUrl' in input && typeof input.projectManagementUrl === 'string' &&
        'description' in input && typeof input.description === 'string' &&
        message.type === 'createTask';
}