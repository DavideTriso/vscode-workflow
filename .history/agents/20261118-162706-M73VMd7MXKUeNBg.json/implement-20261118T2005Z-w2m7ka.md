# Implement: fast copy feedback and private key location

## Summary

Copies no longer wait for the controller queue or a status refresh. The copy icon shows a spinner at once, then a green check or a red cross for 3 seconds. The private key row now shows only the key file location, and the private key copy is removed. Typecheck, build and 198 tests pass; 5 claudePlugin tests fail only because this machine has Node 18.

## Full Record

### Request

Fingerprint and public key copies showed the check only after a long time: add a loading state and a red cross on failure. The private key copy took too long to show its dialog: remove the copy button and only show where the key is.

### Root cause

Every panel request went through the controller queue. Each queued action first looked up the repository and ended with a full status refresh (`git-crypt status`, several `gpg` calls). A copy could wait behind earlier refreshes, and the private key dialog waited for the same steps.

### Changes

- `src/crypt/historyEncryptionMessages.ts`:
  - New `HistoryEncryptionCopyRequest` (`copyPublicKey`, `copyFingerprint`) with a required `requestId`.
  - `historyEncryptionCopied` now carries `{ requestId, ok, message }`.
  - Removed `copyPrivateKey`; added `isHistoryEncryptionCopyRequest`.
- `src/crypt/historyEncryptionController.ts`:
  - Copies skip the queue and the refresh; the public key export runs with the home directory as working directory, so no repository lookup.
  - Every copy answers with success or failure.
  - Queued requests are typed as `QueuedRequest`. Removed the private key copy and its confirmation.
- `src/crypt/historyEncryptionActions.ts`: removed `exportPrivateKey`.
- `src/crypt/historyEncryptionStatus.ts`, `historyEncryptionTypes.ts`:
  - The secret key listing adds `--with-keygrip`; `parseGpgHome` reads `Home:` from `gpg --version`.
  - `GpgKeyInfo.privateKeyPath` is `<home>/private-keys-v1.d/<keygrip>.key` for secret keys.
- `src/ui/tasks/historyEncryptionView.ts`:
  - Copy state per button key: `pending` (spinner, `aria-busy`), `done` (green check), `failed` (red cross, reason in the tooltip), then back to idle after 3 s.
  - Request ids map answers to buttons; a second click while copying is ignored.
  - State is applied again after every render.
  - The Private key row shows the file path, or "In your GPG keyring", with no button.
- `media/tasks.css`: spinner animation, red failure color, reduced-motion override for all of them.
- Tests:
  - `test/historyEncryptionView.test.ts`: private key location, spinner then check, cross with reason, overlapping copies, re-render.
  - `test/historyEncryptionCopyFlow.test.ts`: real controller and webview; a copy causes no status refresh; check, cross, and private key path.
  - `test/historyEncryption.test.ts`: keygrip and home parsing; guard requires `requestId` and rejects `copyPrivateKey`.
- Docs: `docs/history-encryption.md`, `docs/architecture.md`.

### Checks run

- Checked on this machine: real `gpg --with-colons --with-keygrip --list-secret-keys` output has `sec`, `fpr`, `grp` in that order; `gpg --version` prints `Home: /home/ws1/.gnupg`; key files exist in `private-keys-v1.d`.
- `tsc` for both tsconfigs: no errors.
- `esbuild.mjs`: build succeeded.
- vitest (Node 18, temporary ESM config): 198 passed, 5 failed. All 5 failures are in `test/claudePlugin.test.ts` ("needs Node 20 or newer") and are unrelated.

### Remaining risks

- The public key copy still runs `gpg --export`, so the spinner shows for as long as gpg takes; that time is no longer added to by the queue or refreshes.
- The path display is cut with an ellipsis in narrow panels; the full path is in the tooltip.
