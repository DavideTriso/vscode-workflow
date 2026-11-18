# Encrypt .history with git-crypt

## Summary

Add a Configuration accordion with a "History encryption" sub-accordion to the Tasks panel, a status bar badge that opens it, and an `install-git-crypt` skill that guides installation one step at a time. The extension detects encryption state, enables it, and shares access through GPG public keys. Five small decisions are open; recommended defaults are listed.

## Full Plan

Status: Selected (user approved D1 to D5 as recommended; implemented, see the implement run record)

### Understanding

Requested behavior:

1. New "Configuration" accordion in the Tasks panel, between "Open Tasks" and "Quick Reference", containing a "History encryption" sub-accordion.
2. Status bar item next to the Source Control items showing whether the open repository encrypts `.history`. Click opens the Tasks panel and expands the sub-accordion.
3. Enabled: show info and actions (copy/view GPG key, plus other useful ones, see below).
4. Not enabled, git-crypt installed: a button that enables encryption in the repository.
5. git-crypt missing: install information, and a pointer to the new skill `/vscode-workflow:install-git-crypt`.
6. New skill: detects OS and relevant package versions, then guides the user one step per message and waits for feedback.

### Repository findings (evidence)

- Panel is a single webview ([tasksWebviewHtml.ts](src/tasks/tasksWebviewHtml.ts)). Inside `#task-panel` the order is: create form, `#task-list-panel` (Open Tasks accordion), `#quick-reference-panel`. Accordions are a `.tasks-accordion-header` with a toggle button (`aria-expanded`) and a content div toggled with `hidden`; the logic is in [main.ts](src/ui/tasks/main.ts) (`toggleQuickReferenceAccordion`, line ~1108). Styles in `media/tasks.css` (~line 708+). The whole `#task-panel` is hidden when no repository is open.
- Messages are typed in [taskProtocol.ts](src/tasks/taskProtocol.ts) (`ExtensionToWebviewMessage`, `WebviewToExtensionMessage`); [tasksViewProvider.ts](src/tasks/tasksViewProvider.ts) handles them and resolves the repository root from the first workspace folder (`findCurrentRepositoryRoot`). Webview CSP allows only nonce scripts and the stylesheet.
- `src/scm/` is the pattern for a feature: one file imports `vscode` (`commitMessageCommand.ts`), the logic files do not, and `runProcess` ([processRunner.ts](src/scm/processRunner.ts)) runs programs with a timeout. `taskRepository.ts` uses `execFileAsync('git', …)`.
- All `.history` JSON is read with `JSON.parse` in [taskRepository.ts](src/tasks/taskRepository.ts) (lines ~74, 105, 822, 848) and [implementationTodo.ts](src/tasks/implementationTodo.ts). A locked clone holds binary files (`\0GITCRYPT\0` header) and these reads would fail.
- Skills are folders under `claude-plugin/skills/<name>/SKILL.md`; the test [claudePluginContent.test.ts](test/claudePluginContent.test.ts) checks frontmatter names match folder names. `commit-message` is a model for a user-invoked skill (`disable-model-invocation: true`). The Quick Reference lists every skill and must be updated.
- No `.gitattributes`, GPG or git-crypt code exists. `.history/` is tracked in Git here. This machine has `gpg` and git 2.34.1 but no `git-crypt`.
- No status bar item exists in the extension yet. `package.json` has the view `tasks.list` in the activity bar container `tasks`, so the command `tasks.list.focus` reveals the panel.

### git-crypt facts that shape the design

- Encryption runs in Git filters at `git add`/commit, decryption at checkout/pull. It is not a push hook. Remote and objects hold ciphertext; the working tree stays plaintext while unlocked. This satisfies "encrypted on push, decrypted on pull".
- Enable = `git-crypt init` (creates the symmetric key in `.git/git-crypt/keys/default`) + `.gitattributes` rule `.history/** filter=git-crypt diff=git-crypt` + `git-crypt add-gpg-user <key>` for each person. The key is wrapped per person in `.git-crypt/keys/default/0/<FINGERPRINT>.gpg` (committed).
- **Important nuance on "share the GPG key":** the symmetric key is never shared as a GPG key. Access works by the admin adding the teammate's GPG public key. So the teammate sends their public key (armored text) to someone who already has access; that person adds it and commits; the teammate pulls and runs `git-crypt unlock`. The teammate cannot add themselves. `add-gpg-user` and `init` need only public keys (no passphrase); `unlock` needs the private key and may prompt for a passphrase (pinentry), which a silent child process cannot answer.
- Authorized people are visible without git-crypt: the `<FINGERPRINT>.gpg` file names.
- Unlocked state can be read without git-crypt: `.git/git-crypt/keys/default` exists, or `git config filter.git-crypt.smudge` is set. Enabled state: `.gitattributes` has `filter=git-crypt` for `.history`, or `.git-crypt/keys` is tracked.
- Existing plaintext commits stay readable in Git history. Files already tracked need `git add --renormalize .history` so new commits store ciphertext.

### Risks

