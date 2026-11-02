# VS Code Workflow

Track tasks inside your Git repository and give AI agents (GitHub Copilot and Claude Code) the context they need to plan, implement, review and document work on them.

## Features

- **Tasks view** in the activity bar: create, edit, search, time-track and complete tasks.
- **Tasks live in the repo** as JSON under `.history/tasks/`, so they travel with your code.
- **Seven agents**: Analyze and Plan, Implement, Debug, Logic Review, Code Readability, Document, Code Comments.
- **Shared TODO list** per task that agents and you both edit, with agent reports shown next to the task.
- Works with **GitHub Copilot Chat** and **Claude Code**.

## Requirements

- VS Code 1.105 or newer.
- A workspace inside a Git repository (`git` on your PATH, `user.email` configured).
- Claude Code users: Node 20+ (the VS Code built-in Node is used by default).

## Getting started

1. Open a Git repository and click the **Tasks** icon in the activity bar.
2. Add a task, then start its timer to make it the active task.
3. Pick an agent in Copilot Chat, or run `/vscode-workflow:…` in Claude Code.

Full guide: [User documentation](docs/user-documentation.md).

## Extension settings

| Setting | Default | Description |
| --- | --- | --- |
| `vscode-workflow.tasks.requireProjectManagementUrl` | `true` | Require a project management URL on tasks. An entered URL must still be a valid http(s) URL. |
| `vscode-workflow.claudeCode.registration` | `ask` | `ask`, `enabled` or `disabled`: whether the extension installs its Claude Code plugin. |

## Commands

- **Workflow: Register Agents and Skills with Claude Code**

## Contributing

See [Developer documentation](docs/developer-documentation.md).

## License

[MIT](LICENSE). Third-party notices: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
