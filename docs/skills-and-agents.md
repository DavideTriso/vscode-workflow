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

- `/vscode-workflow:analyze-and-plan`, `/vscode-workflow:implement` and `/vscode-workflow:debug` run in your conversation. Type them as slash commands.
- Logic Review, Code Readability, Document and Code Comments are subagents, and each has slash commands that always start it: `/vscode-workflow:logic-review-default`, `/vscode-workflow:code-readability-default`, `/vscode-workflow:documentation-update-default`, `/vscode-workflow:code-comment-review` and `/vscode-workflow:code-comment-improve`. The command starts the subagent for you, so its report is always saved in the task (except for Code Comments, see below). You can also ask for a subagent by name, for example "use the vscode-workflow:logic-review subagent".
- Each of these commands needs an active task, because the subagent finds the task through the active-task marker. Without one, it stops and asks you to start a timer.
- After Code Readability returns, the command asks which proposals to apply and applies only those.
- If the Document subagent needs a table of contents or an answer from you, it saves a record with `Status: Awaiting Confirmation` and changes nothing. The command shows you the question and runs the subagent again with your answer.
- Code Comments does not save a report. The command shows its findings or the list of changed comments in the chat.
- Agent reports and TODOs appear in the Tasks view when you select the task.

## AGENTS.md

`AGENTS.md` at the repository root holds the lasting rules for agents: build and test commands, architecture, conventions, and rules the team agreed on.

- Run `/vscode-workflow:agents-md` to create or update it. It does not need an active task. It looks through the repository, proposes the content (or a numbered list of changes to an existing file), and writes only after you approve. It keeps every existing rule unless you approve a change. It then offers to add `@AGENTS.md` to `CLAUDE.md`, so Claude Code loads the rules in every session, not only in these skills.
- Analyze and Plan, Implement and Debug read `AGENTS.md` and follow its rules. When a rule conflicts with your request, they name the rule and ask. Logic Review and Code Readability also read it; Code Readability reports a rule violation as an objective problem. Nested `AGENTS.md` files in the directories of changed files also apply, and the nearest one wins.
- When `AGENTS.md` exists, Analyze and Plan, Implement and Debug look for general rules in your messages, such as "`Utility` holds only methods that are portable to other projects". At the end of the run they ask once whether to add them, and they write only the rules you approve. Without `AGENTS.md` they skip this.
- The layout and the rule criteria are in `claude-plugin/skills/agents-md/agents-md-rules.md`. The other skills read that one file.

## Propose a commit message

Run `/vscode-workflow:commit-message` to get a commit message for your current changes. It reads the diff, the active task's name and description, and the task's report files, and it never stages or commits. The message format and the matching Source Control button are described in [Commit messages](commit-messages.md).

## Install git-crypt

Run `/vscode-workflow:install-git-crypt` to install git-crypt and GPG, create a GPG key, enable `.history` encryption and share access with teammates. It checks your operating system and the versions of git, gpg and git-crypt first, then gives one step per message and waits for your reply. It runs only read-only checks itself and never asks for a passphrase or private key. See [History encryption](history-encryption.md).

## Set up documentation for a repository

Run `/vscode-workflow:documentation-create-default` to create documentation for a repository that has none, or to bring existing documentation into the standard layout. It does not need an active task. It proposes a table of contents and waits for your approval before writing.

The layout is a short `README.md` (description, `## Documentation` with links to the developer and, when the software has users, user documentation, and `## License` when there is a license file) plus a flat `docs/` directory with `developer-documentation.md` and `user-documentation.md` as index pages. The Document agent follows the same layout. When a change needs many new pages, or it is unclear whether user documentation is needed, it stops and returns a proposal for you to confirm instead of writing.
