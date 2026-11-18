# Implement: declutter the History Encryption UI

## Summary

Removed the Configuration accordion and made History Encryption a top-level accordion with a much shorter layout: one status line, one main action and compact secondary actions per state. Typecheck, build and 189 tests pass; 5 existing claudePlugin tests fail only because this machine has Node 18.

## Full Record

### Request

The History Encryption section works but has too much text. Improve the UI and remove the nested Configuration accordion so History Encryption is a top-level accordion.

### Pattern used

The Quick Reference accordion (top-level header, toggle, hidden content) and the existing `primary-button`, `secondary-button`, `accordion-icon-button` and `form-field` styles.

### Changes

- `src/tasks/tasksWebviewHtml.ts`: removed `#configuration-panel`; `#history-encryption-panel` is top level, titled "History Encryption"; the locked notice points to it.
- `src/ui/tasks/historyEncryptionView.ts`: rewritten layout.
  - Status line with an icon per state: "git-crypt is not installed", "Tasks are stored as plain text", "Locked on this machine", "Encrypted · N files".
  - Badge reads On / Off / Locked / git-crypt missing; git-crypt and GPG versions moved into its tooltip.
  - Key picker only when there are two or more GPG keys; the default is the key that already has access.
  - Unlocked: "People with access · N" list with a "you" pill and a copy-fingerprint icon per row; actions Add teammate, Copy my public key (+ View link), Lock; a "not encrypted yet" warning with a Fix link.
  - The teammate form (textarea, Add, From file…, Cancel) opens only on Add teammate and closes after a successful add.
  - Help text cut to one short note per state.
- `media/tasks.css`: removed Configuration styles; new styles for the status line, badge variants, people list, link buttons and form spacing.
- Tests: `test/historyEncryptionView.test.ts` rewritten (11 tests), `test/tasksWebviewHtml.test.ts` updated.
- Docs and skill wording: `docs/history-encryption.md`, `docs/settings.md`, `docs/architecture.md`, `claude-plugin/skills/install-git-crypt/SKILL.md`.

### Checks run

- `tsc` for both tsconfigs: no errors.
- `esbuild.mjs`: build succeeded.
- vitest (Node 18 with a temporary ESM config): 189 passed, 5 failed. The failures are all in `test/claudePlugin.test.ts` ("needs Node 20 or newer") and are unrelated to this change.

### Remaining risks

- jsdom does not render CSS, so the visual result needs a check in VS Code (light and dark themes).
- The "View" public key action is now a small link next to "Copy my public key".
