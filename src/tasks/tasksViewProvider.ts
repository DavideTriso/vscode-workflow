import * as vscode from 'vscode';
import { TaskRepository } from './taskRepository';
import { validateTaskInput } from './taskModel';
import type { CreateTaskInput, ExtensionToWebviewMessage, WebviewToExtensionMessage } from './taskProtocol';
import { getTasksWebviewHtml } from './tasksWebviewHtml';

export class TasksViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
    static readonly viewType = 'tasks.list';
    private static readonly selectedTaskKey = 'tasks.selectedTaskId';

    private view: vscode.WebviewView | undefined;
    private viewDisposables: vscode.Disposable[] = [];

    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly workspaceState: vscode.Memento,
        private readonly taskRepository = new TaskRepository(),
    ) {}

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

    private async openEditForm(taskId: string): Promise<void> {
        const repositoryRoot = await this.findCurrentRepositoryRoot();
        if (!repositoryRoot) {
            await this.postMessage({ type: 'repositoryUnavailable' });
            return;
        }

        const tasks = await this.taskRepository.listOpenTasks(repositoryRoot);
        const task = tasks.find((candidate) => candidate.id === taskId);
        if (!task) {
            await this.refresh();
            return;
        }

        await this.postMessage({ type: 'openEditForm', task });
    }

    private async selectTask(taskId: string): Promise<void> {
        const repositoryRoot = await this.findCurrentRepositoryRoot();
        if (!repositoryRoot) {
            await this.postMessage({ type: 'repositoryUnavailable' });
            return;
        }

        const task = await this.taskRepository.getTask(repositoryRoot, taskId);
        if (!task) {
            await this.refresh();
            await this.workspaceState.update(TasksViewProvider.selectedTaskKey, undefined);
            await this.postMessage({ type: 'clearSelectedTask' });
            return;
        }

        await this.workspaceState.update(TasksViewProvider.selectedTaskKey, taskId);
        await this.postMessage({ type: 'selectedTask', task });
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
            const [tasks, gitUserEmail] = await Promise.all([
                this.taskRepository.listOpenTasks(repositoryRoot),
                this.taskRepository.getGitUserEmail(repositoryRoot),
            ]);
            await this.postMessage({ type: 'taskList', tasks, gitUserEmail });
            await this.restoreSelectedTask(repositoryRoot);
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
        if (isRefreshTasksMessage(message)) {
            await this.refresh();
            return;
        }
        if (isSaveTaskMessage(message)) {
            try {
                await this.saveTask(message.input, message.taskId);
            } catch (error) {
                const detail = error instanceof Error ? error.message : String(error);
                await this.postMessage({ type: 'createTaskFailed', message: detail });
            }
            return;
        }
        if (isEditTaskMessage(message)) {
            try {
                await this.openEditForm(message.taskId);
            } catch (error) {
                const detail = error instanceof Error ? error.message : String(error);
                void vscode.window.showErrorMessage(`Unable to open task: ${detail}`);
            }
            return;
        }
        if (isOpenTaskFileMessage(message)) {
            try {
                await this.openTaskFile(message.taskId);
            } catch (error) {
                const detail = error instanceof Error ? error.message : String(error);
                void vscode.window.showErrorMessage(`Unable to open task file: ${detail}`);
            }
            return;
        }
        if (isSelectTaskMessage(message)) {
            try {
                await this.selectTask(message.taskId);
            } catch (error) {
                const detail = error instanceof Error ? error.message : String(error);
                void vscode.window.showErrorMessage(`Unable to select task: ${detail}`);
            }
            return;
        }
        if (isTaskActionMessage(message)) {
            try {
                const task = await this.taskRepository.toggleTimeTracking(
                    await this.requireRepositoryRoot(),
                    message.taskId,
                );
                await this.postMessage({ type: 'taskActionUpdated', task });
            } catch (error) {
                const detail = error instanceof Error ? error.message : String(error);
                await this.postMessage({ type: 'taskActionFailed', message: detail });
            }
            return;
        }
        if (isMarkTaskDoneMessage(message)) {
            try {
                await this.markTaskDone(message.taskId);
            } catch (error) {
                const detail = error instanceof Error ? error.message : String(error);
                await this.postMessage({ type: 'taskActionFailed', message: detail });
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
        if (this.workspaceState.get<string>(TasksViewProvider.selectedTaskKey) === taskId) {
            await this.workspaceState.update(TasksViewProvider.selectedTaskKey, undefined);
            await this.postMessage({ type: 'clearSelectedTask' });
        }
        await this.refresh();
    }

    private async openTaskFile(taskId: string): Promise<void> {
        const repositoryRoot = await this.findCurrentRepositoryRoot();
        if (!repositoryRoot) {
            await this.postMessage({ type: 'repositoryUnavailable' });
            return;
        }
        const task = await this.taskRepository.getTask(repositoryRoot, taskId);
        if (!task) {
            await this.refresh();
            return;
        }

        const taskUri = vscode.Uri.file(this.taskRepository.getTaskFilePath(repositoryRoot, taskId));
        const document = await vscode.workspace.openTextDocument(taskUri);
        await vscode.window.showTextDocument(document, {
            viewColumn: vscode.ViewColumn.One,
            preview: true,
        });
    }

    private async restoreSelectedTask(repositoryRoot: string): Promise<void> {
        const taskId = this.workspaceState.get<string>(TasksViewProvider.selectedTaskKey);
        if (!taskId) {
            return;
        }

        const task = await this.taskRepository.getTask(repositoryRoot, taskId);
        if (!task) {
            await this.workspaceState.update(TasksViewProvider.selectedTaskKey, undefined);
            await this.postMessage({ type: 'clearSelectedTask' });
            return;
        }
        await this.postMessage({ type: 'selectedTask', task });
    }

    private async saveTask(input: CreateTaskInput, taskId?: string): Promise<void> {
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
        if (taskId) {
            await this.taskRepository.updateTask(repositoryRoot, taskId, normalizedInput);
        } else {
            await this.taskRepository.createTask(repositoryRoot, normalizedInput);
        }
        await this.refresh();
        await this.postMessage({ type: 'taskSaved' });
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
        if (!workspacePath) {
            return undefined;
        }
        return this.taskRepository.findRepositoryRoot(workspacePath);
    }

    private async requireRepositoryRoot(): Promise<string> {
        const repositoryRoot = await this.findCurrentRepositoryRoot();
        if (!repositoryRoot) {
            throw new Error('Open a Git repository to manage tasks.');
        }
        return repositoryRoot;
    }

    private async markTaskDone(taskId: string): Promise<void> {
        const repositoryRoot = await this.requireRepositoryRoot();
        const task = await this.taskRepository.getTask(repositoryRoot, taskId);
        if (!task || task.status === 2) {
            await this.postMessage({ type: 'taskActionCancelled' });
            return;
        }

        const choice = await vscode.window.showWarningMessage(
            `Mark "${task.name}" as done?`,
            { modal: true },
            'Done',
        );
        if (choice !== 'Done') {
            await this.postMessage({ type: 'taskActionCancelled' });
            return;
        }

        const updatedTask = await this.taskRepository.closeTask(repositoryRoot, taskId);
        await this.postMessage({ type: 'taskActionUpdated', task: updatedTask });
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

function isRefreshTasksMessage(message: unknown): boolean {
    return typeof message === 'object' && message !== null && 'type' in message && message.type === 'refreshTasks';
}

function isDeleteTaskMessage(
    message: unknown,
): message is Extract<WebviewToExtensionMessage, { type: 'deleteTask' }> {
    if (typeof message !== 'object' || message === null || !('type' in message) || !('taskId' in message)) {
        return false;
    }
    return message.type === 'deleteTask' && typeof message.taskId === 'string';
}

function isSaveTaskMessage(
    message: unknown,
): message is Extract<WebviewToExtensionMessage, { type: 'saveTask' }> {
    if (typeof message !== 'object' || message === null || !('type' in message) || !('input' in message)) {
        return false;
    }
    const input = message.input;
    const hasValidInput = typeof input === 'object' && input !== null &&
        'name' in input && typeof input.name === 'string' &&
        'projectManagementUrl' in input && typeof input.projectManagementUrl === 'string' &&
        'description' in input && typeof input.description === 'string';
    const hasValidTaskId = !('taskId' in message) || typeof message.taskId === 'string';
    return message.type === 'saveTask' && hasValidInput && hasValidTaskId;
}

function isEditTaskMessage(
    message: unknown,
): message is Extract<WebviewToExtensionMessage, { type: 'editTask' }> {
    if (typeof message !== 'object' || message === null || !('type' in message) || !('taskId' in message)) {
        return false;
    }
    return message.type === 'editTask' && typeof message.taskId === 'string';
}

function isOpenTaskFileMessage(
    message: unknown,
): message is Extract<WebviewToExtensionMessage, { type: 'openTaskFile' }> {
    if (typeof message !== 'object' || message === null || !('type' in message) || !('taskId' in message)) {
        return false;
    }
    return message.type === 'openTaskFile' && typeof message.taskId === 'string';
}

function isSelectTaskMessage(
    message: unknown,
): message is Extract<WebviewToExtensionMessage, { type: 'selectTask' }> {
    if (typeof message !== 'object' || message === null || !('type' in message) || !('taskId' in message)) {
        return false;
    }
    return message.type === 'selectTask' && typeof message.taskId === 'string';
}

function isTaskActionMessage(
    message: unknown,
): message is Extract<WebviewToExtensionMessage, { type: 'toggleTimeTracking' }> {
    if (typeof message !== 'object' || message === null || !('type' in message) || !('taskId' in message)) {
        return false;
    }
    return message.type === 'toggleTimeTracking' && typeof message.taskId === 'string';
}

function isMarkTaskDoneMessage(
    message: unknown,
): message is Extract<WebviewToExtensionMessage, { type: 'markTaskDone' }> {
    if (typeof message !== 'object' || message === null || !('type' in message) || !('taskId' in message)) {
        return false;
    }
    return message.type === 'markTaskDone' && typeof message.taskId === 'string';
}