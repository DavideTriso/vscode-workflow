import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import { TasksViewProvider } from '../src/tasks/tasksViewProvider';
import type { TaskRepository } from '../src/tasks/taskRepository';

const vscodeMocks = vi.hoisted(() => ({
    preview: vi.fn(),
    showError: vi.fn(),
    showTextDocument: vi.fn(),
    showWarning: vi.fn(async (_message: string, _options: unknown, confirmation: string) => confirmation),
    watcher: {
        onDidCreate: vi.fn((_callback: (uri: { fsPath: string }) => void) => ({ dispose: vi.fn() })),
        onDidChange: vi.fn((_callback: (uri: { fsPath: string }) => void) => ({ dispose: vi.fn() })),
        onDidDelete: vi.fn((_callback: (uri: { fsPath: string }) => void) => ({ dispose: vi.fn() })),
        dispose: vi.fn(),
    },
}));

vi.mock('vscode', () => ({
    Uri: {
        file: (filePath: string) => ({ fsPath: filePath, path: filePath }),
        joinPath: (base: { fsPath: string }, ...parts: string[]) => ({ fsPath: [base.fsPath, ...parts].join('/') }),
    },
    RelativePattern: class {
        constructor(public base: string, public pattern: string) { }
    },
    workspace: {
        workspaceFolders: [{ uri: { fsPath: '/repo' } }],
        createFileSystemWatcher: () => vscodeMocks.watcher,
        openTextDocument: vi.fn(),
        getConfiguration: () => ({ get: (_key: string, fallback: unknown) => fallback }),
        onDidChangeConfiguration: () => ({ dispose: () => undefined }),
    },
    commands: { executeCommand: vscodeMocks.preview },
    window: { showErrorMessage: vscodeMocks.showError, showWarningMessage: vscodeMocks.showWarning, showTextDocument: vscodeMocks.showTextDocument },
    ViewColumn: { One: 1 },
}));

vi.mock('../src/tasks/tasksWebviewHtml', () => ({ getTasksWebviewHtml: () => '<html></html>' }));