1. Locked clones break the Tasks view and agents unless detected (new state "locked").
2. Old plaintext history remains in Git. The UI must say so; the extension must not rewrite history.
3. Passphrase and `sudo` prompts need a TTY: unlock and install must run in an integrated terminal, not a hidden process.
4. Related tasks read other repositories' `.history`; a locked repository there needs the same handling.
5. VS Code Remote: commands run on the remote host, where the GPG keys and git-crypt must exist.
6. A committed `.gitattributes` rule without git-crypt installed makes `git status` show `.history` as modified for teammates who lack git-crypt; the panel must explain this.
7. `git-crypt add-gpg-user` auto-commits the key file. Behavior with a dirty index must be tested at implementation (use `--no-commit` if needed).

### States the UI must show

| State | Detection | Panel content |
| --- | --- | --- |
| No repository | no root | sub-accordion hidden |
| git-crypt not installed | `git-crypt --version` fails | explanation, platform install hint, mention of `/vscode-workflow:install-git-crypt`; no enable button |
| Installed, not enabled | no filter rule | what enabling does, GPG key picker (secret keys list), **Enable encryption** |
| Enabled, locked | filter rule present, no local key | **Unlock** (terminal), **Copy my public key** (to send to a teammate), warning that `.history` is unreadable |
| Enabled, unlocked | local key present | version, authorized key list, actions below |

### Actions and info when enabled (proposed)

Info: state; git-crypt and gpg versions; list of authorized GPG keys (fingerprint, user ID, expiry, marking "you"); count of encrypted files (`git-crypt status -e`); warnings for unencrypted tracked files under `.history` (`git-crypt status -u`).

Actions:
- Copy / view my public key (armored) to send to an admin.
- Add teammate: paste armored public key, pick a key file, or enter key ID (imports with `gpg --import`, then `git-crypt add-gpg-user`); asks for confirmation because it creates a commit.
- Copy a fingerprint; open the `.git-crypt/keys` folder.
- Lock / Unlock (terminal).
- Fix unencrypted files (`git add --renormalize .history`, stages only).
- Export symmetric key backup (`git-crypt export-key`) with a warning that the file grants full access. Optional, lower priority.
- Refresh status; link to documentation.

### Options and decisions

**D1. Where git-crypt commands run.** Recommended: enable, add-teammate and status run silently through `runProcess` (they need no passphrase); unlock, lock and install run in an integrated terminal. Alternative: everything in a terminal (simpler, less feedback in the panel).

**D2. Status bar item.** Recommended: right-aligned item with a lock icon (`$(lock)` encrypted and unlocked, `$(warning)`/`$(lock)` with warning color when locked, `$(unlock)` "History: plain" when not enabled; hidden when no repository). Click runs a command that focuses the Tasks view and posts a message to expand the accordion. Status refreshes on activation, workspace change, `.gitattributes` change and panel refresh.

**D3. Multi-root workspaces.** Recommended: use the first workspace folder's repository, as the Tasks view does today.

**D4. Enabling with existing tracked `.history` files.** Recommended: run `git-crypt init`, write `.gitattributes`, add the chosen key, run `git add --renormalize .history` and `git add .gitattributes`, and leave the commit to the user; show a notice that earlier commits stay plaintext. No history rewrite.

**D5. Skill scope.** Recommended: `install-git-crypt` is user-invoked only, covers OS and version detection (OS, package manager, git, gpg, git-crypt, existing keys), install, enabling, creating a GPG key if none exists, sharing keys and unlocking on a teammate's machine, one step per message with a wait for feedback. It mirrors the panel's states so the two agree.

### Recommendation

Adopt the recommended answer for D1 to D5.

### Draft implementation outline (proposed; not selected)

1. `src/crypt/historyEncryptionStatus.ts` (no `vscode`): state detection, locked-file detection, authorized-key listing, parsing of `gpg --list-keys --with-colons`; unit tests with a fake runner.
2. `src/crypt/historyEncryptionActions.ts`: enable, add teammate, export public key, renormalize; `.gitattributes` idempotent writer; unit tests.
3. Locked guard in `taskRepository.ts` / `implementationTodo.ts`: throw a typed `HistoryLockedError`; the view shows a locked message; tests.
4. `src/crypt/historyEncryptionCommands.ts` (imports `vscode`): commands, terminal runner for unlock/lock/install, status bar item, `vscode-workflow.openHistoryEncryption`; register in `extension.ts`; `package.json` commands.
5. Protocol: new messages (`historyEncryptionStatus`, `enableHistoryEncryption`, `addTeammateKey`, `copyPublicKey`, `unlockHistory`, `expandHistoryEncryption`, …) in `taskProtocol.ts`; handlers in `tasksViewProvider.ts`.
6. Webview: "Configuration" accordion with "History encryption" sub-accordion in `tasksWebviewHtml.ts`, logic in `main.ts`, styles in `media/tasks.css`; tests in `tasksWebviewHtml.test.ts` / `tasksWebview.test.ts`.
7. Skill `claude-plugin/skills/install-git-crypt/SKILL.md`; Quick Reference entry; plugin content test.
8. Docs: `docs/architecture.md`, `docs/user-documentation.md`, new `docs/history-encryption.md`, `docs/skills-and-agents.md`, `README.md`.

### Verification (planned)

- `npm run typecheck` and `npm test` pass with new tests.
- Manual: in a scratch repo with git-crypt installed, enable, commit, clone elsewhere (locked state shown), add teammate key, pull, unlock, and read tasks.
- Manual: panel in each of the five states; status bar click expands the sub-accordion.
