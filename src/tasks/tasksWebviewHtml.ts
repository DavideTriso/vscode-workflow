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
                        <label for="task-url">Project management URL <span aria-hidden="true">*</span></label>
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
                        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>
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
        </section>
    </main>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}