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

    it('uses icon-only view/add/edit/remove actions and no Move button', () => {
        for (const selector of ['.agent-output-view', '.agent-output-add', '.implementation-todo-view', '.implementation-todo-edit', '.implementation-todo-remove']) {
            const button = document.querySelector<HTMLButtonElement>(selector)!;
            expect(button.textContent?.trim()).toBe('');
            expect(button.querySelector('svg')).not.toBeNull();
            expect(button.title).not.toBe('');
            expect(button.getAttribute('aria-label')).not.toBeNull();
        }
        expect(document.querySelector('.implementation-todo-drag-handle')).toBeNull();
        expect(document.querySelector('.implementation-todo-actions')?.children).toHaveLength(3);
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

    it('uses the boolean for checkbox state and rollback', () => {
        const checkboxes = document.querySelectorAll<HTMLInputElement>('.implementation-todo-checkbox');
        expect([...checkboxes].map((checkbox) => checkbox.checked)).toEqual([false, true]);
        checkboxes[0]!.click();
        expect(postMessage).toHaveBeenLastCalledWith({ type: 'setTodoStatus', taskId: task.id, itemId: 'first-item', done: true });
        send({ type: 'todoStatusResult', taskId: task.id, itemId: 'first-item', done: true, error: 'Write failed' });
        expect(checkboxes[0]!.checked).toBe(false);
    });
});