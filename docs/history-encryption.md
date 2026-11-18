# History encryption

Store the `.history` folder encrypted in Git with [git-crypt](https://github.com/AGWA/git-crypt), so tasks and agent reports stay private on the remote. Files stay plain text in your working folder while the clone is unlocked.

The extension checks the Git repository of the first workspace folder.

## How the keys work

git-crypt uses two kinds of keys:

- **The repository key.** Each repository has one. It encrypts and decrypts the files under `.history`. git-crypt creates it when encryption is enabled.
- **Your personal GPG key.** It does not encrypt any files. It only protects your copy of the repository key. For each person with access, the repository stores the repository key encrypted for that person's GPG public key, in `.git-crypt/keys/default/0/<fingerprint>.gpg`. When you unlock, gpg uses your private key to open your copy.

What follows from this:

- One personal GPG key works for all your repositories.
- Access to the Git repository alone is not enough to read `.history`. You need a personal GPG key that someone with access has added.
- Teammates never need your key, and you never need theirs. Each person unlocks with their own key.
- The **fingerprint** is a public ID of a GPG key, not a key. It is safe to share.
- The **public key** is safe to send in chat or email. Never send your **private key**.

## What you see

- **Status bar** (left): `History: encrypted` (unlocked here), `History: locked`, `History: plain`, or `History: git-crypt missing` (the repository encrypts `.history` but git-crypt is not installed here). Click it to open the Tasks view with the **History Encryption** accordion expanded. The **Workflow: Open History Encryption** command does the same.
- **History Encryption** accordion in the Tasks view, between Open Tasks and Quick Reference. A badge shows the state (`On`, `Off`, `Locked`, `git-crypt missing`); hover it to see the git-crypt and GPG versions. The refresh button in the header checks the state again. The state is also checked when `.gitattributes` changes, when the VS Code window gets focus, and when the `git-crypt` terminal closes.
- **Locked notice** above the task list when the repository encrypts `.history` but this clone cannot read it. Without it the task list would just look empty.

## The accordion

The accordion has up to three sections, separated by a thin line.

### Status

The state, and the one action for it:

- **Enable encryption** when encryption is off. If you have no GPG key yet, the section points to `/vscode-workflow:install-git-crypt` instead.
- **Unlock** when the clone is locked. It runs `git-crypt unlock` in a terminal named `git-crypt`, where gpg may ask for your passphrase.
- When unlocked: the number of encrypted files under `.history`. If some files there are still stored as plain text, a "not encrypted yet" warning appears (hover it for the file list) with a **Fix** link. **Fix** runs `git add --renormalize -- .history`, so your next commit stores them encrypted.

### Your key

Shown when you have at least one usable GPG secret key.

- **Fingerprint**, with a copy icon.
- **Public key**, showing the key's user ID, with a copy icon that copies the ASCII-armored public key.
- **Private key**, showing only where gpg keeps the private key file: `<gpg home>/private-keys-v1.d/<keygrip>.key`, usually under `~/.gnupg/`. There is no button. The extension never reads or copies the private key.
- A key picker, only when you have two or more GPG keys. The key whose user ID matches `git config user.email` comes first.

A copy icon turns into a spinner while copying, then a green check, or a red cross with the reason in its tooltip, for 3 seconds.

### Teammates

Shown when the repository encrypts `.history` (locked or unlocked). It lists the other people whose keys can unlock the repository, in the same style as the task list. Your own key is not listed; it is in Your key. Each row shows the key's user ID (or "Key not in your keyring") and the end of its fingerprint, with a copy-fingerprint icon.

- **+** (only when unlocked) replaces the list with a form: paste the teammate's public key and click **Save**, or **Cancel** to go back.
- The reload button checks the state again.

### States

| State | Meaning | Sections shown |
| --- | --- | --- |
| git-crypt missing | git-crypt is not installed on this machine. | Status, with the `/vscode-workflow:install-git-crypt` skill and the install command. |
| Off | `.history` is plain text in Git. | Status, and Your key if you have a GPG key. |
| Locked | The repository encrypts `.history` but this clone has no key. Tasks cannot be read. | Status, Your key, Teammates (no **+**). |
| On | Encrypted and unlocked here. | Status, Your key, Teammates. |

## Set up

1. Install git-crypt and GPG, and create a GPG key. In Claude Code, type `/vscode-workflow:install-git-crypt` for a guided, step-by-step setup.
2. Open the History Encryption accordion and click **Enable encryption** (pick your key first if you have several), then confirm. The extension:
   - runs `git-crypt init`;
   - adds `.history/** filter=git-crypt diff=git-crypt` to `.gitattributes`;
   - runs `git-crypt add-gpg-user --no-commit <fingerprint>` for your key;
   - stages `.gitattributes`, `.git-crypt` and `git add --renormalize -- .history`.

   It does not commit.
3. Review the staged changes, commit and push.

Git encrypts when you commit and decrypts when you check out or pull. It is not a push hook, but the remote only ever receives encrypted files.

**Commits made before this one stay readable in Git history.** The extension never rewrites history. If old commits hold sensitive text, rewrite history yourself (for example with `git filter-repo`) and force push, after talking to your team.

## Share access with teammates

A teammate cannot add themselves. Someone who can already unlock adds the teammate's GPG public key:

1. The teammate installs git-crypt and GPG, creates a GPG key, clones the repository (it is locked) and opens the History Encryption accordion.
2. They click the copy icon next to **Public key** and send it to someone who can already unlock the repository.
3. That person clicks **+** in the Teammates section, pastes the key and clicks **Save**. The extension imports the key into their keyring, runs `git-crypt add-gpg-user --no-commit` for it, and stages `.git-crypt`. They commit and push.
4. The teammate pulls and clicks **Unlock**.

## Unlock and lock

A fresh clone starts locked, because the repository key is stored in Git only in encrypted form. Click **Unlock** once per new clone; after that, the clone stays unlocked.

There is no Lock button. Git and the remote always hold encrypted files, so locking a clone adds nothing for normal use. If you need it, for example on a shared machine, run `git-crypt lock` in a terminal.

## Lost keys and backups

- If you lose your private key, you cannot unlock anymore. Create a new GPG key and ask a teammate with access to add your **new** public key.
- If nobody with access has their private key anymore, `.history` cannot be decrypted. Protect against this:
  - back up your private key: `gpg --armor --export-secret-keys <fingerprint>`, stored somewhere safe;
  - back up the repository key from an unlocked clone: `git-crypt export-key <file>`, stored somewhere safe (anyone with this file can decrypt the repository);
  - keep at least two people with access.

## Removing access

git-crypt has no command to remove a person, and the extension has no delete button. Deleting a person's file from `.git-crypt/keys/default/0/` is not real revocation: they may still have the repository key, and it still decrypts every file. Real revocation needs a new repository key, which the extension does not support.

## Troubleshooting

- **Tasks list is empty and the status bar says locked:** unlock the clone. Agents cannot read the task files while the clone is locked either.
- **`git status` shows `.history` files as modified on a machine without git-crypt:** install git-crypt and unlock.
- **Save in the Teammates form fails:** paste the whole public key, including the `-----BEGIN PGP PUBLIC KEY BLOCK-----` and `-----END PGP PUBLIC KEY BLOCK-----` lines. A key that can already unlock is rejected.
- **Unlock fails in the terminal:** your key has not been added yet (check that `.git-crypt/keys/default/0/` has a file named after your fingerprint after you pull), or gpg could not ask for your passphrase. In a remote terminal, run `export GPG_TTY=$(tty)` first.
- **Remote sessions (SSH, WSL, dev container):** git-crypt and the GPG key must be on the machine where the repository lives.
- **Windows:** git-crypt has no official installer. Prefer WSL; the skill checks what your package manager offers.
