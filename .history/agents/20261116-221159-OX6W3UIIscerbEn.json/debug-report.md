# Debug report: scm/inputBox proposed menu error

## Summary
Debug runs failed with "scm/inputBox is a proposed menu identifier". The menu needs a proposed API that only works in dev or with a switch. I moved the button to the stable `scm/title` menu in package.json. The user confirmed in a debug run that it works.

## Full Report
- Reproduction: not run here (needs an Extension Development Host). The error text comes from the user report.
- Expected: extension loads and shows the button. Actual: VS Code rejects the `scm/inputBox` contribution.
- Evidence: package.json contributed `menus["scm/inputBox"]` with no `enabledApiProposals`. Extensions with proposed APIs cannot be published to the Marketplace.
- Root cause (confirmed from the error and package.json): `scm/inputBox` is a proposed menu.
- Change: `menus["scm/inputBox"]` became `menus["scm/title"]` with `group: "navigation"` (package.json). `scm/title` passes the SourceControl, which `repositoryArgument.ts` already reads through `rootUri`. Updated the button location in docs/commit-messages.md and one line in the earlier implement report.
- Checks: the user ran the extension in debug and reported "it worked". No automated checks were run.
- Risks: the button is in the repository title bar, not the commit box (no stable menu exists for the box).

## Follow-up: commit-message skill not available in dev mode
- Symptom: the user cannot invoke the commit-message skill in dev mode.
- Evidence: `claude-plugin/skills/commit-message` exists in the repo, but the installed copy under `globalStorage/davidetriso.vscode-workflow/claude-marketplace/plugins/vscode-workflow/skills` has no `commit-message` folder. That copy dates from 2026-11-16 21:51, before the skill was added.
- Root cause (confirmed from code): `syncOnActivation` in `src/claude/claudeRegistration.ts` returns early when the stored stamp (`version|node path`) matches. The version stays 0.5.0 during development, so the plugin is never copied again.
- Change: skip that early return when `context.extensionMode` is Development.
- Checks: Typecheck not run (npx and node are not available in this shell). Not run in a dev host; not verified. Immediate workaround: run the command "Workflow: Register Claude Code", then `/reload-plugins` in Claude Code.
- Note: the skill has `disable-model-invocation: true`, so it must be called as `/vscode-workflow:commit-message`.
