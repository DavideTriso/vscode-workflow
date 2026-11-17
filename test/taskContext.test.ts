import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { formatTaskContext, readTaskContext } from '../src/scm/taskContext';

let repositoryRoot: string;

beforeEach(async () => {
    repositoryRoot = await mkdtemp(path.join(os.tmpdir(), 'task-context-'));
});

afterEach(async () => {
    await rm(repositoryRoot, { recursive: true, force: true });
});

async function addTask(taskId: string, task: Record<string, unknown>, options: { active: boolean; reports?: Record<string, string> }): Promise<void> {
    const tasks = path.join(repositoryRoot, '.history', 'tasks');
    const folder = path.join(repositoryRoot, '.history', 'agents', taskId);
    await mkdir(tasks, { recursive: true });
    await mkdir(folder, { recursive: true });
    await writeFile(path.join(tasks, taskId), JSON.stringify(task));
    if (options.active) {
        await writeFile(path.join(folder, '.current'), JSON.stringify({ taskId, taskName: String(task.name), taskFile: `.history/tasks/${taskId}` }));
    }
    for (const [fileName, content] of Object.entries(options.reports ?? {})) {
        await writeFile(path.join(folder, fileName), content);
    }
}

describe('readTaskContext', () => {
    it('returns the task name, description and every Markdown report, in file name order', async () => {
        await addTask('one.json', { name: 'Commit solutions', description: 'Add a button.' }, {
            active: true,
            reports: {
                'logic-review.md': 'No findings.',
                'implementation-plan.md': 'The plan.',
                'implementation-todo.json': '{"secret":"progress"}',
                'notes.txt': 'not a report',
            },
        });

        const context = await readTaskContext(repositoryRoot);

        expect(context?.taskName).toBe('Commit solutions');
        expect(context?.description).toBe('Add a button.');
        expect(context?.reports.map((report) => report.fileName)).toEqual(['implementation-plan.md', 'logic-review.md']);
        expect(context?.omittedReports).toEqual([]);
    });

    it('returns undefined when there is no active task, no history folder, or more than one marker', async () => {
        expect(await readTaskContext(repositoryRoot)).toBeUndefined();

        await addTask('idle.json', { name: 'Idle' }, { active: false, reports: { 'plan.md': 'x' } });
        expect(await readTaskContext(repositoryRoot)).toBeUndefined();

        await addTask('a.json', { name: 'A' }, { active: true });
        await addTask('b.json', { name: 'B' }, { active: true });
        expect(await readTaskContext(repositoryRoot)).toBeUndefined();
    });

    it('ignores a malformed marker', async () => {
        await addTask('good.json', { name: 'Good' }, { active: true });
        const broken = path.join(repositoryRoot, '.history', 'agents', 'broken.json');
        await mkdir(broken, { recursive: true });
        await writeFile(path.join(broken, '.current'), '{not json');

        expect((await readTaskContext(repositoryRoot))?.taskName).toBe('Good');
    });

    it('falls back to the marker task name when the task file is missing', async () => {
        await addTask('gone.json', { name: 'Gone' }, { active: true });
        await rm(path.join(repositoryRoot, '.history', 'tasks', 'gone.json'));

        const context = await readTaskContext(repositoryRoot);

        expect(context?.taskName).toBe('Gone');
        expect(context?.description).toBe('');
    });

    it('cuts long reports and leaves out reports that do not fit the total limit', async () => {
        await addTask('big.json', { name: 'Big' }, {
            active: true,
            reports: { 'a.md': 'a'.repeat(50), 'b.md': 'b'.repeat(50), 'c.md': 'c'.repeat(50) },
        });

        const context = await readTaskContext(repositoryRoot, { maxReportChars: 30, maxTotalChars: 50 });

        expect(context?.reports).toEqual([
            { fileName: 'a.md', content: 'a'.repeat(30), truncated: true },
            { fileName: 'b.md', content: 'b'.repeat(20), truncated: true },
        ]);
        expect(context?.omittedReports).toEqual(['c.md']);
    });
});

describe('formatTaskContext', () => {
    it('lists the task, each report, and what was cut or left out', () => {
        const text = formatTaskContext({
            taskName: 'Task',
            description: '',
            reports: [{ fileName: 'plan.md', content: 'The plan.', truncated: true }],
            omittedReports: ['late.md'],
        });

        expect(text).toContain('Task name: Task');
        expect(text).toContain('(none)');
        expect(text).toContain('Report plan.md:\nThe plan.\n[report truncated]');
        expect(text).toContain('left out because of the size limit: late.md');
    });
});
