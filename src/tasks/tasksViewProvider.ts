import * as vscode from 'vscode';
import path from 'node:path';
import { TaskRepository } from './taskRepository';
import { validateTaskInput } from './taskModel';
import type { CreateTaskInput, ExtensionToWebviewMessage, TaskSummary, WebviewToExtensionMessage } from './taskProtocol';
import { getTasksWebviewHtml } from './tasksWebviewHtml';

export class TasksViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
    static readonly viewType = 'tasks.list';
    private static readonly selectedTaskKey = 'tasks.selectedTaskId';

    private view: vscode.WebviewView | undefined;
    private viewDisposables: vscode.Disposable[] = [];
    private outputWatcher: vscode.FileSystemWatcher | undefined;
    private outputWatcherRoot: string | undefined;
    private outputRequest = 0;

    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly workspaceState: vscode.Memento,
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

        await this.taskRepository.stopOtherTimeTracking(repositoryRoot, taskId);
        await this.taskRepository.clearAgentTaskMarkers(repositoryRoot);
        if (hasOpenTimeEntry(task)) {
            await this.taskRepository.startAgentTask(repositoryRoot, task);
        }
        await this.workspaceState.update(TasksViewProvider.selectedTaskKey, taskId);
        await this.refresh();
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
            this.watchAgentOutputs(repositoryRoot);
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
        if (isViewTodoMessage(message)) {
            try {
                const repositoryRoot = await this.requireRepositoryRoot();
                if (this.workspaceState.get<string>(TasksViewProvider.selectedTaskKey) !== message.taskId) {
                    throw new Error('Select the task before viewing its TODO details.');
                }
                const content = await this.taskRepository.getImplementationTodoItemMarkdown(repositoryRoot, message.taskId, message.itemId);
                const document = await vscode.workspace.openTextDocument({ language: 'markdown', content });
                await vscode.commands.executeCommand('markdown.showPreview', document.uri);
            } catch (error) {
                const detail = error instanceof Error ? error.message : String(error);
                void vscode.window.showErrorMessage(`Unable to preview TODO details: ${detail}`);
            }
            return;
        }
        if (isViewAgentOutputMessage(message)) {
            try {
                const repositoryRoot = await this.requireRepositoryRoot();
                if (this.workspaceState.get<string>(TasksViewProvider.selectedTaskKey) !== message.taskId) {
                    throw new Error('Select the task before viewing its agent output.');
                }
                if (message.fileName === 'implementation-todo.json') {
                    const content = await this.taskRepository.getImplementationTodoMarkdown(repositoryRoot, message.taskId);
                    const document = await vscode.workspace.openTextDocument({ language: 'markdown', content });
                    await vscode.commands.executeCommand('markdown.showPreview', document.uri);
                } else {
                    const filePath = await this.taskRepository.getAgentOutputPath(repositoryRoot, message.taskId, message.fileName);
                    await vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.file(filePath));
                }
            } catch (error) {
                const detail = error instanceof Error ? error.message : String(error);
                void vscode.window.showErrorMessage(`Unable to preview agent output: ${detail}`);
            }
            return;
        }
        if (isSetTodoStatusMessage(message)) {
            try {
                const repositoryRoot = await this.requireRepositoryRoot();
                if (this.workspaceState.get<string>(TasksViewProvider.selectedTaskKey) !== message.taskId) {
                    throw new Error('Select the task before changing its TODO list.');
                }
                await this.taskRepository.setTodoStatus(repositoryRoot, message.taskId, message.itemId, message.done);
                await this.postMessage({ type: 'todoStatusResult', taskId: message.taskId, itemId: message.itemId, done: message.done });
                await this.refreshAgentOutputs(repositoryRoot, message.taskId);
            } catch (error) {
                const detail = error instanceof Error ? error.message : String(error);
                await this.postMessage({ type: 'todoStatusResult', taskId: message.taskId, itemId: message.itemId, done: message.done, error: detail });
            }
            return;
        }
        if (isCreateTodoMessage(message)) {
            await this.mutateSelectedTaskTodo(message.taskId, async (repositoryRoot) => {
                await this.taskRepository.addImplementationTodoItem(
                    repositoryRoot, message.taskId, message.group, message.item, 'user',
                );
            });
            return;
        }
        if (isUpdateTodoMessage(message)) {
            await this.mutateSelectedTaskTodo(message.taskId, async (repositoryRoot) => {
                await this.taskRepository.updateImplementationTodoItem(
                    repositoryRoot, message.taskId, message.itemId, message.group, message.changes, 'user',
                );
            });
            return;
        }
        if (isRemoveTodoMessage(message)) {
            await this.mutateSelectedTaskTodo(message.taskId, async (repositoryRoot) => {
                const todo = await this.taskRepository.readImplementationTodo(repositoryRoot, message.taskId);
                const item = todo.groups.flatMap((group) => group.items).find((candidate) => candidate.id === message.itemId);
                if (!item) {
                    throw new Error('Implementation TODO item could not be found.');
                }
                const choice = await vscode.window.showWarningMessage(
                    `Remove TODO "${item.title}"?`,
                    { modal: true },
                    'Remove',
                );
                if (choice !== 'Remove') {
                    return false;
                }
                await this.taskRepository.removeImplementationTodoItem(repositoryRoot, message.taskId, message.itemId, 'user');
                return true;
            });
            return;
        }
        if (isReorderTodosMessage(message)) {
            await this.mutateSelectedTaskTodo(message.taskId, (repositoryRoot) =>
                this.taskRepository.reorderImplementationTodos(repositoryRoot, message.taskId, message.groups, 'user'));
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
                const repositoryRoot = await this.requireRepositoryRoot();
                const currentTask = await this.taskRepository.getTask(repositoryRoot, message.taskId);
                if (!currentTask) {
                    throw new Error('Task could not be found.');
                }
                const willStartTimer = !hasOpenTimeEntry(currentTask);
                if (willStartTimer && !(await this.taskRepository.getGitUserEmail(repositoryRoot))) {
                    throw new Error('Set your Git email with `git config user.email` before starting time tracking.');
                }
                await this.taskRepository.stopOtherTimeTracking(repositoryRoot, message.taskId);
                await this.taskRepository.clearAgentTaskMarkers(repositoryRoot);
                const task = await this.taskRepository.toggleTimeTracking(repositoryRoot, message.taskId);
                if (hasOpenTimeEntry(task)) {
                    await this.taskRepository.startAgentTask(repositoryRoot, task);
                }
                await this.refresh();
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

        await this.taskRepository.stopAgentTask(repositoryRoot, taskId);
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
        if (hasOpenTimeEntry(task)) {
            await this.taskRepository.startAgentTask(repositoryRoot, task);
        }
        await this.postMessage({ type: 'selectedTask', task });
        await this.refreshAgentOutputs(repositoryRoot, taskId);
    }

    private watchAgentOutputs(repositoryRoot: string): void {
        if (this.outputWatcherRoot === repositoryRoot) {
            return;
        }
        this.outputWatcher?.dispose();
        const watcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(repositoryRoot, '.history/agents/*/*.{md,json}'),
        );
        this.outputWatcher = watcher;
        this.outputWatcherRoot = repositoryRoot;
        const update = (uri: vscode.Uri): void => {
            const taskId = this.workspaceState.get<string>(TasksViewProvider.selectedTaskKey);
            if (taskId && path.dirname(uri.fsPath) === path.join(repositoryRoot, '.history', 'agents', taskId)) {
                void this.refreshAgentOutputs(repositoryRoot, taskId);
            }
        };
        this.viewDisposables.push(watcher.onDidCreate(update), watcher.onDidChange(update), watcher.onDidDelete(update));
    }

    private async refreshAgentOutputs(repositoryRoot: string, taskId: string): Promise<void> {
        const request = ++this.outputRequest;
        try {
            const groups = await this.taskRepository.listAgentOutputs(repositoryRoot, taskId);
            if (request === this.outputRequest && this.workspaceState.get<string>(TasksViewProvider.selectedTaskKey) === taskId) {
                await this.postMessage({ type: 'agentOutputs', taskId, groups });
            }
        } catch (error) {
            if (request === this.outputRequest && this.workspaceState.get<string>(TasksViewProvider.selectedTaskKey) === taskId) {
                const detail = error instanceof Error ? error.message : String(error);
                await this.postMessage({ type: 'agentOutputs', taskId, groups: [], error: `Unable to load agent output: ${detail}` });
            }
        }
    }

    private async mutateSelectedTaskTodo(
        taskId: string,
        mutate: (repositoryRoot: string) => Promise<unknown>,
    ): Promise<void> {
        try {
            const repositoryRoot = await this.requireRepositoryRoot();
            if (this.workspaceState.get<string>(TasksViewProvider.selectedTaskKey) !== taskId) {
                throw new Error('Select the task before changing its TODO list.');
            }
            const changed = await mutate(repositoryRoot);
            await this.postMessage({ type: 'todoMutationResult', taskId });
            if (changed !== false) {
                await this.refreshAgentOutputs(repositoryRoot, taskId);
            }
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            await this.postMessage({ type: 'todoMutationResult', taskId, error: detail });
        }
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

        await this.taskRepository.stopOtherTimeTracking(repositoryRoot, taskId);
        const updatedTask = await this.taskRepository.closeTask(repositoryRoot, taskId);
        await this.taskRepository.clearAgentTaskMarkers(repositoryRoot);
        await this.postMessage({ type: 'taskActionUpdated', task: updatedTask });
    }

    private async postMessage(message: ExtensionToWebviewMessage): Promise<void> {
        await this.view?.webview.postMessage(message);
    }

    private disposeViewListeners(): void {
        this.outputWatcher?.dispose();
        this.outputWatcher = undefined;
        this.outputWatcherRoot = undefined;
        this.outputRequest += 1;
        const disposables = this.viewDisposables;
        this.viewDisposables = [];
        disposables.forEach((disposable) => disposable.dispose());
    }
}

