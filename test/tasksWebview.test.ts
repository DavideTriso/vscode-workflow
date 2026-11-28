import { buildSync } from 'esbuild';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import { getTasksWebviewHtml } from '../src/tasks/tasksWebviewHtml';
import type { AgentOutputGroup, ExtensionToWebviewMessage, ImplementationTodoItem, TaskSummary } from '../src/tasks/taskProtocol';

vi.mock('vscode', () => ({
    Uri: { joinPath: (_base: unknown, ...parts: string[]) => parts.join('/') },
}));

const script = buildSync({
    entryPoints: [path.resolve('src/ui/tasks/main.ts')],
    bundle: true,
    platform: 'browser',
    format: 'iife',
    write: false,
}).outputFiles[0]!.text;

const task: TaskSummary = {
    id: 'task.json', name: 'Task', description: 'Details', status: 1,
    createdOnDateTime: '2026-11-01T10:00:00Z', projectManagementUrl: '', timeTracking: [],
};
const item: ImplementationTodoItem = {
    id: 'first-item', title: 'Implement feature', done: false, source: 'plan',
    sourceRef: 'implementation-plan.md#step-1', why: 'Feature rationale', files: ['src/feature.ts'],
    decisions: 'Preserve compatibility', acceptance: 'Functional tests pass', evidence: '', remaining: '',
    alert: null, createdBy: 'agent', updatedBy: 'agent', updatedAt: '2026-11-01T10:00:00Z',
};
const groups: AgentOutputGroup[] = [{
    id: 'implement', name: 'Implementation TODOs',
    files: [{ fileName: 'implementation-todo.json', summary: 'Two open items.' }],
    todoGroups: [
        { name: 'Feature', items: [item] },
        { name: 'Verification', items: [{ ...item, id: 'second-item', title: 'Verify feature', done: true }] },
    ],
}];

