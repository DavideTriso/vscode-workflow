# Installation and setup

## Requirements

- VS Code 1.105 or newer.
- A workspace inside a Git repository, with `git` on your `PATH`.
- An email address: set `vscode-workflow.user.email`, or `git config user.email`. Tasks cannot be created without one.
- For Claude Code: Node 20+. The Node bundled with VS Code is used by default.

## Set your identity

Set `vscode-workflow.user.email` and `vscode-workflow.user.name`, or leave them empty to use `git config user.email` and `git config user.name`. To assign tasks to others, list them in `vscode-workflow.teamMembers`. See [Settings](settings.md).

## Register with Claude Code

1. Run **Workflow: Register Agents and Skills with Claude Code** from the Command Palette. If `~/.claude` exists, the extension also offers to register once with a prompt.
2. In Claude Code, run `/reload-plugins`.
3. Run `/mcp` and check that `plugin:vscode-workflow:todos` is connected.

The extension adds a local plugin to `~/.claude/settings.json` (or `$CLAUDE_CONFIG_DIR`) and keeps it updated when the extension or the Node path changes. Set `vscode-workflow.claudeCode.registration` to `disabled` to never touch Claude Code settings.

## Uninstall

Uninstalling the extension removes its entries from the Claude Code settings. Task files in `.history/` stay in your repositories.

Next: [Working with tasks](tasks.md).
