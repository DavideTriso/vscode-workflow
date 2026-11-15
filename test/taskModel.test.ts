import { describe, expect, it } from 'vitest';
import { buildAssigneeOptions, compareTasksNewestFirst, createOpenTaskSummary, filterTasks, formatUser, getUserEmail, readTeamMembers, validateTaskInput } from '../src/tasks/taskModel';

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
            relatedTasks: [],
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
            assignee: ' ',
        })).toEqual({
            name: 'Enter a task name.',
            projectManagementUrl: 'Enter a valid http or https URL.',
            description: 'Enter a task description.',
            assignee: 'Select an assignee.',
        });
    });

    it('allows an empty project URL when it is not required but still validates a given URL', () => {
        const base = { name: 'Task', description: 'Description', assignee: 'owner@example.com <Owner>' };
        const options = { requireProjectManagementUrl: false };
        expect(validateTaskInput({ ...base, projectManagementUrl: '' }, options)).toEqual({});
        expect(validateTaskInput({ ...base, projectManagementUrl: '  ' }, options)).toEqual({});
        expect(validateTaskInput({ ...base, projectManagementUrl: 'javascript:alert(1)' }, options)).toEqual({
            projectManagementUrl: 'Enter a valid http or https URL.',
        });
        expect(validateTaskInput({ ...base, projectManagementUrl: '' }, { requireProjectManagementUrl: true })).toEqual({
            projectManagementUrl: 'Enter a project management URL.',
        });
    });

    it('filters by assignee email when enabled and shows all tasks when disabled', () => {
        const assignedTask = createOpenTaskSummary('assigned.json', {
            name: 'Assigned to me',
            createdOnDateTime: '2026-10-30T10:00:00Z',
            createdBy: 'other@example.com <Other>',
            assignee: 'Owner@example.com <Owner>',
            status: 0,
        })!;
        const createdOnlyTask = createOpenTaskSummary('created.json', {
            name: 'Created by me for someone else',
            createdOnDateTime: '2026-10-30T09:00:00Z',
            createdBy: 'owner@example.com <Owner>',
            assignee: 'other@example.com <Other>',
            status: 0,
        })!;
        const legacyTask = createOpenTaskSummary('legacy.json', {
            name: 'Legacy task without assignee',
            createdOnDateTime: '2026-10-30T08:00:00Z',
            createdBy: 'owner@example.com',
            status: 0,
        })!;
        const tasks = [assignedTask, createdOnlyTask, legacyTask];

        expect(filterTasks(tasks, '', true, 'owner@example.com <Renamed Owner>')).toEqual([assignedTask]);
        expect(filterTasks(tasks, '', true, undefined)).toEqual([]);
        expect(filterTasks(tasks, '', false, undefined)).toEqual(tasks);
    });

    it('formats users as "email <name>" and reads their email back', () => {
        expect(formatUser({ email: ' dev@example.com ', name: ' Dev ' })).toBe('dev@example.com <Dev>');
        expect(formatUser({ email: 'dev@example.com' })).toBe('dev@example.com');
        expect(getUserEmail('Dev@Example.com <Dev>')).toBe('dev@example.com');
        expect(getUserEmail('dev@example.com')).toBe('dev@example.com');
    });

    it('reads valid team members from settings', () => {
        expect(readTeamMembers([
            { email: 'a@example.com', name: 'A' },
            { email: ' b@example.com ', name: ' ' },
            { email: '', name: 'Missing email' },
            'invalid',
        ])).toEqual([{ email: 'a@example.com', name: 'A' }, { email: 'b@example.com' }]);
        expect(readTeamMembers(undefined)).toEqual([]);
    });

    it('lists the current user first and removes duplicate assignee emails', () => {
        expect(buildAssigneeOptions(
            'me@example.com <Me>',
            ['a@example.com <A>', 'ME@example.com <Me Again>'],
            ['former@example.com', 'a@example.com', undefined, ''],
        )).toEqual(['me@example.com <Me>', 'a@example.com <A>', 'former@example.com']);
    });
});
