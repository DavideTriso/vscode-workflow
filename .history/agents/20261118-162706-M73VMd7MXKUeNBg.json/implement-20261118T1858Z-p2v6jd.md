# Implement: three-section History Encryption UI

## Summary

Split the History Encryption accordion into Status, Your key and Teammates sections separated by thin lines. Teammates use the task-list row style with + and reload in the section header, and the add form replaces the list; the file option is removed end to end. Typecheck, build and 190 tests pass; 5 claudePlugin tests fail only because this machine has Node 18.

## Full Record

### Request

Separate the UI into three sections: encryption status; the current user's info (a fingerprint row with a copy icon, a key row with copy and view icons); teammates in the task-list style (+ and reload at top right, rows with actions on the right). The add button replaces the list with a form that has only the input, Save and Cancel. Remove the file option.

### Pattern used

Open Tasks: header actions with `accordion-icon-button` and the same + and reload SVGs. Task rows: `.task-details`, `.task-name-line`, `.task-name` and `.task-date`, with icon actions on the right.

### Changes

- `src/ui/tasks/historyEncryptionView.ts`: renders up to three `.history-encryption-section` blocks.
  - Status: status line, Enable / Unlock / Lock, plus the Fix link for plain files.
  - Your key: key picker only with 2+ keys; Fingerprint row (grouped by four) with a copy icon; Public key row with copy and view icons.
  - Teammates: header "Teammates · N" with + (unlocked only) and reload; one row per authorized key with a "you" pill and a copy-fingerprint icon. + replaces the list with a textarea, Cancel and Save.
  - Sections per state: not-installed shows Status only; Off shows Status and Your key; Locked and On show all three (teammates are read-only when locked).
- `src/crypt/historyEncryptionMessages.ts`, `src/crypt/historyEncryptionController.ts`: removed `addTeammateKeyFromFile` and the file dialog code.
- `media/tasks.css`: section separators, section headers, task-style rows, end-aligned form buttons.
- Tests: `test/historyEncryptionView.test.ts` rewritten (12 tests); `test/historyEncryption.test.ts` checks that the removed message is rejected.
- Docs: `docs/history-encryption.md`, `claude-plugin/skills/install-git-crypt/SKILL.md`.

### Checks run

- `tsc` for both tsconfigs: no errors.
- `esbuild.mjs`: build succeeded.
- vitest (Node 18, temporary ESM config): 190 passed, 5 failed. All 5 failures are in `test/claudePlugin.test.ts` ("needs Node 20 or newer") and are unrelated.

### Remaining risks

- jsdom does not render CSS; please check the layout in VS Code in a light and a dark theme.
- The accordion header refresh button stays, so the state can be checked again when the Teammates section is hidden (for example after installing git-crypt).
