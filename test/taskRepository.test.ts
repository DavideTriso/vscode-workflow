import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ImplementationTodoDocument, ImplementationTodoItem, ImplementationTodoItemDraft } from '../src/tasks/taskProtocol';
import { TaskRepository } from '../src/tasks/taskRepository';

describe('task repository', () => {
    let repository: TaskRepository;
    let repositoryRoot: string;

    beforeEach(async () => {
        repository = new TaskRepository(async () => 'developer@example.com');
        repositoryRoot = await mkdtemp(path.join(os.tmpdir(), 'vscode-tasks-'));
        await mkdir(path.join(repositoryRoot, '.history', 'tasks'), { recursive: true });
    });

    afterEach(async () => {
        await rm(repositoryRoot, { recursive: true, force: true });
    });

    it('lists valid open task files newest first', async () => {
        const taskDirectory = path.join(repositoryRoot, '.history', 'tasks');
        await writeTask(taskDirectory, 'older.json', 'Older', '2026-10-29T10:00:00Z', 0);
        await writeTask(taskDirectory, 'in-progress.json', 'In progress', '2026-10-30T09:00:00Z', 1);
        await writeTask(taskDirectory, 'newer.json', 'Newer', '2026-10-30T10:00:00Z', 0);
        await writeTask(taskDirectory, 'done.json', 'Done', '2026-10-30T11:00:00Z', 2);
        await writeFile(path.join(taskDirectory, 'malformed.json'), '{');

        const tasks = await repository.listOpenTasks(repositoryRoot);

        expect(tasks.map((task) => task.id)).toEqual(['newer.json', 'in-progress.json', 'older.json']);
    });

    it('rejects task ids that could escape the task directory', async () => {
        await expect(repository.deleteTask(repositoryRoot, '../outside.json')).rejects.toThrow('Invalid task file name.');
        expect(() => repository.getTaskFilePath(repositoryRoot, '../outside.json')).toThrow('Invalid task file name.');
    });

    it('lists all output agents as disabled candidates when a task has no artifacts', async () => {
        const groups = await repository.listAgentOutputs(repositoryRoot, 'task.json');
        expect(groups.map((group) => group.name)).toEqual([
            'Analyze and Plan', 'Logic Review', 'Code Readability', 'Document', 'Debug', 'Implementation TODOs',
        ]);
        expect(groups.every((group) => group.files.length === 0)).toBe(true);
    });

    it('groups task artifacts and extracts concise summaries without including full reports', async () => {
        const directory = path.join(repositoryRoot, '.history', 'agents', 'task.json');
        await mkdir(directory, { recursive: true });
        await writeFile(path.join(directory, 'implementation-plan.md'), '# Plan\n\n## Summary\n\nA short plan.\n\n## Full Plan\nLong details.');
        await writeFile(path.join(directory, 'implement-first.md'), 'Older record without a summary.');
        await writeFile(path.join(directory, 'implement-second.md'), '# Run\n\n## Summary\nSecond run.\n\n## Details\nDetails.');
        await writeFile(path.join(directory, 'debug-report.md'), '# Debug\n\n## Summary\nFixed the reproduced failure.\n\n## Full Report\nReproduction, evidence, and checks.');
        await writeFile(path.join(directory, 'implementation-todo.json'), JSON.stringify(createTodoDocument()));
        await writeFile(path.join(directory, 'unrelated.md'), 'Not an agent report.');
        const groups = await repository.listAgentOutputs(repositoryRoot, 'task.json');
        expect(groups[0]?.files).toEqual([{ fileName: 'implementation-plan.md', summary: 'A short plan.' }]);
        const todoGroup = groups.find((group) => group.id === 'implement');
        expect(todoGroup?.files).toEqual([
            { fileName: 'implementation-todo.json', summary: '0 done, 2 open. Next: Build the foundation.' },
        ]);
        expect(todoGroup?.todoGroups?.map((group) => group.name)).toEqual(['Foundation', 'Verification']);
        expect(groups.find((group) => group.id === 'debug')?.files).toEqual([
            { fileName: 'debug-report.md', summary: 'Fixed the reproduced failure.' },
        ]);
        expect(groups.flatMap((group) => group.files).some((file) => file.fileName.startsWith('implement-'))).toBe(false);
        expect(groups.find((group) => group.id === 'logic-review')?.files).toEqual([]);
        expect(await repository.getAgentOutputPath(repositoryRoot, 'task.json', 'implementation-plan.md'))
            .toBe(path.join(directory, 'implementation-plan.md'));
        expect(await repository.getAgentOutputPath(repositoryRoot, 'task.json', 'debug-report.md'))
            .toBe(path.join(directory, 'debug-report.md'));
        expect(await repository.getAgentOutputPath(repositoryRoot, 'task.json', 'implementation-todo.json'))
            .toBe(path.join(directory, 'implementation-todo.json'));
        await expect(repository.getAgentOutputPath(repositoryRoot, 'task.json', 'implement-first.md')).rejects.toThrow('Invalid agent');
    });

    it('sets and clears user TODO status while preserving group and item order', async () => {
        const directory = path.join(repositoryRoot, '.history', 'agents', 'task.json');
        await mkdir(directory, { recursive: true });
        const todoPath = path.join(directory, 'implementation-todo.json');
        await writeFile(todoPath, JSON.stringify(createTodoDocument()));

        await repository.setTodoStatus(repositoryRoot, 'task.json', 'implement-core-flow', true, new Date('2026-11-01T10:30:45.123Z'));
        let saved = JSON.parse(await readFile(todoPath, 'utf8')) as ImplementationTodoDocument;
        expect(saved.groups.map((group) => group.name)).toEqual(['Foundation', 'Verification']);
        let updatedItem = saved.groups[0]?.items[0];
        expect(updatedItem).toMatchObject({ done: true, updatedBy: 'user', updatedAt: '2026-11-01T10:30:45Z' });
        expect(saved.summary).toBe('1 done, 1 open. Next: Add functional coverage.');

        await repository.setTodoStatus(repositoryRoot, 'task.json', 'implement-core-flow', false, new Date('2026-11-01T11:00:00Z'));
        saved = JSON.parse(await readFile(todoPath, 'utf8')) as ImplementationTodoDocument;
        updatedItem = saved.groups[0]?.items[0];
        expect(updatedItem).toMatchObject({ done: false, updatedBy: 'user', updatedAt: '2026-11-01T11:00:00Z' });
        expect(saved.summary).toBe('0 done, 2 open. Next: Build the foundation.');
        expect(JSON.stringify(saved)).not.toContain('"status"');
        expect(saved.groups[1]?.items[0]?.id).toBe('verify-core-flow');
    });

    it('renders the JSON checklist and reports malformed files and unknown item ids', async () => {
        const directory = path.join(repositoryRoot, '.history', 'agents', 'task.json');
        await mkdir(directory, { recursive: true });
        const todoPath = path.join(directory, 'implementation-todo.json');
        await writeFile(todoPath, JSON.stringify(createTodoDocument()));

        const markdown = await repository.getImplementationTodoMarkdown(repositoryRoot, 'task.json');
        expect(markdown).toContain('## Foundation');
        expect(markdown).toContain('### Open - Build the foundation');
        expect(markdown).toContain('## Verification');
        await expect(repository.setTodoStatus(repositoryRoot, 'task.json', 'not-an-item', true)).rejects.toThrow('could not be found');

        await writeFile(todoPath, '{');
        await expect(repository.setTodoStatus(repositoryRoot, 'task.json', 'implement-core-flow', true)).rejects.toThrow('invalid JSON');
        const group = (await repository.listAgentOutputs(repositoryRoot, 'task.json')).find((candidate) => candidate.id === 'implement');
        expect(group?.error).toContain('invalid JSON');
        expect(group?.files).toHaveLength(1);
    });

    it('previews one TODO with all of its context without exposing other items', async () => {
        const directory = path.join(repositoryRoot, '.history', 'agents', 'task.json');
        await mkdir(directory, { recursive: true });
        await writeFile(path.join(directory, 'implementation-todo.json'), JSON.stringify(createTodoDocument()));
        const markdown = await repository.getImplementationTodoItemMarkdown(repositoryRoot, 'task.json', 'implement-core-flow');
        expect(markdown).toContain('### Open - Build the foundation');
        expect(markdown).toContain('The application needs this foundation.');
        expect(markdown).toContain('Keep existing boundaries.');
        expect(markdown).not.toContain('Add functional coverage');
        await expect(repository.getImplementationTodoItemMarkdown(repositoryRoot, 'task.json', 'unknown-item')).rejects.toThrow('could not be found');
    });

    it('lets users edit and remove items while blocking agents from user-created items', async () => {
        const created = await repository.addImplementationTodoItem(repositoryRoot, 'task.json', 'User Notes', createTodoDraft(), 'user');
        expect(created.createdBy).toBe('user');
        await expect(repository.updateImplementationTodoItem(repositoryRoot, 'task.json', created.id, undefined, { title: 'Agent edit' }, 'agent'))
            .rejects.toThrow('Agents cannot edit user-created');
        await expect(repository.removeImplementationTodoItem(repositoryRoot, 'task.json', created.id, 'agent'))
            .rejects.toThrow('Agents cannot remove user-created');

        const edited = await repository.updateImplementationTodoItem(repositoryRoot, 'task.json', created.id, 'User Notes', {
            title: 'User-edited note',
            done: true,
        }, 'user');
        expect(edited).toMatchObject({ title: 'User-edited note', done: true, createdBy: 'user', updatedBy: 'user' });
        await repository.removeImplementationTodoItem(repositoryRoot, 'task.json', created.id, 'user');
        expect((await repository.readImplementationTodo(repositoryRoot, 'task.json')).groups[0]?.items).toEqual([]);
    });

    it('updates agent-created TODOs and keeps user-created items during agent reorder', async () => {
        const userItem = await repository.addImplementationTodoItem(repositoryRoot, 'task.json', 'Notes', createTodoDraft(), 'user');
        const agentItem = await repository.addImplementationTodoItem(repositoryRoot, 'task.json', 'Implementation', createTodoDraft({ title: 'Agent task' }), 'agent');
        await repository.updateImplementationTodoItem(repositoryRoot, 'task.json', agentItem.id, undefined, { title: 'Updated agent task' }, 'agent');
        await repository.reorderImplementationTodos(repositoryRoot, 'task.json', [
            { name: 'Implementation', itemIds: [agentItem.id] },
        ], 'agent');

        const todo = await repository.readImplementationTodo(repositoryRoot, 'task.json');
        expect(todo.groups.map((group) => group.name)).toEqual(['Notes', 'Implementation']);
        expect(todo.groups.find((group) => group.name === 'Implementation')?.items[0]?.title).toBe('Updated agent task');
        expect(todo.groups.find((group) => group.name === 'Notes')?.items[0]).toMatchObject({
            id: userItem.id,
            title: userItem.title,
            createdBy: 'user',
        });
    });

    it('syncs review findings by stable source reference without touching user-created items', async () => {
        const userItem = await repository.addImplementationTodoItem(repositoryRoot, 'task.json', 'Logic Review', createTodoDraft({
            source: 'user-note', sourceRef: 'user:own-note', title: 'Keep my note',
        }), 'user');
        const finding = createTodoDraft({ source: 'logic-review', sourceRef: 'logic-review.md#finding-1', title: 'Fix confirmed regression' });
        await repository.syncReviewTodos(repositoryRoot, 'task.json', 'logic-review', 'Logic Review', [finding]);
        await repository.syncReviewTodos(repositoryRoot, 'task.json', 'logic-review', 'Logic Review', [
            { ...finding, title: 'Updated regression finding' },
            { ...finding, sourceRef: 'logic-review.md#finding-2', title: 'Fix second regression' },
        ]);
        let group = (await repository.readImplementationTodo(repositoryRoot, 'task.json')).groups[0];
        expect(group?.items.map((item) => item.title)).toEqual(['Keep my note', 'Updated regression finding', 'Fix second regression']);

        await repository.syncReviewTodos(repositoryRoot, 'task.json', 'logic-review', 'Logic Review', []);
        group = (await repository.readImplementationTodo(repositoryRoot, 'task.json')).groups[0];
        expect(group?.items).toEqual([expect.objectContaining({ id: userItem.id, title: 'Keep my note', createdBy: 'user' })]);
    });

    it('rejects unsafe artifact paths and symlinks', async () => {
        await expect(repository.listAgentOutputs(repositoryRoot, '../task.json')).rejects.toThrow('Invalid task');
        await expect(repository.getAgentOutputPath(repositoryRoot, 'task.json', '../logic-review.md')).rejects.toThrow('Invalid agent');
        await expect(repository.getAgentOutputPath(repositoryRoot, 'task.json', 'unrelated.md')).rejects.toThrow('Invalid agent');
        const directory = path.join(repositoryRoot, '.history', 'agents', 'task.json');
        await mkdir(directory, { recursive: true });
        const otherPath = path.join(repositoryRoot, 'private.md');
        await writeFile(otherPath, 'Private');
        await symlink(otherPath, path.join(directory, 'logic-review.md'));
        await expect(repository.getAgentOutputPath(repositoryRoot, 'task.json', 'logic-review.md')).rejects.toThrow('regular file');
        const groups = await repository.listAgentOutputs(repositoryRoot, 'task.json');
        expect(groups.find((group) => group.id === 'logic-review')?.files).toEqual([]);
    });

    it('creates a UTC task file with a collision-resistant name and initial state', async () => {
        const taskId = await repository.createTask(repositoryRoot, {
            name: 'New task',
            projectManagementUrl: 'https://example.com/tasks/123',
            description: 'Task details',
        }, new Date('2026-10-30T12:34:56.789Z'));

        expect(taskId).toMatch(/^20261030-123456-[A-Za-z0-9]{15}\.json$/);
        const taskContents = await readFile(path.join(repositoryRoot, '.history', 'tasks', taskId), 'utf8');
        expect(JSON.parse(taskContents)).toEqual({
            name: 'New task',
            createdOnDateTime: '2026-10-30T12:34:56Z',
            projectManagementUrl: 'https://example.com/tasks/123',
            description: 'Task details',
            createdBy: 'developer@example.com',
            status: 0,
            timeTracking: [],
        });
    });

    it('requires Git email before creating a task', async () => {
        const repositoryWithoutGitEmail = new TaskRepository(async () => undefined);

        await expect(repositoryWithoutGitEmail.createTask(repositoryRoot, {
            name: 'No identity',
            projectManagementUrl: 'https://example.com/tasks/123',
            description: 'Details',
        })).rejects.toThrow('Set your Git email');
        expect(await repository.listOpenTasks(repositoryRoot)).toEqual([]);
    });

    it('updates editable fields while preserving task state and additional fields', async () => {
        const taskDirectory = path.join(repositoryRoot, '.history', 'tasks');
        const taskId = '20261030-123456-Abcdef012345678.json';
        await writeFile(path.join(taskDirectory, taskId), JSON.stringify({
            name: 'Original name',
            createdOnDateTime: '2026-10-30T12:34:56Z',
            projectManagementUrl: 'https://example.com/old',
            description: 'Original description',
            status: 0,
            timeTracking: [{ startDateTime: '2026-10-30T12:35:00Z', endDateTime: null }],
            futureField: { keep: true },
        }));

        await repository.updateTask(repositoryRoot, taskId, {
            name: 'Updated name',
            projectManagementUrl: 'https://example.com/new',
            description: 'Updated description',
        });

        const updatedTask = JSON.parse(await readFile(path.join(taskDirectory, taskId), 'utf8'));
        expect(updatedTask).toEqual({
            name: 'Updated name',
            createdOnDateTime: '2026-10-30T12:34:56Z',
            projectManagementUrl: 'https://example.com/new',
            description: 'Updated description',
            status: 0,
            timeTracking: [{ startDateTime: '2026-10-30T12:35:00Z', endDateTime: null }],
            futureField: { keep: true },
        });
    });

    it('does not edit a task that is no longer open', async () => {
        const taskId = '20261030-123456-Abcdef012345678.json';
        const taskPath = path.join(repositoryRoot, '.history', 'tasks', taskId);
        await writeTask(path.dirname(taskPath), taskId, 'Done task', '2026-10-30T12:34:56Z', 2);

        await expect(repository.updateTask(repositoryRoot, taskId, {
            name: 'Updated name',
            projectManagementUrl: 'https://example.com/new',
            description: 'Updated description',
        })).rejects.toThrow('This task is no longer open or has invalid data.');
        expect(JSON.parse(await readFile(taskPath, 'utf8')).name).toBe('Done task');
    });

    it('starts and pauses time tracking with UTC timestamps and the Git email', async () => {
        const taskId = await repository.createTask(repositoryRoot, {
            name: 'Tracked task',
            projectManagementUrl: 'https://example.com/tasks/123',
            description: 'Details',
        }, new Date('2026-10-30T12:00:00Z'));
        const repositoryWithGitEmail = new TaskRepository(async () => 'developer@example.com');

        const started = await repositoryWithGitEmail.toggleTimeTracking(
            repositoryRoot,
            taskId,
            new Date('2026-10-30T12:30:45.123Z'),
        );
        expect(started.timeTracking).toEqual([{
            startDateTime: '2026-10-30T12:30:45Z',
            endDateTime: null,
            user: 'developer@example.com',
        }]);
        expect(started.status).toBe(1);

        const paused = await repositoryWithGitEmail.toggleTimeTracking(
            repositoryRoot,
            taskId,
            new Date('2026-10-30T13:15:20.987Z'),
        );
        expect(paused.timeTracking[0]).toEqual({
            startDateTime: '2026-10-30T12:30:45Z',
            endDateTime: '2026-10-30T13:15:20Z',
            user: 'developer@example.com',
        });
        expect(paused.status).toBe(1);
    });

    it('does not start a timer when Git email lookup fails', async () => {
        const taskId = await repository.createTask(repositoryRoot, {
            name: 'Unidentified task',
            projectManagementUrl: 'https://example.com/tasks/123',
            description: 'Details',
        });
        const repositoryWithoutGitEmail = new TaskRepository(async () => {
            throw new Error('Git email unavailable.');
        });

        await expect(repositoryWithoutGitEmail.toggleTimeTracking(repositoryRoot, taskId))
            .rejects.toThrow('Git email unavailable.');
        const task = JSON.parse(await readFile(path.join(repositoryRoot, '.history', 'tasks', taskId), 'utf8'));
        expect(task.timeTracking).toEqual([]);
    });

    it('closes an active timer session when marking a task done', async () => {
        const taskId = await repository.createTask(repositoryRoot, {
            name: 'Status task',
            projectManagementUrl: 'https://example.com/tasks/123',
            description: 'Details',
        });

        const started = await new TaskRepository(async () => 'developer@example.com').toggleTimeTracking(
            repositoryRoot,
            taskId,
            new Date('2026-10-30T12:30:00Z'),
        );
        const closed = await repository.closeTask(
            repositoryRoot,
            taskId,
            new Date('2026-10-30T12:45:00Z'),
        );

        expect(started.status).toBe(1);
        expect(closed.status).toBe(2);
        expect(closed.timeTracking).toEqual([{
            startDateTime: '2026-10-30T12:30:00Z',
            endDateTime: '2026-10-30T12:45:00Z',
            user: 'developer@example.com',
        }]);
        expect(await repository.listOpenTasks(repositoryRoot)).toEqual([]);
        await expect(repository.closeTask(repositoryRoot, taskId)).rejects.toThrow('Task is already done.');
    });

    it('resumes a done task when time tracking starts again', async () => {
        const taskId = await repository.createTask(repositoryRoot, {
            name: 'Resumable task',
            projectManagementUrl: 'https://example.com/tasks/123',
            description: 'Details',
        });
        const closedTask = await repository.closeTask(repositoryRoot, taskId);
        expect(closedTask.status).toBe(2);

        const resumedTask = await new TaskRepository(async () => 'developer@example.com').toggleTimeTracking(
            repositoryRoot,
            taskId,
            new Date('2026-10-30T14:00:00Z'),
        );

        expect(resumedTask.status).toBe(1);
        expect(resumedTask.timeTracking.at(-1)).toEqual({
            startDateTime: '2026-10-30T14:00:00Z',
            endDateTime: null,
            user: 'developer@example.com',
        });
    });

    it('replaces the current agent marker and stops the previous task timer', async () => {
        const firstTaskId = await repository.createTask(repositoryRoot, {
            name: 'First task',
            projectManagementUrl: 'https://example.com/tasks/1',
            description: 'First task details',
        });
        const secondTaskId = await repository.createTask(repositoryRoot, {
            name: 'Second task',
            projectManagementUrl: 'https://example.com/tasks/2',
            description: 'Second task details',
        });
        const startedAt = new Date('2026-10-30T12:00:00Z');
        const switchedAt = new Date('2026-10-30T13:00:00Z');
        const firstTask = await new TaskRepository(async () => 'developer@example.com').toggleTimeTracking(
            repositoryRoot,
            firstTaskId,
            startedAt,
        );
        await repository.startAgentTask(repositoryRoot, firstTask, startedAt);

        const secondTask = await new TaskRepository(async () => 'developer@example.com').toggleTimeTracking(
            repositoryRoot,
            secondTaskId,
            switchedAt,
        );
        await repository.startAgentTask(repositoryRoot, secondTask, switchedAt);

        const pausedFirstTask = await repository.getTask(repositoryRoot, firstTaskId);
        expect(pausedFirstTask?.timeTracking[0]?.endDateTime).toBe('2026-10-30T13:00:00Z');

        const agentRoot = path.join(repositoryRoot, '.history', 'agents');
        const agentDirectories = await readdir(agentRoot);
        expect(agentDirectories).toContain(secondTaskId);
        const markerPaths = agentDirectories.map((directory) => path.join(agentRoot, directory, '.current'));
        const markerContents = await Promise.all(markerPaths.map(async (markerPath) => {
            try {
                return await readFile(markerPath, 'utf8');
            } catch (error) {
                if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
                    return undefined;
                }
                throw error;
            }
        }));
        const currentMarkers = markerContents.filter((content) => content !== undefined);

        expect(currentMarkers).toHaveLength(1);
        expect(JSON.parse(currentMarkers[0]!)).toEqual({
            taskId: secondTaskId,
            taskName: 'Second task',
            taskFile: path.posix.join('.history', 'tasks', secondTaskId),
            startedAtDateTime: '2026-10-30T13:00:00Z',
        });
    });

    it('stops task time tracking and clears its current marker', async () => {
        const taskId = await repository.createTask(repositoryRoot, {
            name: 'Tracked task',
            projectManagementUrl: 'https://example.com/tasks/123',
            description: 'Details',
        });
        const startedAt = new Date('2026-10-30T12:00:00Z');
        const startedTask = await new TaskRepository(async () => 'developer@example.com').toggleTimeTracking(
            repositoryRoot,
            taskId,
            startedAt,
        );
        await repository.startAgentTask(repositoryRoot, startedTask, startedAt);

        await repository.stopAgentTask(repositoryRoot, taskId, new Date('2026-10-30T12:30:00Z'));

        const task = await repository.getTask(repositoryRoot, taskId);
        expect(task?.timeTracking[0]?.endDateTime).toBe('2026-10-30T12:30:00Z');
        const agentRoot = path.join(repositoryRoot, '.history', 'agents');
        const directories = await readdir(agentRoot);
        const markerFiles = await Promise.all(directories.map((directory) =>
            readdir(path.join(agentRoot, directory)),
        ));
        expect(markerFiles.flat()).not.toContain('.current');
    });
});

