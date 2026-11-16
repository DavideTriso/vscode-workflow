# Skills and agents

The extension registers seven agents and a documentation skill with Claude Code. Run them with a task active (see [Working with tasks](tasks.md#start-and-stop-the-timer)). For best results, use them in this order:

| Agent | Use it to | Output in `.history/agents/<task id>/` |
| --- | --- | --- |
| Analyze and Plan | Agree on an approach; saves a plan and TODOs. Makes no code changes. | `implementation-plan.md` |
| Implement | Build the planned change and tick off TODOs. | `implementation-todo.json` |
| Debug | Reproduce and fix a bug. | `debug-report.md` |
| Logic Review | Find confirmed bugs in the change. | `logic-review.md` |
| Code Readability | Get clarity proposals. | `readability-review.md` |
| Document | Update the documentation. | `documentation-update.md` |
| Code Comments | Review or improve code comments. | |

## How to run them

- `/vscode-workflow:analyze-and-plan`, `/vscode-workflow:implement` and `/vscode-workflow:debug` are skills. Type them as slash commands.
- Logic Review, Code Readability, Document and Code Comments are subagents. Ask for them by name, for example "use the vscode-workflow:logic-review subagent". Matching slash commands also exist, such as `/vscode-workflow:logic-review-default`, `/vscode-workflow:code-readability-default`, `/vscode-workflow:code-comment-review` and `/vscode-workflow:code-comment-improve`.
- Agent reports and TODOs appear in the Tasks view when you select the task.

## Set up documentation for a repository

Run `/vscode-workflow:documentation-create-default` to create documentation for a repository that has none, or to bring existing documentation into the standard layout. It does not need an active task. It proposes a table of contents and waits for your approval before writing.

The layout is a short `README.md` (description, `## Documentation` with links to the developer and, when the software has users, user documentation, and `## License` when there is a license file) plus a flat `docs/` directory with `developer-documentation.md` and `user-documentation.md` as index pages. The Document agent follows the same layout. When a change needs many new pages, or it is unclear whether user documentation is needed, it stops and returns a proposal for you to confirm instead of writing.
