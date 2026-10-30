import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TaskRepository } from '../src/tasks/taskRepository';

describe('task repository', () => {
    const repository = new TaskRepository();
    let repositoryRoot: string;

    beforeEach(async () => {
        repositoryRoot = await mkdtemp(path.join(os.tmpdir(), 'vscode-tasks-'));
        await mkdir(path.join(repositoryRoot, 'history', 'tasks'), { recursive: true });
    });

    afterEach(async () => {
        await rm(repositoryRoot, { recursive: true, force: true });
    });

    it('lists valid open task files newest first', async () => {
        const taskDirectory = path.join(repositoryRoot, 'history', 'tasks');
        await writeTask(taskDirectory, 'older.json', 'Older', '2026-10-29T10:00:00Z', 0);
        await writeTask(taskDirectory, 'newer.json', 'Newer', '2026-10-30T10:00:00Z', 0);
        await writeTask(taskDirectory, 'done.json', 'Done', '2026-10-30T11:00:00Z', 2);
        await writeFile(path.join(taskDirectory, 'malformed.json'), '{');

        const tasks = await repository.listOpenTasks(repositoryRoot);

        expect(tasks.map((task) => task.id)).toEqual(['newer.json', 'older.json']);
    });

    it('rejects task ids that could escape the task directory', async () => {
        await expect(repository.deleteTask(repositoryRoot, '../outside.json')).rejects.toThrow('Invalid task file name.');
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
            status: 0,
            timeTracking: [],
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