async function writeTask(
    directory: string,
    fileName: string,
    name: string,
    createdOnDateTime: string,
    status: number,
): Promise<void> {
    const task = {
        name,
        createdOnDateTime,
        projectManagementUrl: '',
        description: '',
        status,
        timeTracking: [],
    };
    await writeFile(path.join(directory, fileName), JSON.stringify(task));
}

function createTodoDocument(): ImplementationTodoDocument {
    const createItem = (overrides: Partial<ImplementationTodoItem>): ImplementationTodoItem => ({
        id: 'implement-core-flow',
        title: 'Build the foundation',
        done: false,
        source: 'plan',
        sourceRef: 'implementation-plan.md#phase-1',
        why: 'The application needs this foundation.',
        files: ['src/core.ts'],
        decisions: 'Keep existing boundaries.',
        acceptance: 'The focused test passes.',
        evidence: 'Focused test passed.',
        remaining: '',
        alert: null,
        createdBy: 'agent',
        updatedBy: 'agent',
        updatedAt: '2026-11-01T10:00:00Z',
        ...overrides,
    });
    return {
        version: 1,
        summary: '0 done, 2 open. Next: Build the foundation.',
        plan: 'implementation-plan.md',
        planSyncedAt: '2026-11-01T10:00:00Z',
        groups: [
            { name: 'Foundation', items: [createItem({})] },
            { name: 'Verification', items: [createItem({ id: 'verify-core-flow', title: 'Add functional coverage', done: false })] },
        ],
    };
}

function createTodoDraft(overrides: Partial<ImplementationTodoItem> = {}): ImplementationTodoItemDraft {
    const item: ImplementationTodoItem = {
        id: 'todo-draft',
        title: 'Build the foundation',
        done: false,
        source: 'plan',
        sourceRef: 'implementation-plan.md#phase-1',
        why: 'The application needs this foundation.',
        files: ['src/core.ts'],
        decisions: 'Keep existing boundaries.',
        acceptance: 'The focused test passes.',
        evidence: '',
        remaining: 'Implement and test the item.',
        alert: null,
        createdBy: 'agent',
        updatedBy: 'agent',
        updatedAt: '2026-11-01T10:00:00Z',
        ...overrides,
    };
    const { id: _id, createdBy: _createdBy, updatedBy: _updatedBy, updatedAt: _updatedAt, ...draft } = item;
    return draft;
}