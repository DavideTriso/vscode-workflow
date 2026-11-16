# Implementation run: no documentation report after debug test

## Summary

No code change. The plugin that Claude Code loads is still the old 0.4.1 copy, written by the installed extension `davidetriso.vscode-extension-starter`. The debug extension (`vscode-workflow`) has not synced its own plugin, so the new launcher skills never ran.

## Full Record

### User request

I tested the extension in debug and still no documentation report appears.

### Findings

- `~/.claude/settings.json` points the marketplace at `.../globalStorage/davidetriso.vscode-extension-starter/claude-marketplace`.
- That copy has `plugin.json` version 0.4.1, written 2026-11-16 19:53. Its `agents/document.md` still lists the `Skill` tool, and its `documentation-update-default` skill is the old inline version. It differs from `claude-plugin/` in the repo for all four agents and five skills.
- The last commit renamed the package from `vscode-extension-starter` to `vscode-workflow`. The globalStorage folder follows the extension id, so the debug host would write to `davidetriso.vscode-workflow`. That folder does not exist, so the debug host has not synced.
- An older extension `davidetriso.vscode-extension-starter-0.4.1` is still installed under `~/.vscode-server/extensions/`. Its bundled plugin files are identical to the installed copy.
- `src/claude/claudeRegistration.ts` syncs on activation only when `vscode-workflow.claudeCode.registration` is `enabled`; in `ask` mode it only shows a prompt. I did not confirm which mode applied in the debug host.
- Repo source is correct: `agents/document.md` has no `Skill` tool and the skill launches `vscode-workflow:document`.

### Files changed

None.

### Checks run

Compared `claude-plugin/` with the installed copy (`diff -rq`), read `~/.claude/settings.json`, the installed extension's `package.json`, and `claudeRegistration.ts`. No tests run; nothing changed.

### Remaining risks

- Until the debug host registers, Claude Code keeps loading the old plugin. Fix: in the debug window run the command "Register Claude Code" (`vscode-workflow.registerClaudeCode`), then `/reload-plugins`, then check `plugin.json` shows 0.5.0.
- The old `vscode-extension-starter` extension may overwrite the marketplace path again if it activates. Uninstall it.