describe('task view agent outputs', () => {
    let provider: TasksViewProvider;
    let receiveMessage: (message: unknown) => Promise<void>;
    let postMessage: ReturnType<typeof vi.fn>;
    let repository: {
        findRepositoryRoot: ReturnType<typeof vi.fn>;
        listOpenTasks: ReturnType<typeof vi.fn>;
        getCurrentUser: ReturnType<typeof vi.fn>;
        getTask: ReturnType<typeof vi.fn>;
        listAgentOutputs: ReturnType<typeof vi.fn>;
        getAgentOutputPath: ReturnType<typeof vi.fn>;
        getImplementationTodoMarkdown: ReturnType<typeof vi.fn>;
        getImplementationTodoItemMarkdown: ReturnType<typeof vi.fn>;
        setTodoStatus: ReturnType<typeof vi.fn>;
        addImplementationTodoItem: ReturnType<typeof vi.fn>;
        updateImplementationTodoItem: ReturnType<typeof vi.fn>;
        removeImplementationTodoItem: ReturnType<typeof vi.fn>;
        createTask: ReturnType<typeof vi.fn>;
        reorderImplementationTodos: ReturnType<typeof vi.fn>;
        readImplementationTodo: ReturnType<typeof vi.fn>;
        startAgentTask: ReturnType<typeof vi.fn>;
        listLinkableRepositories: ReturnType<typeof vi.fn>;
        resolveRelatedTasks: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
        vi.clearAllMocks();
        postMessage = vi.fn(async () => true);
        repository = {
            findRepositoryRoot: vi.fn(async () => '/repo'),
            listOpenTasks: vi.fn(async () => []),
            getCurrentUser: vi.fn(async () => undefined),
            getTask: vi.fn(async () => ({ id: 'task.json', status: 0, timeTracking: [] })),
            listAgentOutputs: vi.fn(async () => []),
            getAgentOutputPath: vi.fn(async () => '/repo/.history/agents/task.json/logic-review.md'),
            getImplementationTodoMarkdown: vi.fn(async () => '# Implementation TODOs\n\n## Summary\nAll ready.'),
            getImplementationTodoItemMarkdown: vi.fn(async () => '# One TODO\n\nFull details.'),
            setTodoStatus: vi.fn(async () => undefined),
            addImplementationTodoItem: vi.fn(async () => undefined),
            updateImplementationTodoItem: vi.fn(async () => undefined),
            removeImplementationTodoItem: vi.fn(async () => undefined),
            createTask: vi.fn(async () => 'new-task.json'),
            reorderImplementationTodos: vi.fn(async () => undefined),
            readImplementationTodo: vi.fn(async () => ({ groups: [{ name: 'Group', items: [{ id: 'todo-1', title: 'Remove me' }] }] })),
            startAgentTask: vi.fn(),
            listLinkableRepositories: vi.fn(async () => [
                { name: 'Frontend', path: '/repo', originUrl: 'https://github.com/org/frontend', description: '', isCurrentRepository: true },
            ]),
            resolveRelatedTasks: vi.fn(async () => [{ taskFile: '/repos/backend/.history/tasks/api.json', available: true }]),
        };
        provider = new TasksViewProvider(
            { fsPath: '/extension' } as vscode.Uri,
            { get: () => 'task.json', update: vi.fn() } as unknown as vscode.Memento,
            repository as unknown as TaskRepository,
        );
        provider.resolveWebviewView({
            webview: {
                options: {},
                html: '',
                postMessage,
                onDidReceiveMessage: (callback: typeof receiveMessage) => {
                    receiveMessage = callback;
                    return { dispose: vi.fn() };
                },
            },
            onDidDispose: () => ({ dispose: vi.fn() }),
        } as unknown as vscode.WebviewView);
    });

    afterEach(() => provider.dispose());

    it('previews the selected task artifact with the built-in Markdown renderer', async () => {
        await receiveMessage({ type: 'viewAgentOutput', taskId: 'task.json', fileName: 'logic-review.md' });
        expect(repository.getAgentOutputPath).toHaveBeenCalledWith('/repo', 'task.json', 'logic-review.md');
        expect(vscodeMocks.preview).toHaveBeenCalledWith('markdown.showPreview', {
            fsPath: '/repo/.history/agents/task.json/logic-review.md',
            path: '/repo/.history/agents/task.json/logic-review.md',
        });
    });

    it('renders the JSON checklist as Markdown in the preview editor', async () => {
        const document = { uri: { scheme: 'untitled', path: '/Implementation TODOs.md' } };
        const openTextDocument = vi.fn(async () => document);
        const vscodeWorkspace = await import('vscode');
        vi.spyOn(vscodeWorkspace.workspace, 'openTextDocument').mockImplementation(openTextDocument as never);

        await receiveMessage({ type: 'viewAgentOutput', taskId: 'task.json', fileName: 'implementation-todo.json' });

        expect(repository.getImplementationTodoMarkdown).toHaveBeenCalledWith('/repo', 'task.json');
        expect(openTextDocument).toHaveBeenCalledWith({ language: 'markdown', content: '# Implementation TODOs\n\n## Summary\nAll ready.' });
        expect(vscodeMocks.preview).toHaveBeenCalledWith('markdown.showPreview', document.uri);
    });

    it('previews a single TODO only for the selected task', async () => {
        const vscodeWorkspace = await import('vscode');
        const uri = { scheme: 'untitled', path: '/TODO details.md' };
        vi.spyOn(vscodeWorkspace.workspace, 'openTextDocument').mockResolvedValue({ uri } as never);
        await receiveMessage({ type: 'viewTodo', taskId: 'task.json', itemId: 'todo-1' });
        expect(repository.getImplementationTodoItemMarkdown).toHaveBeenCalledWith('/repo', 'task.json', 'todo-1');
        expect(vscodeWorkspace.workspace.openTextDocument).toHaveBeenCalledWith({ language: 'markdown', content: '# One TODO\n\nFull details.' });
        expect(vscodeMocks.preview).toHaveBeenCalledWith('markdown.showPreview', uri);
        await receiveMessage({ type: 'viewTodo', taskId: 'other.json', itemId: 'todo-1' });
        expect(repository.getImplementationTodoItemMarkdown).toHaveBeenCalledTimes(1);
        expect(vscodeMocks.showError).toHaveBeenCalledWith(expect.stringContaining('Select the task'));
    });

    it('rejects previews for a different task and reports missing files', async () => {
        await receiveMessage({ type: 'viewAgentOutput', taskId: 'other.json', fileName: 'logic-review.md' });
        expect(repository.getAgentOutputPath).not.toHaveBeenCalled();
        expect(vscodeMocks.preview).not.toHaveBeenCalled();
        expect(vscodeMocks.showError).toHaveBeenCalledWith(expect.stringContaining('Select the task'));
        repository.getAgentOutputPath.mockRejectedValueOnce(new Error('File was deleted.'));
        await receiveMessage({ type: 'viewAgentOutput', taskId: 'task.json', fileName: 'logic-review.md' });
        expect(vscodeMocks.showError).toHaveBeenCalledWith(expect.stringContaining('File was deleted.'));
        expect(vscodeMocks.preview).not.toHaveBeenCalled();
    });

    it('refreshes selected-task summaries on file events without starting a timer', async () => {
        await receiveMessage({ type: 'ready' });
        expect(postMessage).toHaveBeenCalledWith({ type: 'agentOutputs', taskId: 'task.json', groups: [] });
        const onChange = vscodeMocks.watcher.onDidChange.mock.calls[0]?.[0] as unknown as (uri: { fsPath: string }) => void;
        repository.listAgentOutputs.mockClear();
        onChange({ fsPath: '/repo/.history/agents/other.json/logic-review.md' });
        expect(repository.listAgentOutputs).not.toHaveBeenCalled();
        const groups = [{ id: 'logic-review', name: 'Logic Review', files: [{ fileName: 'logic-review.md', summary: 'No confirmed defects.' }] }];
        repository.listAgentOutputs.mockResolvedValue(groups);
        onChange({ fsPath: '/repo/.history/agents/task.json/logic-review.md' });
        await vi.waitFor(() => expect(postMessage).toHaveBeenCalledWith({ type: 'agentOutputs', taskId: 'task.json', groups }));
        expect(repository.startAgentTask).not.toHaveBeenCalled();
        provider.dispose();
        expect(vscodeMocks.watcher.dispose).toHaveBeenCalled();
    });

    it('reports artifact load errors to the selected task panel', async () => {
        repository.listAgentOutputs.mockRejectedValue(new Error('Unreadable report.'));
        await receiveMessage({ type: 'ready' });
        expect(postMessage).toHaveBeenCalledWith({
            type: 'agentOutputs', taskId: 'task.json', groups: [], error: 'Unable to load agent output: Unreadable report.',
        });
    });

    it('persists checkbox changes only for the selected task and refreshes the group', async () => {
        await receiveMessage({ type: 'setTodoStatus', taskId: 'task.json', itemId: 'core-flow', done: true });

        expect(repository.setTodoStatus).toHaveBeenCalledWith('/repo', 'task.json', 'core-flow', true);
        expect(postMessage).toHaveBeenCalledWith({ type: 'todoStatusResult', taskId: 'task.json', itemId: 'core-flow', done: true });
        expect(repository.listAgentOutputs).toHaveBeenCalledWith('/repo', 'task.json');

        await receiveMessage({ type: 'setTodoStatus', taskId: 'other.json', itemId: 'core-flow', done: false });
        expect(repository.setTodoStatus).toHaveBeenCalledTimes(1);
        expect(postMessage).toHaveBeenCalledWith({
            type: 'todoStatusResult', taskId: 'other.json', itemId: 'core-flow', done: false,
            error: 'Select the task before changing its TODO list.',
        });
    });

    it('reports a failed checklist update without losing the requested item identity', async () => {
        repository.setTodoStatus.mockRejectedValueOnce(new Error('Invalid checklist JSON.'));

        await receiveMessage({ type: 'setTodoStatus', taskId: 'task.json', itemId: 'core-flow', done: true });

        expect(postMessage).toHaveBeenCalledWith({
            type: 'todoStatusResult', taskId: 'task.json', itemId: 'core-flow', done: true, error: 'Invalid checklist JSON.',
        });
        expect(repository.listAgentOutputs).not.toHaveBeenCalled();
    });

    it('routes create, edit, remove, and reorder through the repository for the selected task', async () => {
        const item = {
            title: 'User TODO', done: false, source: 'user-note', sourceRef: '', why: '', files: [],
            decisions: '', acceptance: '', evidence: '', remaining: '', alert: null,
        };
        await receiveMessage({ type: 'createTodo', taskId: 'task.json', group: 'Notes', item });
        expect(repository.addImplementationTodoItem).toHaveBeenCalledWith('/repo', 'task.json', 'Notes', item, 'user');

        const changes = { title: 'Edited title', done: true };
        await receiveMessage({ type: 'updateTodo', taskId: 'task.json', itemId: 'todo-1', group: 'Notes', changes });
        expect(repository.updateImplementationTodoItem).toHaveBeenCalledWith('/repo', 'task.json', 'todo-1', 'Notes', changes, 'user');

        await receiveMessage({ type: 'removeTodo', taskId: 'task.json', itemId: 'todo-1' });
        expect(vscodeMocks.showWarning).toHaveBeenCalledWith('Remove TODO "Remove me"?', { modal: true }, 'Remove');
        expect(repository.removeImplementationTodoItem).toHaveBeenCalledWith('/repo', 'task.json', 'todo-1', 'user');

        const groups = [{ name: 'Notes', itemIds: ['todo-2', 'todo-1'] }];
        await receiveMessage({ type: 'reorderTodos', taskId: 'task.json', groups });
        expect(repository.reorderImplementationTodos).toHaveBeenCalledWith('/repo', 'task.json', groups, 'user');
        expect(postMessage).toHaveBeenCalledWith({ type: 'todoMutationResult', taskId: 'task.json' });
        expect(repository.listAgentOutputs).toHaveBeenCalledTimes(4);
    });

    it('removes the source TODO without confirmation after creating a task from it', async () => {
        const input = { name: 'From TODO', projectManagementUrl: 'https://pm.example.com/1', description: 'Details', assignee: 'a@example.com <A>', relatedTasks: [] };
        await receiveMessage({ type: 'saveTask', input, sourceTodo: { taskId: 'task.json', itemId: 'todo-1' } });
        expect(repository.createTask).toHaveBeenCalledWith('/repo', input);
        expect(repository.removeImplementationTodoItem).toHaveBeenCalledWith('/repo', 'task.json', 'todo-1', 'user');
        expect(repository.createTask.mock.invocationCallOrder[0]).toBeLessThan(repository.removeImplementationTodoItem.mock.invocationCallOrder[0]!);
        expect(vscodeMocks.showWarning).not.toHaveBeenCalled();
        expect(postMessage).toHaveBeenCalledWith({ type: 'taskSaved' });

        repository.removeImplementationTodoItem.mockClear();
        repository.createTask.mockRejectedValueOnce(new Error('Disk full'));
        await receiveMessage({ type: 'saveTask', input, sourceTodo: { taskId: 'task.json', itemId: 'todo-1' } });
        expect(repository.removeImplementationTodoItem).not.toHaveBeenCalled();
        expect(postMessage).toHaveBeenCalledWith({ type: 'createTaskFailed', message: 'Disk full' });
    });

    it('sends the current repository with the task list', async () => {
        await receiveMessage({ type: 'refreshTasks' });
        expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
            type: 'taskList',
            currentRepository: { name: 'Frontend', path: '/repo', originUrl: 'https://github.com/org/frontend' },
        }));
    });

    it('opens a related task file only for links stored on the task', async () => {
        const link = { taskId: 'api.json', taskName: 'Add orders API', repositoryName: 'Backend', repositoryPath: '/old/backend', repositoryUrl: 'https://github.com/org/backend' };
        repository.getTask.mockResolvedValue({ id: 'task.json', status: 1, timeTracking: [], relatedTasks: [link] });
        const vscodeWorkspace = await import('vscode');
        const document = { uri: 'related' };
        vi.spyOn(vscodeWorkspace.workspace, 'openTextDocument').mockResolvedValue(document as never);

        await receiveMessage({ type: 'openRelatedTask', taskId: 'task.json', reference: link });
        expect(repository.resolveRelatedTasks).toHaveBeenCalledWith('/repo', [link]);
        expect(vscodeWorkspace.workspace.openTextDocument).toHaveBeenCalledWith({
            fsPath: '/repos/backend/.history/tasks/api.json', path: '/repos/backend/.history/tasks/api.json',
        });
        expect(vscodeMocks.showTextDocument).toHaveBeenCalledWith(document, expect.objectContaining({ preview: true }));

        repository.resolveRelatedTasks.mockClear();
        await receiveMessage({ type: 'openRelatedTask', taskId: 'task.json', reference: { ...link, taskId: 'other.json' } });
        expect(repository.resolveRelatedTasks).not.toHaveBeenCalled();
        expect(vscodeMocks.showError).toHaveBeenCalledWith(expect.stringContaining('no longer links'));

        repository.resolveRelatedTasks.mockResolvedValueOnce([{ taskFile: '/missing/api.json', available: false }]);
        await receiveMessage({ type: 'openRelatedTask', taskId: 'task.json', reference: link });
        expect(vscodeMocks.showError).toHaveBeenCalledWith(expect.stringContaining('was not found at /missing/api.json'));
    });

    it('rejects user TODO mutations for a non-selected task', async () => {
        await receiveMessage({
            type: 'createTodo', taskId: 'other.json', group: 'Notes',
            item: { title: 'Wrong task', done: false, source: 'user-note', sourceRef: '', why: '', files: [], decisions: '', acceptance: '', evidence: '', remaining: '', alert: null },
        });
        expect(repository.addImplementationTodoItem).not.toHaveBeenCalled();
        expect(postMessage).toHaveBeenCalledWith({
            type: 'todoMutationResult', taskId: 'other.json', error: 'Select the task before changing its TODO list.',
        });
    });
});