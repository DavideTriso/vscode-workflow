# Implement: fix the copy checkmark

## Summary

The copy checkmark disappeared at once because the status refresh after each copy could re-render the section and replace the button. The view now tracks the copied button by key and redraws the checkmark after every render for 3 seconds. A new end-to-end test reproduced the bug and now passes; typecheck, build and 196 tests pass, and 5 claudePlugin tests fail only because this machine has Node 18.

## Full Record

### Request

The copy button animation is not working.

### Root cause

After a copy, the controller sends `historyEncryptionCopied` and then a fresh status. When the status differs from the last one (for example the encrypted file count changed because `.history` files were written during the task), the webview rebuilds the section. The button that just got the checkmark is replaced by a new button with the copy icon, so the user sees no change. The previous tests did not send a changed status after the copy, so they missed this.

### Changes

- `src/ui/tasks/historyEncryptionView.ts`:
  - Copy buttons are identified by `copyKeyOf()` (action plus fingerprint) instead of by element.
  - The copied key is kept in the view and applied again after each render.
  - One timer clears it after 3 s.
  - `showCopied` and `hideCopied` only swap the icon, class and label.
- `media/tasks.css`: thicker stroke for the checkmark so it is easy to see.
- `test/historyEncryptionCopyFlow.test.ts` (new): real `HistoryEncryptionController` with a mocked `vscode` API and fake git/gpg, wired to the real webview bundle. The status changes between refreshes; the test checks the checkmark survives the re-render and is restored after 3 s. It failed before the fix.
- `test/historyEncryptionView.test.ts`: regression test for a teammate row copied while the list re-renders.

### Checks run

- `tsc` for both tsconfigs: no errors.
- `esbuild.mjs`: build succeeded.
- vitest (Node 18, temporary ESM config): 196 passed, 5 failed. All 5 failures are in `test/claudePlugin.test.ts` ("needs Node 20 or newer") and are unrelated.

### Remaining risks

- Please retest in VS Code. If the checkmark still does not show, the cause is outside this flow (for example a stale extension host), and a window reload is needed after building.
