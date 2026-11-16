import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';

export function getTasksWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
    const nonce = randomBytes(16).toString('base64');
    const stylesheetUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'tasks.css'));
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'tasksView.js'));

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
    <link rel="stylesheet" href="${stylesheetUri}">
    <title>Tasks</title>
</head>
<body>
    <main id="tasks-view">
        <p id="repository-message" role="status" hidden>Open a Git repository to start working.</p>
        <section id="selected-task-panel" aria-labelledby="selected-task-name" hidden>
            <header id="selected-task-header">
                <h2 id="selected-task-name"></h2>
                <div id="selected-task-actions">
                    <button id="time-tracking-toggle" class="task-action time-tracking-toggle" type="button"></button>
                    <button id="task-status-toggle" class="task-action task-status-toggle" type="button"></button>
                </div>
            </header>
            <p id="task-action-error" role="alert" hidden></p>
            <p id="selected-task-description" class="is-collapsed"></p>
            <button id="description-toggle" type="button" aria-expanded="false" hidden>Show more</button>
            <section id="selected-task-related" aria-labelledby="selected-task-related-heading" hidden>
                <h3 id="selected-task-related-heading">Related tasks</h3>
                <ul id="selected-task-related-list"></ul>
            </section>
            <div id="agent-outputs" aria-label="Agent output"></div>
            <p id="agent-output-error" role="alert" hidden></p>
        </section>
        <section id="task-panel" aria-label="Open tasks" hidden>
            <section id="create-task-panel" aria-labelledby="create-task-heading" hidden>
                <h2 id="create-task-heading">New task</h2>
                <form id="create-task-form" novalidate>
                    <div class="form-field">
                        <label for="task-name">Name <span aria-hidden="true">*</span></label>
                        <input id="task-name" name="name" type="text" autocomplete="off" required aria-describedby="task-name-error">
                        <p id="task-name-error" class="field-error" role="alert" hidden></p>
                    </div>
                    <div class="form-field">
                        <label for="task-url">Project management URL <span id="task-url-required" aria-hidden="true">*</span></label>
                        <input id="task-url" name="projectManagementUrl" type="url" autocomplete="url" required aria-describedby="task-url-error">
                        <p id="task-url-error" class="field-error" role="alert" hidden></p>
                    </div>
                    <div class="form-field">
                        <label for="task-assignee">Assignee <span aria-hidden="true">*</span></label>
                        <select id="task-assignee" name="assignee" required aria-describedby="task-assignee-error"></select>
                        <p id="task-assignee-error" class="field-error" role="alert" hidden></p>
                    </div>
                    <div class="form-field">
                        <label for="task-description">Description <span aria-hidden="true">*</span></label>
                        <textarea id="task-description" name="description" rows="4" required aria-describedby="task-description-error"></textarea>
                        <p id="task-description-error" class="field-error" role="alert" hidden></p>
                    </div>
                    <div class="form-field related-tasks-field">
                        <span id="task-related-label" class="form-field-label">Related tasks</span>
                        <ul id="task-related-list" class="related-task-list" aria-labelledby="task-related-label"></ul>
                        <button id="task-related-add" class="related-task-add" type="button" aria-describedby="task-related-error">
                            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg>
                            <span>Add related task</span>
                        </button>
                        <p id="task-related-status" class="related-task-status" role="status" hidden></p>
                        <p id="task-related-error" class="field-error" role="alert" hidden></p>
                    </div>
                    <p id="create-task-error" role="alert" hidden></p>
                    <div class="form-actions">
                        <button id="cancel-create-task" class="secondary-button" type="button">Cancel</button>
                        <button id="create-task-submit" class="primary-button" type="submit">Save</button>
                    </div>
                </form>
            </section>
            <section id="task-list-panel" aria-label="Open tasks">
                <header class="tasks-accordion-header">
                    <button id="tasks-accordion-toggle" type="button" aria-expanded="true">
                        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M7.976 10.072l4.357-4.357.62.618L8.284 11h-.618L3 6.333l.619-.618 4.357 4.357z"/></svg>
                        <span>Open Tasks</span>
                    </button>
                    <div class="accordion-actions">
                        <button id="add-task-button" class="accordion-icon-button" type="button" title="Add task" aria-label="Add task">
                            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg>
                        </button>
                        <button id="reload-tasks-button" class="accordion-icon-button" type="button" title="Reload tasks" aria-label="Reload tasks">
                            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13 5V2m0 3h-3M13 5a5.5 5.5 0 1 0 1 4"/></svg>
                        </button>
                    </div>
                </header>
                <div id="tasks-accordion-content">
                    <div class="task-search-row">
                        <label class="visually-hidden" for="task-search">Search tasks by name</label>
                        <input id="task-search" type="search" placeholder="Search tasks" autocomplete="off">
                        <button id="creator-filter-toggle" class="creator-filter-toggle is-active" type="button"
                            title="Filter to tasks assigned to you" aria-label="Filter to tasks assigned to you" aria-pressed="true">
                            <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="5" r="2.5"/><path d="M3 14c.3-2.4 2.2-4 5-4s4.7 1.6 5 4"/></svg>
                        </button>
                    </div>
                    <ul id="task-list" aria-live="polite"></ul>
                    <p id="empty-message" role="status" hidden></p>
                </div>
            </section>
            <section id="quick-reference-panel" aria-label="Agent quick reference">
                <header class="tasks-accordion-header">
                    <button id="quick-reference-toggle" class="tasks-accordion-toggle" type="button" aria-expanded="false" aria-controls="quick-reference-content">
                        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M7.976 10.072l4.357-4.357.62.618L8.284 11h-.618L3 6.333l.619-.618 4.357 4.357z"/></svg>
                        <span>Quick Reference</span>
                    </button>
                </header>
                <div id="quick-reference-content" hidden>
                    <ol class="quick-reference-steps">
                        <li>Run <strong>Workflow: Register Agents and Skills with Claude Code</strong> from the Command Palette, then <code>/reload-plugins</code> in Claude Code. Check with <code>/mcp</code> that <code>plugin:vscode-workflow:todos</code> is connected.</li>
                        <li>Start a skill by typing its <code>/vscode-workflow:…</code> command in Claude Code. The review, documentation and comment skills start their subagent for you.</li>
                        <li>Start a subagent by asking for it by name, for example "use the vscode-workflow:logic-review subagent on my changes".</li>
                    </ol>
                    <section class="quick-reference-agent">
                        <h3>Analyze and Plan</h3>
                        <p>Skill: <code>/vscode-workflow:analyze-and-plan</code>. Clarifies requirements, compares approaches, and saves the selected implementation plan and initial TODOs without changing code.</p>
                    </section>
                    <section class="quick-reference-agent">
                        <h3>Implement</h3>
                        <p>Skill: <code>/vscode-workflow:implement</code>. Implements the selected work, maintains the task TODOs, and runs functional and end-to-end checks.</p>
                    </section>
                    <section class="quick-reference-agent">
                        <h3>Logic Review</h3>
                        <p>Subagent: <code>vscode-workflow:logic-review</code>. Investigates changed behavior and reports only confirmed bugs or regressions.</p>
                        <p class="quick-reference-skills">Skills: <code>/vscode-workflow:logic-review-default</code> starts the subagent and saves its report in the task.</p>
                    </section>
                    <section class="quick-reference-agent">
                        <h3>Code Readability</h3>
                        <p>Subagent: <code>vscode-workflow:code-readability</code>. Reviews clarity and maintainability and proposes focused improvements before editing.</p>
                        <p class="quick-reference-skills">Skills: <code>/vscode-workflow:code-readability-default</code> starts the subagent, saves its report in the task, then asks which proposals to apply.</p>
                    </section>
                    <section class="quick-reference-agent">
                        <h3>Document</h3>
                        <p>Subagent: <code>vscode-workflow:document</code>. Updates repository documentation to reflect verified code and workflow changes.</p>
                        <p class="quick-reference-skills">Skills: <code>/vscode-workflow:documentation-update-default</code> starts the subagent and saves its record in the task. <code>/vscode-workflow:documentation-create-default</code> initializes a repository's README and <code>docs/</code> after you approve a proposed table of contents.</p>
                    </section>
                    <section class="quick-reference-agent">
                        <h3>Code Comments</h3>
                        <p>Subagent: <code>vscode-workflow:code-comments</code>. Reviews comments or applies comment-only improvements; it does not change executable code.</p>
                        <p class="quick-reference-skills">Skills: <code>/vscode-workflow:code-comment-review</code> starts the subagent and reports findings without edits. <code>/vscode-workflow:code-comment-improve</code> starts it to apply safe comment-only changes. Neither saves a report.</p>
                    </section>
                    <section class="quick-reference-agent">
                        <h3>Debug</h3>
                        <p>Skill: <code>/vscode-workflow:debug</code>. Reproduces a bug, investigates its root cause, applies a minimal fix when requested, and verifies it.</p>
                    </section>
                </div>
            </section>
        </section>
    </main>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}