describe('task webview TODO interactions', () => {
    let dom: JSDOM;
    let document: Document;
    let postMessage: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        const html = getTasksWebviewHtml({ asWebviewUri: (uri) => uri, cspSource: 'vscode-webview:' } as vscode.Webview, {} as vscode.Uri);
        dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true });
        document = dom.window.document;
        postMessage = vi.fn();
        Object.assign(dom.window, { acquireVsCodeApi: () => ({ postMessage }) });
        dom.window.eval(script);
        send({ type: 'taskList', tasks: [task] });
        send({ type: 'selectedTask', task });
        send({ type: 'agentOutputs', taskId: task.id, groups });
    });

    afterEach(() => dom.window.close());

    function send(message: ExtensionToWebviewMessage): void {
        dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: message }));
    }

    function click(selector: string): void {
        const button = document.querySelector<HTMLElement>(selector);
        expect(button, selector).not.toBeNull();
        button!.click();
    }

    function field(name: string): HTMLInputElement | HTMLTextAreaElement {
        return document.querySelector(`.implementation-todo-editor [name="${name}"]`)!;
    }

    it('toggles the required marker on the project URL field from the taskSettings message', () => {
        const marker = document.querySelector<HTMLElement>('#task-url-required')!;
        const input = document.querySelector<HTMLInputElement>('#task-url')!;
        send({ type: 'taskSettings', requireProjectManagementUrl: false, teamMembers: [] });
        expect(marker.hidden).toBe(true);
        expect(input.required).toBe(false);
        send({ type: 'taskSettings', requireProjectManagementUrl: true, teamMembers: [] });
        expect(marker.hidden).toBe(false);
        expect(input.required).toBe(true);
    });

    it('defaults the assignee dropdown to the current user and submits the chosen team member', () => {
        send({ type: 'taskSettings', requireProjectManagementUrl: false, teamMembers: ['a@example.com <A>', 'me@example.com <Me>'] });
        send({ type: 'taskList', tasks: [task], currentUser: 'me@example.com <Me>' });
        click('#add-task-button');
        const assignee = document.querySelector<HTMLSelectElement>('#task-assignee')!;
        const choices = [...assignee.options].filter((option) => !option.disabled).map((option) => option.value);
        expect(choices).toEqual(['me@example.com <Me>', 'a@example.com <A>']);
        expect(assignee.value).toBe('me@example.com <Me>');
        expect(assignee.required).toBe(true);

        document.querySelector<HTMLInputElement>('#task-name')!.value = 'New task';
        document.querySelector<HTMLTextAreaElement>('#task-description')!.value = 'Details';
        assignee.value = 'a@example.com <A>';
        click('#create-task-submit');
        expect(postMessage).toHaveBeenCalledWith({
            type: 'saveTask',
            input: { name: 'New task', projectManagementUrl: '', description: 'Details', assignee: 'a@example.com <A>', relatedTasks: [] },
        });
    });

    it('uses icon-only view/add/more actions and no Move button', () => {
        for (const selector of ['.agent-output-view', '.agent-output-add', '.implementation-todo-view', '.implementation-todo-more']) {
            const button = document.querySelector<HTMLButtonElement>(selector)!;
            expect(button.textContent?.trim()).toBe('');
            expect(button.querySelector('svg')).not.toBeNull();
            expect(button.title).not.toBe('');
            expect(button.getAttribute('aria-label')).not.toBeNull();
        }
        expect(document.querySelector('.implementation-todo-drag-handle')).toBeNull();
        const todoActions = document.querySelector('.implementation-todo-actions')!;
        expect(todoActions.querySelectorAll(':scope > button')).toHaveLength(1);
        expect(todoActions.querySelectorAll(':scope > .more-menu > .implementation-todo-more')).toHaveLength(1);
    });

    it('shows only Open and a "more" dropdown with Edit and Delete for each task', () => {
        click('#creator-filter-toggle');
        const row = document.querySelector<HTMLElement>('.task-row')!;
        expect(Array.from(row.querySelectorAll(':scope > button'), (button) => button.className)).toEqual(['task-select', 'task-action open-task-file']);
        const more = row.querySelector<HTMLButtonElement>('.task-more')!;
        const menu = row.querySelector<HTMLElement>('.task-menu')!;
        expect(menu.hidden).toBe(true);
        more.click();
        expect(menu.hidden).toBe(false);
        expect(Array.from(menu.querySelectorAll('[role="menuitem"]'), (entry) => entry.textContent)).toEqual(['Edit', 'Delete']);
        expect(postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'selectTask' }));

        click('.task-row .edit-task');
        expect(menu.hidden).toBe(true);
        expect(postMessage).toHaveBeenLastCalledWith({ type: 'editTask', taskId: task.id });
        more.click();
        click('.task-row .delete-task');
        expect(postMessage).toHaveBeenLastCalledWith({ type: 'deleteTask', taskId: task.id });
    });

    it('shows Edit, Create task and Delete in the TODO "more" dropdown', () => {
        const row = '.implementation-todo-item[data-todo-id="first-item"]';
        const more = document.querySelector<HTMLButtonElement>(`${row} .implementation-todo-more`)!;
        const menu = document.querySelector<HTMLElement>(`${row} .implementation-todo-menu`)!;
        expect(menu.hidden).toBe(true);
        more.click();
        expect(menu.hidden).toBe(false);
        expect(more.getAttribute('aria-expanded')).toBe('true');
        expect([...menu.querySelectorAll('[role="menuitem"]')].map((entry) => entry.textContent)).toEqual(['Edit', 'Create task', 'Delete']);
        document.body.click();
        expect(menu.hidden).toBe(true);

        more.click();
        click(`${row} .implementation-todo-remove`);
        expect(menu.hidden).toBe(true);
        expect(postMessage).toHaveBeenLastCalledWith({ type: 'removeTodo', taskId: task.id, itemId: 'first-item' });
    });

    it('creates a task pre-filled from a TODO and asks to remove that TODO on save', () => {
        const parent = { ...task, projectManagementUrl: 'https://pm.example.com/1', assignee: 'a@example.com <A>' };
        send({ type: 'taskSettings', requireProjectManagementUrl: true, teamMembers: ['a@example.com <A>'] });
        send({ type: 'taskList', tasks: [parent], currentUser: 'me@example.com <Me>' });
        send({ type: 'selectedTask', task: parent });
        send({ type: 'agentOutputs', taskId: task.id, groups });

        click('.implementation-todo-item[data-todo-id="first-item"] .implementation-todo-create-task');
        expect(document.querySelector<HTMLElement>('#create-task-panel')!.hidden).toBe(false);
        expect(document.querySelector<HTMLInputElement>('#task-name')!.value).toBe('Implement feature');
        expect(document.querySelector<HTMLInputElement>('#task-url')!.value).toBe('https://pm.example.com/1');
        expect(document.querySelector<HTMLSelectElement>('#task-assignee')!.value).toBe('a@example.com <A>');
        const description = document.querySelector<HTMLTextAreaElement>('#task-description')!.value;
        for (const text of ['Status: Open', 'implementation-plan.md#step-1', 'Feature rationale', '`src/feature.ts`', 'Preserve compatibility', 'Functional tests pass']) {
            expect(description).toContain(text);
        }

        click('#create-task-submit');
        expect(postMessage).toHaveBeenLastCalledWith({
            type: 'saveTask',
            input: expect.objectContaining({ name: 'Implement feature', assignee: 'a@example.com <A>' }),
            sourceTodo: { taskId: task.id, itemId: 'first-item' },
        });

        send({ type: 'taskSaved' });
        click('#add-task-button');
        document.querySelector<HTMLInputElement>('#task-name')!.value = 'Plain task';
        document.querySelector<HTMLInputElement>('#task-url')!.value = 'https://pm.example.com/2';
        document.querySelector<HTMLTextAreaElement>('#task-description')!.value = 'Details';
        click('#create-task-submit');
        expect(postMessage.mock.calls.at(-1)![0]).not.toHaveProperty('sourceTodo');
    });

    it('clamps TODO titles to two lines with full-text tooltips and no gaps between rows', () => {
        const fullTitle = 'A detailed TODO title that should wrap across multiple lines in a narrow sidebar without losing its full text';
        send({
            type: 'agentOutputs', taskId: task.id, groups: [{
                ...groups[0]!, todoGroups: [{ name: 'Feature', items: [{ ...item, title: fullTitle }] }],
            }],
        });
        const style = document.createElement('style');
        style.textContent = readFileSync(path.resolve('media/tasks.css'), 'utf8');
        document.head.append(style);
        const title = document.querySelector<HTMLElement>('.implementation-todo-title')!;
        expect(title.textContent).toBe(fullTitle);
        expect(title.title).toBe(fullTitle);
        const titleStyle = dom.window.getComputedStyle(title);
        expect(titleStyle.getPropertyValue('-webkit-line-clamp')).toBe('2');
        expect(titleStyle.overflow).toBe('hidden');
        expect(dom.window.getComputedStyle(document.querySelector('.implementation-todo-list')!).gap).toBe('0');
    });

    it('has no accordion-header hover backgrounds while retaining task and TODO row hover', () => {
        const style = document.createElement('style');
        style.textContent = readFileSync(path.resolve('media/tasks.css'), 'utf8');
        document.head.append(style);
        const selectors = Array.from(style.sheet!.cssRules)
            .filter((rule) => rule instanceof dom.window.CSSStyleRule)
            .map((rule) => (rule as CSSStyleRule).selectorText);
        expect(selectors.some((selector) => selector.includes('#tasks-accordion-toggle:hover'))).toBe(false);
        expect(selectors.some((selector) => selector.includes('.tasks-accordion-toggle:hover'))).toBe(false);
        expect(selectors.some((selector) => selector.includes('.agent-output-toggle:not(:disabled):hover'))).toBe(false);
        expect(selectors.some((selector) => selector.includes('.task-row:hover') && selector.includes('.implementation-todo-item:hover'))).toBe(true);
    });

    it('uses the full panel width for agent-output accordion content', () => {
        const style = document.createElement('style');
        style.textContent = readFileSync(path.resolve('media/tasks.css'), 'utf8');
        document.head.append(style);
        for (const content of document.querySelectorAll('.agent-output-content')) {
            const computedStyle = dom.window.getComputedStyle(content);
            expect(computedStyle.paddingLeft).toBe('0px');
            expect(computedStyle.paddingRight).toBe('0px');
            expect(computedStyle.paddingTop).toBe('4px');
            expect(computedStyle.paddingBottom).toBe('10px');
        }
    });

    it('replaces the TODO summary with a completed/total counter that updates across groups', () => {
        expect(document.querySelector('.implementation-todo-counter')?.textContent).toBe('1/2');
        expect(document.querySelector('#agent-output-implement .agent-output-summary')).toBeNull();
        send({
            type: 'agentOutputs', taskId: task.id, groups: [{
                ...groups[0]!,
                todoGroups: [{ name: 'All done', items: [{ ...item, done: true }, { ...item, id: 'second-item', done: true }] }],
            }]
        });
        expect(document.querySelector('.implementation-todo-counter')?.textContent).toBe('2/2');
        send({ type: 'agentOutputs', taskId: task.id, groups: [] });
        expect(document.querySelector('.implementation-todo-counter')?.textContent).toBe('0/0');
    });

    it('updates the counter during editing without discarding the form', () => {
        click('.implementation-todo-edit');
        field('title').value = 'Unsaved title';
        send({
            type: 'agentOutputs', taskId: task.id, groups: [{
                ...groups[0]!, todoGroups: [{ name: 'Feature', items: [{ ...item, done: true }] }],
            }]
        });
        expect(document.querySelector('.implementation-todo-counter')?.textContent).toBe('1/1');
        expect(field('title').value).toBe('Unsaved title');
    });

    it('replaces the TODO list with its editor, preserves group, and restores it on Cancel', () => {
        click('.implementation-todo-item[data-todo-id="second-item"] .implementation-todo-edit');
        expect(document.querySelector('#agent-output-implement')?.hasAttribute('hidden')).toBe(false);
        expect(document.querySelector('.implementation-todo-list')).toBeNull();
        expect(field('title').value).toBe('Verify feature');
        expect(field('group').value).toBe('Verification');
        expect(document.querySelector('.implementation-todo-editor select')).toBeNull();
        const textareas = document.querySelectorAll<HTMLTextAreaElement>('.implementation-todo-editor textarea');
        expect(textareas.length).toBeGreaterThan(0);
        expect([...textareas].every((textarea) => textarea.rows === 4)).toBe(true);
        expect(document.querySelector('.implementation-todo-editor .form-actions .primary-button')?.textContent).toBe('Save');
        expect(document.querySelector('.implementation-todo-editor .form-actions .secondary-button')?.textContent).toBe('Cancel');
        click('.implementation-todo-editor .secondary-button');
        expect(document.querySelector('.implementation-todo-editor')).toBeNull();
        expect(document.querySelectorAll('.implementation-todo-list')).toHaveLength(2);
    });

    it('keeps edits when a save fails and restores the list only on success', () => {
        click('.implementation-todo-edit');
        field('title').value = 'Edited feature';
        send({ type: 'agentOutputs', taskId: task.id, groups });
        expect(field('title').value).toBe('Edited feature');
        click('.implementation-todo-editor .primary-button');
        expect(postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
            type: 'updateTodo', taskId: task.id, itemId: 'first-item', group: 'Feature',
            changes: expect.objectContaining({ title: 'Edited feature' }),
        }));
        const payload = postMessage.mock.calls.at(-1)![0];
        expect(payload.changes).not.toHaveProperty('status');
        expect(payload.changes).not.toHaveProperty('done');
        send({ type: 'todoMutationResult', taskId: task.id, error: 'Write failed' });
        expect(field('title').value).toBe('Edited feature');
        expect(document.querySelector<HTMLButtonElement>('.implementation-todo-editor .primary-button')?.disabled).toBe(false);
        send({ type: 'todoMutationResult', taskId: task.id });
        expect(document.querySelector('.implementation-todo-editor')).toBeNull();
    });

    it('creates an open TODO through the plus action without a status control', () => {
        click('.agent-output-add');
        field('title').value = 'User-created task';
        field('group').value = 'Notes';
        click('.implementation-todo-editor .primary-button');
        expect(postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
            type: 'createTodo', group: 'Notes', item: expect.objectContaining({ title: 'User-created task', done: false }),
        }));
        expect(postMessage.mock.calls.at(-1)![0].item).not.toHaveProperty('status');
    });

    it('previews individual TODOs and keeps the existing task-scoped preview action', () => {
        click('.implementation-todo-view');
        expect(postMessage).toHaveBeenLastCalledWith({ type: 'viewTodo', taskId: task.id, itemId: 'first-item' });
        click('.agent-output-accordion:has(#agent-output-implement) .agent-output-view');
        expect(postMessage).toHaveBeenLastCalledWith({ type: 'viewAgentOutput', taskId: task.id, fileName: 'implementation-todo.json' });
    });

    it('lists debug reports and implementation summaries as rows that each preview their own file', () => {
        send({
            type: 'agentOutputs', taskId: task.id, groups: [
                ...groups,
                {
                    id: 'debug', name: 'Debug', files: [
                        { fileName: 'debug-20261128-041200-crash.md', summary: 'Fixed the crash.\nLine two.\nLine three.\nLine four.' },
                        { fileName: 'debug-report.md', summary: '' },
                    ],
                },
                { id: 'implement-summary', name: 'Implementation summaries', files: [{ fileName: 'implement-20261128-041200-list.md', summary: 'Added the list.' }] },
            ],
        });
        const style = document.createElement('style');
        style.textContent = readFileSync(path.resolve('media/tasks.css'), 'utf8');
        document.head.append(style);

        const sectionIds = [...document.querySelectorAll('.agent-output-content')].map((content) => content.id);
        expect(sectionIds.slice(-3)).toEqual(['agent-output-debug', 'agent-output-implement', 'agent-output-implement-summary']);
        const debugSection = document.querySelector('#agent-output-debug')!.closest('.agent-output-accordion')!;
        expect(debugSection.querySelector('.agent-output-header .agent-output-view')).toBeNull();
        expect(debugSection.querySelector('select')).toBeNull();
        const rows = [...debugSection.querySelectorAll<HTMLElement>('.agent-output-row')];
        expect(rows.map((row) => row.dataset.fileName)).toEqual(['debug-20261128-041200-crash.md', 'debug-report.md']);
        const summary = rows[0]!.querySelector<HTMLElement>('.agent-output-row-summary')!;
        expect(summary.title).toBe('Fixed the crash.\nLine two.\nLine three.\nLine four.');
        expect(dom.window.getComputedStyle(summary).getPropertyValue('-webkit-line-clamp')).toBe('3');
        expect(dom.window.getComputedStyle(summary).overflow).toBe('hidden');
        expect(rows[1]!.querySelector('.agent-output-row-summary')?.textContent).toBe('No summary available.');

        click('.agent-output-row[data-file-name="debug-report.md"] .agent-output-row-view');
        expect(postMessage).toHaveBeenLastCalledWith({ type: 'viewAgentOutput', taskId: task.id, fileName: 'debug-report.md' });
        click('#agent-output-implement-summary .agent-output-row-view');
        expect(postMessage).toHaveBeenLastCalledWith({ type: 'viewAgentOutput', taskId: task.id, fileName: 'implement-20261128-041200-list.md' });
    });

    it('disables the Debug and Implementation summaries accordions when they have no files', () => {
        for (const id of ['debug', 'implement-summary']) {
            const toggle = document.querySelector<HTMLButtonElement>(`[aria-controls="agent-output-${id}"]`)!;
            expect(toggle.disabled).toBe(true);
            expect(document.querySelectorAll(`#agent-output-${id} .agent-output-row`)).toHaveLength(0);
        }
    });

    it('uses the boolean for checkbox state and rollback', () => {
        const checkboxes = document.querySelectorAll<HTMLInputElement>('.implementation-todo-checkbox');
        expect([...checkboxes].map((checkbox) => checkbox.checked)).toEqual([false, true]);
        checkboxes[0]!.click();
        expect(postMessage).toHaveBeenLastCalledWith({ type: 'setTodoStatus', taskId: task.id, itemId: 'first-item', done: true });
        send({ type: 'todoStatusResult', taskId: task.id, itemId: 'first-item', done: true, error: 'Write failed' });
        expect(checkboxes[0]!.checked).toBe(false);
    });

    it('lists the selected task\'s related tasks and opens one on click', () => {
        const link = { taskId: 'api.json', taskName: 'Add orders API', repositoryName: 'Backend', repositoryPath: '/old/backend', repositoryUrl: 'https://github.com/org/backend' };
        expect(document.querySelector<HTMLElement>('#selected-task-related')!.hidden).toBe(true);
        send({ type: 'selectedTask', task: { ...task, relatedTasks: [link] } });
        expect(document.querySelector<HTMLElement>('#selected-task-related')!.hidden).toBe(false);
        const item = document.querySelector('.selected-task-related-item')!;
        expect(item.querySelector('.selected-task-related-link')!.textContent).toBe('Add orders API');
        expect(item.querySelector('.selected-task-related-repository')!.textContent).toBe('Backend');
        click('.selected-task-related-link');
        expect(postMessage).toHaveBeenLastCalledWith({ type: 'openRelatedTask', taskId: task.id, reference: link });
    });

    it('links a task created from a TODO back to its parent task', () => {
        send({ type: 'taskSettings', requireProjectManagementUrl: false, teamMembers: [] });
        send({
            type: 'taskList', tasks: [task], currentUser: 'me@example.com',
            currentRepository: { name: 'Frontend', path: '/repo', originUrl: 'https://github.com/org/frontend' },
        });
        click('.implementation-todo-item[data-todo-id="first-item"] .implementation-todo-create-task');
        expect(document.querySelector<HTMLInputElement>('.related-task-input')!.value).toBe('Task');
        click('#create-task-submit');
        expect(postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
            type: 'saveTask',
            input: expect.objectContaining({
                relatedTasks: [{
                    taskId: task.id, taskName: 'Task', repositoryName: 'Frontend',
                    repositoryPath: '/repo', repositoryUrl: 'https://github.com/org/frontend',
                }],
            }),
        }));
    });

    describe('related tasks field', () => {
        const backendTask = {
            taskId: 'api.json', taskName: 'Add orders API', repositoryName: 'Backend', repositoryPath: '/repos/backend',
            repositoryUrl: 'https://github.com/org/backend', status: 2 as const, isCurrentRepository: false,
        };
        const localTask = {
            taskId: 'task.json', taskName: 'Task', repositoryName: 'Frontend', repositoryPath: '/repos/frontend',
            repositoryUrl: '', status: 1 as const, isCurrentRepository: true,
        };
        const otherLocalTask = { ...localTask, taskId: 'orders.json', taskName: 'Show orders page', status: 0 as const };

        beforeEach(() => send({ type: 'taskSettings', requireProjectManagementUrl: false, teamMembers: [] }));

        function typeInRelatedTask(value: string, index = 0): HTMLInputElement {
            const input = document.querySelectorAll<HTMLInputElement>('.related-task-input')[index]!;
            input.focus();
            input.value = value;
            input.dispatchEvent(new dom.window.Event('input'));
            return input;
        }

        function optionTexts(): string[][] {
            return [...document.querySelectorAll('.related-task-options:not([hidden]) .related-task-option')].map((option) => [
                option.querySelector('.related-task-option-name')!.textContent!,
                option.querySelector('.related-task-option-repository')!.textContent!,
            ]);
        }

        it('loads candidates when the form opens and lists matches with their repository name', () => {
            send({ type: 'taskList', tasks: [task], currentUser: 'me@example.com <Me>' });
            click('#add-task-button');
            expect(postMessage).toHaveBeenCalledWith({ type: 'loadRelatedTaskCandidates' });
            click('#task-related-add');
            typeInRelatedTask('orders');
            expect(document.querySelector('.related-task-options-message')?.textContent).toBe('Loading tasks…');

            send({ type: 'relatedTaskCandidates', candidates: [localTask, otherLocalTask, backendTask] });
            expect(optionTexts()).toEqual([['Show orders page', 'Frontend'], ['Add orders API', 'Backend · Done']]);

            document.querySelectorAll<HTMLElement>('.related-task-option')[1]!.click();
            expect(document.querySelector<HTMLInputElement>('.related-task-input')!.value).toBe('Add orders API');
            expect(document.querySelector<HTMLElement>('.related-task-repository-tag')!.textContent).toBe('Backend');
            expect(document.querySelector<HTMLElement>('.related-task-options')!.hidden).toBe(true);

            document.querySelector<HTMLInputElement>('#task-name')!.value = 'New task';
            document.querySelector<HTMLTextAreaElement>('#task-description')!.value = 'Details';
            click('#create-task-submit');
            expect(postMessage).toHaveBeenLastCalledWith({
                type: 'saveTask',
                input: expect.objectContaining({
                    relatedTasks: [{
                        taskId: 'api.json', taskName: 'Add orders API', repositoryName: 'Backend',
                        repositoryPath: '/repos/backend', repositoryUrl: 'https://github.com/org/backend',
                    }],
                }),
            });
        });

        it('selects with the keyboard and hides the edited task and tasks chosen in other rows', () => {
            send({ type: 'openEditForm', task: { ...task, relatedTasks: [] } });
            send({ type: 'relatedTaskCandidates', candidates: [localTask, otherLocalTask, backendTask] });
            click('#task-related-add');
            const input = typeInRelatedTask('');
            expect(optionTexts().map(([name]) => name)).toEqual(['Show orders page', 'Add orders API']);
            input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowDown' }));
            input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter' }));
            expect(input.value).toBe('Show orders page');

            click('#task-related-add');
            typeInRelatedTask('', 1);
            expect(optionTexts().map(([name]) => name)).toEqual(['Add orders API']);
        });

        it('pre-fills existing links when editing and reports text that was not chosen from the list', () => {
            const link = { taskId: 'api.json', taskName: 'Old name', repositoryName: 'Backend', repositoryPath: '/repos/backend', repositoryUrl: 'https://github.com/org/backend' };
            send({ type: 'openEditForm', task: { ...task, assignee: 'me@example.com', relatedTasks: [link] } });
            const inputs = () => document.querySelectorAll<HTMLInputElement>('.related-task-input');
            expect(inputs()[0]!.value).toBe('Old name');
            send({ type: 'relatedTaskCandidates', candidates: [backendTask] });
            expect(inputs()[0]!.value).toBe('Add orders API');

            click('#task-related-add');
            typeInRelatedTask('something else', 1);
            postMessage.mockClear();
            click('#create-task-submit');
            expect(postMessage).not.toHaveBeenCalled();
            const error = document.querySelector<HTMLElement>('#task-related-error')!;
            expect(error.hidden).toBe(false);
            expect(error.textContent).toBe('Select each related task from the list.');

            click('.related-task-row:nth-child(2) .related-task-remove');
            click('#create-task-submit');
            expect(postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
                type: 'saveTask', taskId: 'task.json',
                input: expect.objectContaining({ relatedTasks: [expect.objectContaining({ taskId: 'api.json', taskName: 'Add orders API' })] }),
            }));
        });
    });
});
