# VS Code Workflow

Track tasks inside your Git repository and give Claude Code agents the context they need to plan, implement, review and document work on them.

## Features

- **Tasks view** in the activity bar: create, edit, search, time-track and complete tasks.
- **Tasks live in the repo** as JSON under `.history/tasks/`, so they travel with your code.
- **Seven agents**: Analyze and Plan, Implement, Debug, Logic Review, Code Readability, Document, Code Comments.
- **Shared TODO list** per task that agents and you both edit, with agent reports shown next to the task.
- Built for **Claude Code**.

## Requirements

- VS Code 1.105 or newer.
- A workspace inside a Git repository (`git` on your PATH, and an email set either in `vscode-workflow.user.email` or with `git config user.email`).
- Claude Code users: Node 20+ (the VS Code built-in Node is used by default).

## Getting started

1. Open a Git repository and click the **Tasks** icon in the activity bar.
2. Add a task, then start its timer to make it the active task.
3. Run `/vscode-workflow:…` in Claude Code.

Full guide: [User documentation](docs/user-documentation.md).

## Extension settings

| Setting | Default | Description |
| --- | --- | --- |
| `vscode-workflow.tasks.requireProjectManagementUrl` | `true` | Require a project management URL on tasks. An entered URL must still be a valid http(s) URL. |
| `vscode-workflow.user.email` | `""` | Your email for tasks (creator, default assignee, assignee filter, timer user). Falls back to `git config user.email`. |
| `vscode-workflow.user.name` | `""` | Your name for tasks. Falls back to `git config user.name`. |
| `vscode-workflow.teamMembers` | `[]` | Team members selectable as task assignee, as `[{ "email": "...", "name": "..." }]`. You are always selectable. |
| `vscode-workflow.claudeCode.registration` | `ask` | `ask`, `enabled` or `disabled`: whether the extension installs its Claude Code plugin. |

## Commands

- **Workflow: Register Agents and Skills with Claude Code**

## Contributing

See [Developer documentation](docs/developer-documentation.md).

## License

[MIT](LICENSE). Third-party notices: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
