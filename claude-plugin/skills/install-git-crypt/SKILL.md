---
name: install-git-crypt
description: Guides the user, one step at a time, through installing git-crypt and GPG, creating a GPG key, enabling .history encryption, and sharing access with teammates, after checking the operating system and package versions. Use when the user wants to set up or join .history encryption.
disable-model-invocation: true
---

# Install git-crypt

Guide the user through installing git-crypt and using it to encrypt the `.history` folder of this repository. The VS Code Workflow extension shows the state in the **History Encryption** accordion of the Tasks panel and has buttons for enabling encryption, copying the public key, and adding teammates. This skill gets the user to the point where those buttons work, and covers the steps the extension cannot do (installing software, creating a GPG key, unlocking a clone).

## Rules

- **One step per message.** Show one step, say what to expect, then stop and wait for the user's reply. Never show the next step before the user confirms the current one worked.
- Start every step message with `Step N of M: <title>`. Update M when the path changes.
- When a step fails, ask for the exact error text. Fix that step before moving on.
- Run only read-only detection commands yourself (see Step 1). Let the user run every command that installs software, creates keys, changes the repository, or needs `sudo`; show the command in a code block. The user can run it in a terminal, or in Claude Code with the `!` prefix.
- Never ask for a passphrase, a private key, or a token. Never print, copy, or ask for private key material. Public keys are safe to share.
- Do not guess package names or versions. Check what the package manager offers before you recommend a command, and say when you could not check.
- Do not rewrite Git history, force push, or commit for the user. Say that commits made before encryption stay readable in Git history.
- Keep messages short, in plain words. Keep commands and identifiers exact.

## Step 1: Detect the environment

Run these read-only checks yourself, then summarize the result in a short table and propose the plan. Skip commands that do not exist on the system.

- Operating system: `uname -a`; on Linux also `cat /etc/os-release`; on macOS `sw_vers`; on Windows `ver` or `$PSVersionTable.PSVersion`, and whether this shell is WSL (`uname -r` contains `microsoft`).
- Package managers: check which of `apt`, `dnf`, `pacman`, `zypper`, `brew`, `winget`, `choco`, `scoop` exist (`command -v` or `Get-Command`).
- Versions: `git --version`, `gpg --version` (first line), `git-crypt --version`, `openssl version` when relevant.
- GPG keys: `gpg --list-secret-keys --keyid-format long`. Show only user IDs, key IDs and expiry, never more.
- Repository state: `git rev-parse --show-toplevel`, `git config user.email`, `git remote -v`, whether `.gitattributes` has a `filter=git-crypt` line for `.history`, whether `.git-crypt/keys` exists, and `git config --get filter.git-crypt.smudge` (set when this clone is unlocked).
- Remote sessions (SSH, WSL, dev container): tell the user that git-crypt and the GPG key must be on the machine where the repository lives, not on their laptop.

Then decide the path and tell the user:

- **Missing software:** go to Step 2 (GPG) and Step 3 (git-crypt) for what is missing.
- **No GPG secret key:** include Step 4.
- **Repository does not use encryption yet:** the user enables it (Step 5).
- **Repository already encrypts `.history` and the clone is locked:** the user joins (Step 6).
- **Everything present and unlocked:** report that nothing is needed and point to the panel.

Ask the user to confirm the plan before Step 2.

## Step 2: Install GPG (only when missing or older than 2.2)

Pick the command for the detected system, after checking that the package exists:

- Debian, Ubuntu: `sudo apt update && sudo apt install gnupg`
- Fedora: `sudo dnf install gnupg2`
- Arch: `sudo pacman -S gnupg`
- macOS: `brew install gnupg`
- Windows: install Gpg4win (`winget search gnupg` to check for a winget package), or use WSL and follow the Linux steps there.

After the user runs it, ask them to run `gpg --version` and paste the first line. Check it is 2.2 or newer.

## Step 3: Install git-crypt (only when missing)

Check availability first, for example `apt-cache policy git-crypt`, `dnf info git-crypt`, `pacman -Si git-crypt`, `brew info git-crypt`, `winget search git-crypt`, `scoop search git-crypt`. Then give the matching command:

