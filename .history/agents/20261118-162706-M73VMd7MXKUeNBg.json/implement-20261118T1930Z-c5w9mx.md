# Implement: private key row and copy feedback

## Summary

Your key now has fingerprint, public key and private key rows, each with one copy icon. The View button is gone, and a successful copy shows a green checkmark for 3 seconds instead of a message. Private key export asks for confirmation and lets gpg prompt for the passphrase. Typecheck, build and 193 tests pass; 5 claudePlugin tests fail only because this machine has Node 18.

## Full Record

### Request

Add a private key row with a copy button to Your key, remove the View public key button, and replace the "Public key copied…" message with an animated copy button that shows a green checkmark for about 3 seconds.

### Pattern used

The existing `exportPublicKey` action and the controller request flow. Copy feedback uses a new `historyEncryptionCopied` notice, so the checkmark appears only after the clipboard write succeeds.

### Changes

- `src/crypt/historyEncryptionActions.ts`: new `exportPrivateKey` runs `gpg --armor --export-secret-keys <fp>` without `--batch` (so pinentry can ask for the passphrase), with a 3-minute timeout. On failure it explains the problem and gives the terminal command.
- `src/crypt/historyEncryptionController.ts`:
  - `copyPrivateKey` asks for confirmation first.
  - All copies go through `copy()`, which fires `historyEncryptionCopied`; the "copied" text messages are removed.
  - Removed `viewPublicKey`.
- `src/crypt/historyEncryptionMessages.ts`: added `copyPrivateKey` and the `historyEncryptionCopied` notice; removed `viewPublicKey`.
- `src/ui/tasks/historyEncryptionView.ts`:
  - Your key shows three rows, each with one copy icon.
  - The view remembers the clicked copy button. On `historyEncryptionCopied` it shows a checkmark with the `is-copied` class and restores the icon after `copiedFeedbackMs` (3000 ms). A result message (error or cancel) clears the pending button.
- `media/tasks.css`: green checkmark color, a short scale-in animation, and a reduced-motion override.
- Tests: three new webview tests (rows, checkmark and restore, failed copy); one action test for private key export; guard checks for `copyPrivateKey` and the removed `viewPublicKey`.
- Docs: `docs/history-encryption.md`.

### Checks run

- `tsc` for both tsconfigs: no errors.
- `esbuild.mjs`: build succeeded.
- vitest (Node 18, temporary ESM config): 193 passed, 5 failed. All 5 failures are in `test/claudePlugin.test.ts` ("needs Node 20 or newer") and are unrelated.

### Remaining risks

- The private key export was tested only with a fake runner. Check it with a real passphrase prompt, locally and over Remote SSH, where no pinentry window may open and the error path applies.
- The clipboard keeps the private key until something else is copied; the confirmation dialog asks the user to clear it.
