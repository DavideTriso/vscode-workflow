# Documentation update: Support encrypted .history

## Summary

The History encryption page now matches the code. It explains how the keys work, the accordion, unlock and lock, lost keys, backups and removing access. Fixed stale architecture claims (lock in a terminal), added the new test suites, and linked the page from tasks.md. No code changes were made.

## Full Record

### Changed documentation

- `docs/history-encryption.md` (user):
  - New "How the keys work" section: one repository key per repository, a personal GPG key that only protects your copy (`.git-crypt/keys/default/0/<fingerprint>.gpg`), one GPG key for all repositories, teammates never need your key, access to the repository alone is not enough, the fingerprint is a public ID.
  - "What you see": when `History: git-crypt missing` shows (rule present, git-crypt missing), the command, refresh triggers, and the locked notice.
  - "The accordion": subsections for Status (Enable encryption, Unlock in the `git-crypt` terminal, encrypted file count, Fix runs `git add --renormalize -- .history`, the no-GPG-key hint), Your key (fingerprint, public key, private key file path only, key picker with 2+ keys, copy feedback) and Teammates (own key filtered out, row content, + only when unlocked, form). States table corrected: Your key needs a GPG key, and Locked has no +.
  - Set up: added the confirmation dialog and the staged paths.
  - Share access: Save imports the pasted key, runs `add-gpg-user --no-commit` and stages `.git-crypt`.
  - New sections: "Unlock and lock" (once per new clone, no Lock button, `git-crypt lock` by hand), "Lost keys and backups" (`gpg --armor --export-secret-keys`, `git-crypt export-key`, two people with access), "Removing access" (no remove command or delete button; deleting the key file is not revocation).
  - Troubleshooting: replaced the old "no public key / gpg --import <file>" item, which belonged to the removed from-file flow, with Save and Unlock failure items.
- `docs/architecture.md` (developer): changed "Unlock and lock run in a terminal" to unlock only, with no lock action on purpose. Added the refresh triggers, the teammate import and staging, no remove action, the first workspace folder as the repository, and the rule that the private key is never read (keygrip and `Home:` lookup).
- `docs/development-process.md` (developer): added `historyEncryption.test.ts`, `historyEncryptionView.test.ts` and `historyEncryptionCopyFlow.test.ts` to the test table.
- `docs/tasks.md` (user): "Where data lives" now links to History encryption.
- Checked without changes: `README.md`, `docs/developer-documentation.md`, `docs/user-documentation.md` (already links the page), `docs/settings.md` (command row is correct), `docs/skills-and-agents.md`, `claude-plugin/skills/install-git-crypt/SKILL.md` (matches the panel: + / Save, copy icon, Unlock, refresh arrow).

### Checks performed

- Read `src/crypt/*.ts`, `src/ui/tasks/historyEncryptionView.ts`, and the staged diffs of `tasksViewProvider.ts`, `tasksWebviewHtml.ts`, `taskProtocol.ts`, `extension.ts` and `package.json`. Checked each claim against them.
- Searched docs, README and the plugin for stale terms: Configuration accordion, Lock button, View public key, From file, private key copy, "Add a teammate", "Add pasted key", "Who can unlock", "People with access". None left; the only `from file` remnant was the troubleshooting item, now replaced.
- Checked that every relative `.md` link in `docs/` points to an existing file.
- No documentation lint is configured in the repository.

### Remaining gaps and mismatches

- Code comment mismatch (not changed, since it is implementation code): the class comment of `HistoryEncryptionController` in `src/crypt/historyEncryptionController.ts` still says "Unlock and lock run in a terminal". Only unlock exists.
- `addTeammateKey` in `historyEncryptionActions.ts` still accepts `{ keyId }` (`findKeyInKeyring`). No UI or message uses it after the from-file option was removed. It is not documented.
- `docs/skills-and-agents.md` opens with "seven agents and a documentation skill", which already undercounted the skills before this task. Left as is.
