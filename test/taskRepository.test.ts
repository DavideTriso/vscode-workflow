import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TaskRepository } from '../src/tasks/taskRepository';

describe('task repository', () => {
    let repository: TaskRepository;
    let repositoryRoot: string;

    beforeEach(async () => {
        repository = new TaskRepository(async () => 'developer@example.com');
        repositoryRoot = await mkdtemp(path.join(os.tmpdir(), 'vscode-tasks-'));
        await mkdir(path.join(repositoryRoot, 'history', 'tasks'), { recursive: true });
    });

    afterEach(async () => {
        await rm(repositoryRoot, { recursive: true, force: true });
    });

    it('lists valid open task files newest first', async () => {
        const taskDirectory = path.join(repositoryRoot, 'history', 'tasks');
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

    it('creates a UTC task file with a collision-resistant name and initial state', async () => {
        const taskId = await repository.createTask(repositoryRoot, {
            name: 'New task',
            projectManagementUrl: 'https://example.com/tasks/123',
            description: 'Task details',
        }, new Date('2026-10-30T12:34:56.789Z'));

        expect(taskId).toMatch(/^20261030-123456-[A-Za-z0-9]{15}\.json$/);
        const taskContents = await readFile(path.join(repositoryRoot, 'history', 'tasks', taskId), 'utf8');
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
        const taskDirectory = path.join(repositoryRoot, 'history', 'tasks');
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
        const taskPath = path.join(repositoryRoot, 'history', 'tasks', taskId);
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
        const task = JSON.parse(await readFile(path.join(repositoryRoot, 'history', 'tasks', taskId), 'utf8'));
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