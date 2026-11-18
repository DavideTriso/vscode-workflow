# Implement: hide your own key from Teammates

## Summary

The Teammates list and its count now leave out your own key, which already shows in Your key, and the "you" pill is removed. With no other keys the section shows "No teammates yet." and still offers the + button. Typecheck, build and 194 tests pass; 5 claudePlugin tests fail only because this machine has Node 18.

## Full Record

### Request

Filter the row marked "you" out of the Teammates list, because the Your key section already shows that key.

### Changes

- `src/ui/tasks/historyEncryptionView.ts`: `teammatesContent` filters out `isYours` keys for both the list and the "Teammates · N" count; the empty note reads "No teammates yet."; removed the "you" pill from `teammateRow`.
- `media/tasks.css`: removed `.history-encryption-you`.
- `test/historyEncryptionView.test.ts`: the fixture has your key plus one teammate. Tests check that only the teammate is listed, and that the empty state shows when only your key exists.
- `docs/history-encryption.md`: says the list shows only the other people with access.

### Checks run

- `tsc` for both tsconfigs: no errors.
- `esbuild.mjs`: build succeeded.
- vitest (Node 18, temporary ESM config): 194 passed, 5 failed. All 5 failures are in `test/claudePlugin.test.ts` ("needs Node 20 or newer") and are unrelated.

### Remaining risks

- None for this change.
