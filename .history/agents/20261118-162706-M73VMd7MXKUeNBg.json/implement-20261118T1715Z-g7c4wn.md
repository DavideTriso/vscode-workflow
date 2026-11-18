# Implement: encrypt .history with git-crypt

## Summary

Added History encryption: status detection, enable and add-teammate actions, a Configuration accordion with a History encryption section, a status bar item, and the `install-git-crypt` skill. Type checks pass and 187 tests pass; 5 existing `claudePlugin.test.ts` tests fail because this machine has Node 18 and they need Node 20. Nothing was run against a real git-crypt.

## Full Record

### Request

Plan approved (D1 to D5 as recommended): Configuration accordion with History encryption sub-accordion, status bar badge that opens it, enable button, info and actions for the encrypted state, install guidance, and a guided `install-git-crypt` skill.

### Pattern used

`src/scm/` (one file imports `vscode`, logic files do not, `runProcess` for programs), the Quick Reference accordion for the markup and toggle, and `tasksWebview.test.ts` (esbuild bundle plus jsdom) for UI tests.

### Changes

- `src/crypt/`: `historyEncryptionTypes.ts` (webview-safe types), `historyEncryptionStatus.ts` (state, GPG and git-crypt parsing, status bar text), `historyEncryptionActions.ts` (enable, add teammate, export public key, renormalize), `historyEncryptionMessages.ts` (messages and guards), `historyEncryptionController.ts` (status bar, terminal for unlock and lock, confirmations), `installHint.ts`.
- `src/tasks/tasksViewProvider.ts`, `taskProtocol.ts`, `src/extension.ts`, `package.json`: wiring, command `vscode-workflow.openHistoryEncryption`, reveal and expand on status bar click.
- `src/tasks/tasksWebviewHtml.ts`, `src/ui/tasks/historyEncryptionView.ts`, `src/ui/tasks/main.ts`, `media/tasks.css`: Configuration accordion, History encryption section, locked notice above the task list, Quick Reference entry.
- `claude-plugin/skills/install-git-crypt/SKILL.md`: one-step-at-a-time guide.
- Docs: new `docs/history-encryption.md`; updates to `architecture.md`, `settings.md`, `skills-and-agents.md`, `user-documentation.md`.
- Tests: `historyEncryption.test.ts`, `historyEncryptionView.test.ts`, additions to `tasksWebviewHtml.test.ts` and `claudePluginContent.test.ts`.

### Checks run

- `tsc -p tsconfig.json --noEmit` and `tsc -p tsconfig.webview.json --noEmit`: no errors.
- `esbuild.mjs` build: succeeded.
- vitest (run with the VS Code server's Node 18 and a temporary ESM config, because `npx` and a newer Node are not on this machine): 187 passed, 5 failed. The 5 failures are all in `test/claudePlugin.test.ts` with "The Claude Code MCP server needs Node 20 or newer"; they do not touch this change.

### Remaining risks

- git-crypt is not installed here, so `init`, `add-gpg-user --no-commit`, `unlock`, `lock`, `status` output and `git add --renormalize` were tested only against a fake runner. Behavior with a dirty index, untrusted keys and real pinentry needs a manual run in a scratch repository.
- The Tasks list still swallows unreadable task files; a locked clone shows the locked notice and status bar warning rather than a typed error.
- Windows install guidance is deliberately generic.
- The TODO tools (`read_implementation_todos`, `manage_implementation_todos`) were not available in this session, so no `implementation-todo.json` was created.
- `package.json` and `package-lock.json` show a version change to 0.7.0 that I did not make.
