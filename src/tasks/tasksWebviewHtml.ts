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
                        <label for="task-description">Description <span aria-hidden="true">*</span></label>
                        <textarea id="task-description" name="description" rows="4" required aria-describedby="task-description-error"></textarea>
                        <p id="task-description-error" class="field-error" role="alert" hidden></p>
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
                            title="Filter to tasks created by you" aria-label="Filter to tasks created by you" aria-pressed="true">
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
                    <details class="quick-reference-tool">
                        <summary><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M7.976 10.072l4.357-4.357.62.618L8.284 11h-.618L3 6.333l.619-.618 4.357 4.357z"/></svg><span>GitHub Copilot</span></summary>
                        <ol>
                            <li>Open Copilot Chat and pick the agent from the agent picker: <code>Analyze and Plan</code>, <code>Implement</code>, <code>Debug</code>, <code>Logic Review</code>, <code>Code Readability</code>, <code>Document</code> or <code>Code Comments</code>.</li>
                            <li>Select the task in the list above so the agent works in its task folder.</li>
                            <li>Describe the work. Agents load their skills (for example <code>logic-review-default</code>) on their own.</li>
                        </ol>
                        <section class="quick-reference-agent">
                            <h3>Analyze and Plan</h3>
                            <p>Use to clarify requirements, compare approaches, and save the selected implementation plan and initial TODOs without changing code.</p>
                        </section>
                        <section class="quick-reference-agent">
                            <h3>Implement</h3>
                            <p>Use to implement the selected work, maintain the task TODOs, and run functional and end-to-end checks.</p>
                        </section>
                        <section class="quick-reference-agent">
                            <h3>Logic Review</h3>
                            <p>Use to investigate changed behavior and report only confirmed bugs or regressions.</p>
                            <p class="quick-reference-skills">Skills: <code>logic-review-default</code> validates findings before reporting.</p>
                        </section>
                        <section class="quick-reference-agent">
                            <h3>Code Readability</h3>
                            <p>Use to review clarity and maintainability and propose focused improvements before editing.</p>
                            <p class="quick-reference-skills">Skills: <code>code-readability-default</code> guides the review.</p>
                        </section>
                        <section class="quick-reference-agent">
                            <h3>Document</h3>
                            <p>Use to update repository documentation to reflect verified code and workflow changes.</p>
                            <p class="quick-reference-skills">Skills: <code>documentation-update-default</code> guides documentation updates.</p>
                        </section>
                        <section class="quick-reference-agent">
                            <h3>Code Comments</h3>
                            <p>Use for comment review or comment-only improvements; it does not change executable code.</p>
                            <p class="quick-reference-skills">Skills: <code>code-comment-review</code> reports findings without edits. <code>code-comment-improve</code> applies safe comment-only changes.</p>
                        </section>
                        <section class="quick-reference-agent">
                            <h3>Debug</h3>
                            <p>Use to reproduce a bug, investigate its root cause, apply a minimal fix when requested, and verify it.</p>
                        </section>
                    </details>
                    <details class="quick-reference-tool">
                        <summary><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M7.976 10.072l4.357-4.357.62.618L8.284 11h-.618L3 6.333l.619-.618 4.357 4.357z"/></svg><span>Claude Code</span></summary>
                        <ol>
                            <li>Run <strong>Workflow: Register Agents and Skills with Claude Code</strong> from the Command Palette, then <code>/reload-plugins</code> in Claude Code. Check with <code>/mcp</code> that <code>plugin:vscode-workflow:todos</code> is connected.</li>
                            <li>Start a skill by typing its <code>/vscode-workflow:…</code> command in Claude Code.</li>
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
                            <p class="quick-reference-skills">Skills: <code>/vscode-workflow:logic-review-default</code> validates findings before reporting.</p>
                        </section>
                        <section class="quick-reference-agent">
                            <h3>Code Readability</h3>
                            <p>Subagent: <code>vscode-workflow:code-readability</code>. Reviews clarity and maintainability and proposes focused improvements before editing.</p>
                            <p class="quick-reference-skills">Skills: <code>/vscode-workflow:code-readability-default</code> guides the review.</p>
                        </section>
                        <section class="quick-reference-agent">
                            <h3>Document</h3>
                            <p>Subagent: <code>vscode-workflow:document</code>. Updates repository documentation to reflect verified code and workflow changes.</p>
                            <p class="quick-reference-skills">Skills: <code>/vscode-workflow:documentation-update-default</code> guides documentation updates.</p>
                        </section>
                        <section class="quick-reference-agent">
                            <h3>Code Comments</h3>
                            <p>Subagent: <code>vscode-workflow:code-comments</code>. Reviews comments or applies comment-only improvements; it does not change executable code.</p>
                            <p class="quick-reference-skills">Skills: <code>/vscode-workflow:code-comment-review</code> reports findings without edits. <code>/vscode-workflow:code-comment-improve</code> applies safe comment-only changes.</p>
                        </section>
                        <section class="quick-reference-agent">
                            <h3>Debug</h3>
                            <p>Skill: <code>/vscode-workflow:debug</code>. Reproduces a bug, investigates its root cause, applies a minimal fix when requested, and verifies it.</p>
                        </section>
                    </details>
                </div>
            </section>
        </section>
    </main>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}