function hasOpenTimeEntry(task: TaskSummary): boolean {
    return task.timeTracking.at(-1)?.endDateTime === null;
}

function isWebviewReadyMessage(message: unknown): boolean {
    return typeof message === 'object' && message !== null && 'type' in message && message.type === 'ready';
}

function isViewAgentOutputMessage(
    message: unknown,
): message is Extract<WebviewToExtensionMessage, { type: 'viewAgentOutput' }> {
    return typeof message === 'object' && message !== null &&
        'type' in message && message.type === 'viewAgentOutput' &&
        'taskId' in message && typeof message.taskId === 'string' &&
        'fileName' in message && typeof message.fileName === 'string';
}

function isViewTodoMessage(
    message: unknown,
): message is Extract<WebviewToExtensionMessage, { type: 'viewTodo' }> {
    return isRecordMessage(message) && message.type === 'viewTodo' &&
        typeof message.taskId === 'string' && typeof message.itemId === 'string';
}

function isSetTodoStatusMessage(
    message: unknown,
): message is Extract<WebviewToExtensionMessage, { type: 'setTodoStatus' }> {
    return typeof message === 'object' && message !== null &&
        'type' in message && message.type === 'setTodoStatus' &&
        'taskId' in message && typeof message.taskId === 'string' &&
        'itemId' in message && typeof message.itemId === 'string' &&
        'done' in message && typeof message.done === 'boolean';
}

