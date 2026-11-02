import { describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import { getTasksWebviewHtml } from '../src/tasks/tasksWebviewHtml';

vi.mock('vscode', () => ({
    Uri: { joinPath: (_base: unknown, ...parts: string[]) => parts.join('/') },
}));

describe('task webview quick reference', () => {
    it('appears after the task list and documents all agents and their skills', () => {
        const html = getTasksWebviewHtml({
            asWebviewUri: (uri) => uri as unknown as vscode.Uri,
            cspSource: 'vscode-webview:',
        } as vscode.Webview, {} as vscode.Uri);

        expect(html.indexOf('id="task-list-panel"')).toBeLessThan(html.indexOf('id="quick-reference-panel"'));
        expect(html).toContain('id="quick-reference-toggle" class="tasks-accordion-toggle" type="button" aria-expanded="false"');
        for (const agent of ['Analyze and Plan', 'Implement', 'Logic Review', 'Code Readability', 'Document', 'Code Comments', 'Debug']) {
            expect(html).toContain(`<h3>${agent}</h3>`);
        }
        for (const skill of ['logic-review-default', 'code-readability-default', 'documentation-update-default', 'code-comment-review', 'code-comment-improve']) {
            expect(html).toContain(`<code>${skill}</code>`);
        }
    });

    it('documents how to start each agent in GitHub Copilot and Claude Code', () => {
        const html = getTasksWebviewHtml({
            asWebviewUri: (uri) => uri as unknown as vscode.Uri,
            cspSource: 'vscode-webview:',
        } as vscode.Webview, {} as vscode.Uri);

        expect(html).toContain('<span>GitHub Copilot</span></summary>');
        expect(html).toContain('<span>Claude Code</span></summary>');
        for (const name of ['analyze-and-plan', 'implement', 'debug']) {
            expect(html).toContain(`/vscode-workflow:${name}`);
        }
        for (const name of ['logic-review', 'code-readability', 'document', 'code-comments']) {
            expect(html).toContain(`vscode-workflow:${name}`);
        }
    });
});
