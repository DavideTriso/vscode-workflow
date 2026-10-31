import { describe, expect, it } from 'vitest';
import { compareTasksNewestFirst, createOpenTaskSummary, filterTasks, validateTaskInput } from '../src/tasks/taskModel';

describe('task model', () => {
    it('includes only named open tasks with a valid creation date', () => {
        expect(createOpenTaskSummary('open.json', {
            name: 'Open task',
            createdOnDateTime: '2026-10-30T10:00:00Z',
            status: 0,
        })).toEqual({
            id: 'open.json',
            name: 'Open task',
            createdOnDateTime: '2026-10-30T10:00:00Z',
            projectManagementUrl: '',
            description: '',
            status: 0,
            timeTracking: [],
        });
        expect(createOpenTaskSummary('in-progress.json', {
            name: 'In progress task',
            createdOnDateTime: '2026-10-30T10:00:00Z',
            status: 1,
        })?.status).toBe(1);
        expect(createOpenTaskSummary('done.json', { name: 'Done', createdOnDateTime: '2026-10-30T10:00:00Z', status: 2 })).toBeUndefined();
        expect(createOpenTaskSummary('invalid.json', { name: 'Invalid', createdOnDateTime: 'not a date', status: 0 })).toBeUndefined();
    });

    it('sorts open tasks newest first', () => {
        const older = createOpenTaskSummary('older.json', {
            name: 'Older',
            createdOnDateTime: '2026-10-29T10:00:00Z',
            status: 0,
        })!;
        const newer = createOpenTaskSummary('newer.json', {
            name: 'Newer',
            createdOnDateTime: '2026-10-30T10:00:00Z',
            status: 0,
        })!;

        expect([older, newer].sort(compareTasksNewestFirst)).toEqual([newer, older]);
    });

    it('reports missing fields and rejects non-http project URLs', () => {
        expect(validateTaskInput({
            name: ' ',
            projectManagementUrl: 'javascript:alert(1)',
            description: '',
        })).toEqual({
            name: 'Enter a task name.',
            projectManagementUrl: 'Enter a valid http or https URL.',
            description: 'Enter a task description.',
        });
    });

    it('filters by current Git email when enabled and shows all tasks when disabled', () => {
        const ownTask = createOpenTaskSummary('own.json', {
            name: 'Own task',
            createdOnDateTime: '2026-10-30T10:00:00Z',
            createdBy: 'owner@example.com',
            status: 0,
        })!;
        const otherTask = createOpenTaskSummary('other.json', {
            name: 'Other task',
            createdOnDateTime: '2026-10-30T09:00:00Z',
            createdBy: 'other@example.com',
            status: 0,
        })!;

        expect(filterTasks([ownTask, otherTask], '', true, 'owner@example.com')).toEqual([ownTask]);
        expect(filterTasks([ownTask, otherTask], '', false, undefined)).toEqual([ownTask, otherTask]);
    });
});