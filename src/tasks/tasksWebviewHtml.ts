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
                        <button id="create-task-submit" class="primary-button" type="submit">Create task</button>
                    </div>
                </form>
            </section>
            <section id="task-list-panel" aria-label="Open tasks">
                <label class="visually-hidden" for="task-search">Search tasks by name</label>
                <input id="task-search" type="search" placeholder="Search tasks" autocomplete="off">
                <ul id="task-list" aria-live="polite"></ul>
                <p id="empty-message" role="status" hidden></p>
            </section>
        </section>
    </main>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}