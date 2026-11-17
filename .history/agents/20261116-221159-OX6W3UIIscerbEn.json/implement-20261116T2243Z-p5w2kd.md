# Implement: commit message skill and Source Control button

## Summary

Added the `commit-message` skill, with a shared rules file, and a "Generate Commit Message" button for the Source Control view that runs the Claude Code CLI headlessly. Both use the diff, the active task and its reports, and the BC/New/Ref/Fix/Doc format. Typecheck and 164 tests pass, and a live run with the real `claude` binary worked. The button and the skill still need a manual check in VS Code.

## Full Record

### User request

Implement a skill and the Source Control button that generate commit messages (plan `implementation-plan.md`, status Selected, with revision 1). Decisions: the button runs the Claude Code CLI headlessly; the skill only proposes a message and never commits; one interactive skill named `commit-message`; the button also uses the task context; the skill and the button share one rules file. Format: the prefix is one of BC, New, Ref, Fix, Doc, then a short summary, then optional `- ` detail lines.

### Pattern used

Pure, testable modules with the VS Code calls in one thin file, as in `src/tasks/repositoryGroups.ts` and `src/tasks/userSettings.ts`, and temp-directory tests as in `test/relatedTasks.test.ts`.

### Implementation summary

- **Rules and skill.** `claude-plugin/skills/commit-message/commit-message-rules.md` holds the format, the five prefixes, the priority order (BC, New, Fix, Ref, Doc), and the rule that BC needs a concrete break. `SKILL.md` is user-invoked only. It reads the rules, the task JSON name and description, and every `*.md` in the task folder, leaves `.history/` out of the diff, prefers the staged diff, and states that nothing was committed.
- **`src/scm/claudeCli.ts`.** Finds `claude`: the `claudePath` setting, then `PATH`, then the binary in the Claude Code extension. A configured path that does not work is an error with no fallback.
- **`src/scm/processRunner.ts`.** Runs a program with input on standard input, abort signal, timeout and an output cap.
- **`src/scm/taskContext.ts`.** Reads the unique active task: name, description, Markdown reports (8,000 characters each, 24,000 in total). It never reads `implementation-todo.json`.
- **`src/scm/commitMessageGenerator.ts`.** Checks that the folder is a repository, takes the staged diff (or the unstaged one), the status, and the task context, cuts the diff at `maxDiffChars` and adds a diff summary, builds the prompt, runs `claude -p` with no tools, no saved session, no skills, no MCP servers and `--setting-sources user`, and cleans the answer.
- **`src/scm/commitMessageCommand.ts` and `repositoryArgument.ts`.** The command `vscode-workflow.generateCommitMessage`: finds the repository (menu argument, else the only repository, else a pick list), asks before replacing text, shows a cancellable progress notification, and writes to the commit box through the built-in Git API. Errors have clear messages; a missing CLI offers to open the setting.
- **`package.json` and `src/extension.ts`.** Command, `scm/title` menu entry (`scmProvider == git`), and settings `commitMessage.claudePath`, `.maxDiffChars`, `.model`.
- **Quick Reference** in the Tasks view lists the new skill.

### Deviations from the plan

- The bundled CLI is found through the Claude Code extension's own path, not by scanning the extensions folder for the newest version. It is simpler and always matches the installed extension.
- Binary files are not excluded by pathspec; Git already prints them as a one-line note. Lock-file exclusions are `*.lock`, `package-lock.json` and `pnpm-lock.yaml`.
- `--bare` is not used. Its help text says it skips keychain reads, which would break login-based authentication.
- The related-tasks paragraph that other task-reading skills carry is not in `commit-message`: a commit message does not need linked tasks from other repositories.
- A repository check (`git rev-parse --is-inside-work-tree`) was added after a test showed `git diff` fails with a confusing message outside a repository.

### Files changed

Added: `claude-plugin/skills/commit-message/SKILL.md`, `claude-plugin/skills/commit-message/commit-message-rules.md`, `src/scm/claudeCli.ts`, `src/scm/commitMessageCommand.ts`, `src/scm/commitMessageGenerator.ts`, `src/scm/processRunner.ts`, `src/scm/repositoryArgument.ts`, `src/scm/taskContext.ts`, `docs/commit-messages.md`, `test/claudeCli.test.ts`, `test/commitMessageGenerator.test.ts`, `test/processRunner.test.ts`, `test/repositoryArgument.test.ts`, `test/taskContext.test.ts`.

Changed: `package.json`, `src/extension.ts`, `src/tasks/tasksWebviewHtml.ts`, `test/claudePluginContent.test.ts`, `test/tasksWebviewHtml.test.ts`, `docs/architecture.md`, `docs/settings.md`, `docs/skills-and-agents.md`, `docs/user-documentation.md`.

### Checks run

The host has no Node, so checks ran in the repository's dev container `vscode-workflow-dev-1` (Node 22).

- `npm run typecheck`: passes.
- `npm test`: 15 files, 164 tests pass. New: `claudeCli` 7, `taskContext` 6, `processRunner` 8, `repositoryArgument` 3, `commitMessageGenerator` 26 (5 of them with a real Git repository and a fake `claude` program); `claudePluginContent` and `tasksWebviewHtml` extended.
- `esbuild` bundle of `src/extension.ts` for Node 20: builds.
- Live run with the real `claude` 2.1.325 binary through the generator on this repository (unstaged diff, active task): returned `New: Add commit message generation` and three `- ` detail lines, in about 2 seconds. This run did not go through VS Code.
- A search of `src/scm/` for `else`, `continue` and `break` found only comments.

### Not verified

- The button in a real VS Code window: that it shows in the commit box, what VS Code passes to the `scm/inputBox` command (the code accepts a `Uri` or an object with `rootUri` and falls back to the Git API), the replace prompt, the progress notification and cancel. `commitMessageCommand.ts` has no automated test because it needs the VS Code API.
- `/vscode-workflow:commit-message` in Claude Code. The plugin must be registered again (run **Workflow: Register Agents and Skills with Claude Code**, then `/reload-plugins`). Only its content is tested.
- The prefix choice. One real run was checked; BC detection depends on the model.

### Remaining risks

- `--setting-sources user` still applies the user's own Claude hooks and plugins.
- Task text and reports are sent to Claude with the diff. The documentation says so.
- The Claude Code extension id (`anthropic.claude-code`) is taken from its install folder name; if it differs, only the bundled-binary fallback is lost.