function isCreateTodoMessage(
    message: unknown,
): message is Extract<WebviewToExtensionMessage, { type: 'createTodo' }> {
    return isRecordMessage(message) && message.type === 'createTodo' &&
        typeof message.taskId === 'string' && typeof message.group === 'string' && isRecordMessage(message.item);
}

function isUpdateTodoMessage(
    message: unknown,
): message is Extract<WebviewToExtensionMessage, { type: 'updateTodo' }> {
    return isRecordMessage(message) && message.type === 'updateTodo' &&
        typeof message.taskId === 'string' && typeof message.itemId === 'string' &&
        typeof message.group === 'string' && isRecordMessage(message.changes);
}

function isRemoveTodoMessage(
    message: unknown,
): message is Extract<WebviewToExtensionMessage, { type: 'removeTodo' }> {
    return isRecordMessage(message) && message.type === 'removeTodo' &&
        typeof message.taskId === 'string' && typeof message.itemId === 'string';
}

function isReorderTodosMessage(
    message: unknown,
): message is Extract<WebviewToExtensionMessage, { type: 'reorderTodos' }> {
    return isRecordMessage(message) && message.type === 'reorderTodos' &&
        typeof message.taskId === 'string' && Array.isArray(message.groups) &&
        message.groups.every((group: unknown) => isRecordMessage(group) && typeof group.name === 'string' &&
            Array.isArray(group.itemIds) && group.itemIds.every((itemId: unknown) => typeof itemId === 'string'));
}

function isRecordMessage(value: unknown): value is Record<string, any> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
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