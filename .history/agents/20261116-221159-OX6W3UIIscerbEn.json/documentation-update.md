# Documentation update

## Summary
Fixed the remaining "button in the box" wording in docs/settings.md. Documented the development-host plugin sync (copy on every start, /reload-plugins, commit-message invoked manually) in docs/architecture.md and docs/development-process.md.

## Full Record
Changed: docs/settings.md, docs/architecture.md, docs/development-process.md.
- settings.md: command table now says the button is in the repository title bar of the Source Control view (scm/title).
- architecture.md: plugin sync paragraph explains the Development-mode copy on every start, /reload-plugins, disable-model-invocation on commit-message, and the `disabled` setting.
- development-process.md: F5 step notes the per-start copy with registration `enabled`.
Checks: grepped README.md and docs for input box/commit box/scm/inputBox; only docs/commit-messages.md (already correct) and the settings row remained. Verified against package.json (scm/title) and claudeRegistration.ts. No remaining gaps. README needs no change.

## Update 2: user documentation for commit messages

### Summary
Verified docs/commit-messages.md and the docs/user-documentation.md link against package.json, src/scm/*.ts and the skill. Fixed the button location in the how-to steps and added the command, multi-repository behavior and two troubleshooting rows.

### Full Record
Changed: docs/commit-messages.md. docs/user-documentation.md already links and summarizes it; docs/settings.md already lists the three settings accurately. No new pages, so no table of contents approval was needed.
- Step 2 of "The button" said "commit message box"; it is the title bar of the repository in Source Control (menu scm/title, when scmProvider == git). Now also names the Command Palette command, Cancel behavior and the repository pick with several repositories.
- Troubleshooting: added "Open a Git repository..." and "Claude returned an empty commit message."
- Verified: requirements, CLI lookup order, no fallback for a bad claudePath, 2-minute timeout, report limits 8,000/24,000, excluded files, replace prompt, skill behavior.
Checks: compared each claim with code; no tests run. No remaining gaps.
