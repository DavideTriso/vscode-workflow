# Implement: remove the Lock action

## Summary

Removed Lock from the History Encryption panel and the extension (button, message type, guard and terminal command). Unlock still shows only when the clone is locked. Typecheck, build and 190 tests pass; 5 claudePlugin tests fail only because this machine has Node 18.

## Full Record

### Request

Show only Unlock, and only when the clone is locked; remove the Lock button.

### Changes

- `src/ui/tasks/historyEncryptionView.ts`: removed the Lock button and its action. The unlocked Status section now shows the status line and, when needed, the Fix link.
- `src/crypt/historyEncryptionMessages.ts`: removed `lockHistory` from the request type and the guard.
- `src/crypt/historyEncryptionController.ts`: removed the `git-crypt lock` branch.
- Tests: `test/historyEncryptionView.test.ts` checks there is no Lock or Unlock button when unlocked; `test/historyEncryption.test.ts` checks the guard rejects `lockHistory`.
- Docs: `docs/history-encryption.md` explains that a fresh clone starts locked, that Unlock runs once per clone, and that `git-crypt lock` can be run by hand. Removed the lock troubleshooting lines here and in `claude-plugin/skills/install-git-crypt/SKILL.md`.

### Checks run

- `tsc` for both tsconfigs: no errors.
- `esbuild.mjs`: build succeeded.
- vitest (Node 18, temporary ESM config): 190 passed, 5 failed. All 5 failures are in `test/claudePlugin.test.ts` ("needs Node 20 or newer") and are unrelated.

### Remaining risks

- None specific to this change. The visual check from the previous run is still open.
