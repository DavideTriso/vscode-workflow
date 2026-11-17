# Commit messages

You can get a commit message for your changes in two ways. Both use Claude Code, both follow the same format, and neither commits for you.

| Way | Where | Use it to |
| --- | --- | --- |
| **Generate Commit Message** button | Source Control view, in the title bar of the repository (sparkle icon). VS Code has no stable menu for the commit box itself. Also the command **Workflow: Generate Commit Message**. | Fill the commit box with a message in a few seconds. |
| `/vscode-workflow:commit-message` skill | Claude Code | See the message in the chat, with a note about anything unclear. |

## What the message is based on

- The **staged changes**. When nothing is staged, the **unstaged changes** are used instead, and new files are taken from the Git status.
- The **active task**: its name, its description and every Markdown report in its folder under `.history/agents/` (plans, run records, reviews, debug and documentation records). This needs exactly one active task; with none, or with more than one, the message is based on the changes alone. `implementation-todo.json` is not read.

The changes decide what the message says. The task and its reports explain the intent and help choose the prefix. Because a task usually spans several commits, the message describes only the changes being committed.

Files under `.history/`, lock files (`*.lock`, `package-lock.json`, `pnpm-lock.yaml`) are left out of the changes. Binary files appear as one-line notes in the diff.

## Message format

```
New: Add commit message button
- Add the Source Control button and its settings
- Add the commit-message skill
```

1. The first line starts with one prefix, a colon, and a short summary of a few words, without a final period.
2. Detail lines are added only when they are really necessary. Each one starts with `- ` on its own line.

| Prefix | Meaning |
| --- | --- |
| `BC` | A new implementation that introduces a breaking change. |
| `New` | A new implementation without a breaking change. |
| `Ref` | A refactoring. |
| `Fix` | A bug fix. |
| `Doc` | A documentation-only change: Markdown documentation and/or code comments. |

When a change fits several prefixes, the first of `BC`, `New`, `Fix`, `Ref`, `Doc` wins. `Doc` is used only when no executable code, configuration or test changed. `BC` is used only for a concrete break, such as a removed or renamed public command, setting, API or file format. Review the message before you commit: the choice of prefix is a judgment, and Claude can miss a breaking change.

## The button

1. Make your changes, and stage the files you want in the commit.
2. Click the sparkle button in the title bar of the repository in the Source Control view (not inside the commit message box), or run **Workflow: Generate Commit Message** from the Command Palette. The button is shown for Git repositories. A notification shows progress and has a **Cancel** button; cancelling leaves the box unchanged. With several open repositories the button uses the repository it belongs to, and the command asks you to pick one.
3. The message appears in the box. Edit it if you want, then commit as usual.

If the box already has text, you are asked before it is replaced (choose **Replace**). If there is nothing to describe, you get a message instead of a request to Claude.

### Requirements

- The Claude Code CLI. The extension looks for it in this order: the `vscode-workflow.commitMessage.claudePath` setting, `claude` on your `PATH`, and the binary that ships with the Claude Code VS Code extension. If none works, the error offers to open the setting.
- You must be signed in to Claude Code.

The run is read-only: Claude gets no tools, no skills and no MCP servers, and project and local Claude settings are ignored. Your own user-level Claude settings still apply.

### Settings

See [Settings](settings.md) for `vscode-workflow.commitMessage.claudePath`, `.maxDiffChars` and `.model`. A diff longer than `maxDiffChars` is cut, and a summary of all changed files is added so Claude still sees them.

### Privacy

The diff, the Git status, and the task name, description and reports are sent to Claude. Reports are cut to 8,000 characters each and 24,000 in total. Do not use the button on changes that you may not send to Claude.

## The skill

`/vscode-workflow:commit-message` reads the same sources and follows the same rules, runs in your conversation, and shows the message in one block you can copy. It does not stage files or run `git commit`. It needs the plugin to be registered; see [Skills and agents](skills-and-agents.md).

## Troubleshooting

| Message | What to do |
| --- | --- |
| "Could not find the Claude Code CLI" | Install Claude Code, or set `vscode-workflow.commitMessage.claudePath`. |
| "The Claude executable ... does not exist or cannot be run" | The configured path is wrong. Fix it or clear it. |
| "There are no changes to describe" | Only files under `.history/` or lock files changed. |
| "Open a Git repository to generate a commit message." | Open a folder that is a Git repository and make sure the built-in Git extension is enabled. |
| "Claude returned an empty commit message." | Run it again. |
| "Claude Code could not generate the message" | The text after it comes from the CLI; for example, sign in to Claude Code. A run stops after two minutes. |
