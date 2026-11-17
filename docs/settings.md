# Settings

Set these in VS Code settings under **Workflow**, or in `settings.json`. "Mandatory" means the extension cannot do its job without a value; none of the settings must be set in `settings.json` itself.

| Setting | Description | Mandatory | Default | Example |
| --- | --- | --- | --- | --- |
| `vscode-workflow.user.email` | Your email, used as task creator, default assignee, assignee filter and timer user. Falls back to `git config user.email`. | No, if Git has an email. An email from either source is required to create tasks. | `""` | `"jane@example.com"` |
| `vscode-workflow.user.name` | Your name in tasks. Falls back to `git config user.name`. | No | `""` | `"Jane Doe"` |
| `vscode-workflow.teamMembers` | People selectable as task assignee. You are always selectable. | No | `[]` | `[{ "email": "joe@example.com", "name": "Joe Smith" }]` |
| `vscode-workflow.tasks.requireProjectManagementUrl` | Require a project management URL on tasks. An entered URL must still be a valid http(s) URL. | No | `true` | `false` |
| `vscode-workflow.repositoryGroups` | Groups of related repositories whose tasks can be linked. See [Multi-repository projects](multi-repository.md). | No | `[]` | see below |
| `vscode-workflow.relatedTasks.maxAgeDays` | Maximum age in days of tasks offered as related tasks. `0` means no limit. Existing links are kept. | No | `90` | `30` |
| `vscode-workflow.commitMessage.claudePath` | Full path of the `claude` executable that generates commit messages. When empty, the extension uses `claude` from `PATH`, then the binary bundled with the Claude Code extension. A path that does not work is an error; there is no fallback. | No | `""` | `"/usr/local/bin/claude"` |
| `vscode-workflow.commitMessage.maxDiffChars` | Maximum number of diff characters sent to Claude. A longer diff is cut and a diff summary is added. Values below `1000` are ignored. | No | `60000` | `100000` |
| `vscode-workflow.commitMessage.model` | Model that generates commit messages, for example `sonnet`. When empty, the Claude Code default is used. | No | `""` | `"sonnet"` |
| `vscode-workflow.claudeCode.registration` | Whether the extension installs its Claude Code plugin: `ask` (prompt once), `enabled` (keep installed and updated) or `disabled` (never touch Claude Code settings). | No | `"ask"` | `"enabled"` |

## Team member object

| Field | Description | Mandatory | Example |
| --- | --- | --- | --- |
| `email` | Team member email. | Yes | `"joe@example.com"` |
| `name` | Team member name. | Yes | `"Joe Smith"` |

## Repository group object

| Field | Description | Mandatory | Example |
| --- | --- | --- | --- |
| `group` | Group name. | Yes | `"Shop"` |
| `repositories` | Repositories in the group. | Yes | see below |
| `repositories[].path` | Absolute path of the local repository. | Yes | `"/home/me/shop-api"` |
| `repositories[].name` | Name shown next to the repository's tasks. | Yes | `"Backend"` |
| `repositories[].originUrl` | Upstream origin URL; matched before the path. | No | `"https://github.com/org/shop-api"` |
| `repositories[].description` | What the repository contains; given to agents as context. | No | `"REST API"` |

```json
"vscode-workflow.repositoryGroups": [{
  "group": "Shop",
  "repositories": [
    { "path": "/home/me/shop-api", "name": "Backend", "originUrl": "https://github.com/org/shop-api", "description": "REST API" },
    { "path": "/home/me/shop-web", "name": "Frontend" }
  ]
}]
```

## Commands

| Command | Description |
| --- | --- |
| **Workflow: Register Agents and Skills with Claude Code** | Installs or updates the Claude Code plugin and sets `vscode-workflow.claudeCode.registration` to `enabled`. |
| **Workflow: Generate Commit Message** | Fills the Source Control commit message box. Also available as the sparkle button in the title bar of the repository in the Source Control view. See [Commit messages](commit-messages.md). |