- Debian, Ubuntu: `sudo apt install git-crypt`
- Fedora: `sudo dnf install git-crypt`
- Arch: `sudo pacman -S git-crypt`
- macOS: `brew install git-crypt`
- Windows: git-crypt has no official installer. Prefer WSL and the Linux steps. Otherwise use a package manager that your check shows has it, or build it from source (https://github.com/AGWA/git-crypt, file `INSTALL.md`). Say plainly when you could not confirm a Windows package.
- Other Linux or no package: build from source with the steps in `INSTALL.md` (needs a C++ compiler, make and OpenSSL development headers).

After install, ask the user to run `git-crypt --version` and paste the output. If the command is not found, check `PATH` and ask them to restart the terminal and VS Code.

## Step 4: Create a GPG key (only when no usable secret key exists)

Explain that the key identifies the user to git-crypt, and that the passphrase protects the private key. Tell them to run `gpg --full-generate-key` and choose: key type RSA and RSA (or the default), 4096 bits, an expiry they accept (for example 2y), their real name, and the same email as `git config user.email`. They enter the passphrase in the prompt themselves.

After it finishes, ask them to run `gpg --list-secret-keys --keyid-format long` and paste the output. Confirm the key and email.

If gpg shows no prompt in a remote terminal, explain that pinentry needs a terminal and suggest `export GPG_TTY=$(tty)` first.

## Step 5: Enable encryption (first person in the team)

Recommend the extension: open the **History Encryption** accordion in the Tasks panel (or click the History item in the status bar), pick the GPG key, and click **Enable encryption**. Explain what it does: `git-crypt init`, a rule `.history/** filter=git-crypt diff=git-crypt` in `.gitattributes`, the key wrapped for the chosen GPG key, and `.history` staged again so the next commit stores it encrypted. Nothing is committed.

For users who prefer the terminal, give these as one step each, waiting between them:

1. `git-crypt init`
2. Add `.history/** filter=git-crypt diff=git-crypt` to `.gitattributes`
3. `git-crypt add-gpg-user --no-commit <FULL_FINGERPRINT>`
4. `git add .gitattributes .git-crypt && git add --renormalize .history`

Then tell the user to review `git status`, commit, and push. Ask them to run `git-crypt status | grep ".history"` and confirm the files show as `encrypted`. Remind them once that commits made before this one remain readable in Git history.

## Step 6: Join an encrypted repository (teammate)

1. Ask the user to copy their public key: the copy icon next to **Public key** in the **Your key** section of the History Encryption accordion, or `gpg --armor --export <FULL_FINGERPRINT>`. Explain that this is the public half, safe to send in chat or email.
2. They send it to a teammate who can already unlock the repository. That teammate clicks **+** in the **Teammates** section, pastes it and clicks **Save** (or runs `gpg --import` and `git-crypt add-gpg-user --no-commit <FINGERPRINT>`, then `git add .git-crypt`), commits, and pushes. Wait for the user to confirm the teammate did this.
3. The user runs `git pull`. Ask them to confirm that `.git-crypt/keys/default/0/` now has a file named after their fingerprint.
4. The user clicks **Unlock**, or runs `git-crypt unlock`. gpg may ask for their passphrase in the terminal. Ask them to run `git config --get filter.git-crypt.smudge` or to open the History Encryption accordion and confirm the badge shows "On".

## Step 7: Check and finish

Ask the user to refresh the panel (the circular arrow in the History encryption header) and confirm that the status bar item shows `History: encrypted` and that tasks load. Summarize what was installed and configured, how to add the next teammate, and what to do after cloning on a new machine (Step 6, items 3 and 4). Offer help with anything that failed.

Common problems to know:

- `git status` shows `.history` files as modified on a machine without git-crypt: the filter cannot run there. Install git-crypt and unlock.
- The tasks list is empty and the status bar says `History: locked`: the clone has no key. Do Step 6.
- `add-gpg-user` fails with "no public key": the key is not in the local keyring. Import it with `gpg --import <file>`.
