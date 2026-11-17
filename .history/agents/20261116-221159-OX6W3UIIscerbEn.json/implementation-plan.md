# Commit solutions: implementation plan

## Summary

Add a `commit-message` interactive skill that proposes a commit message and never commits. Add a "Generate Commit Message" button to the Source Control input box that runs the Claude Code CLI headlessly on the diff and fills the box. Both share one rules file so the messages stay consistent.

## Full Plan

Status: Selected

### Selected decisions

- D1: the button spawns the Claude Code CLI headlessly (`claude -p`, no tools). No new dependency.
- D2: propose a message only. Nothing in this task runs `git commit`, stages files, pushes, or amends.
- D3: one interactive, user-invoked skill named `commit-message` (`disable-model-invocation: true`). No subagent.
- D4 (not answered; the recommendation is assumed, tell me to change it): the message rules live in one file, `claude-plugin/skills/commit-message/commit-message-rules.md`. The skill reads it next to its SKILL.md. The extension reads it at runtime from `<extensionPath>/claude-plugin/...`; `.vscodeignore` already ships `claude-plugin/**`.

### Evidence from the repository

- `src/extension.ts` only registers the tasks view and Claude registration. There is no SCM code or `scm/*` menu.
- Git calls use `execFile('git', ...)` in `src/tasks/taskRepository.ts`. The `vscode.git` API is not used anywhere.
- Nothing in `src/` launches the Claude CLI.
- `claude` is not on PATH here. The Claude Code VS Code extension ships `resources/native-binary/claude` in its folder, and the folder name contains the version.
- Verified CLI flags: `-p/--print`, `--model`, `--output-format`, `--tools`, `--disallowedTools`, `--no-session-persistence`, `--system-prompt`, `--setting-sources`, `--disable-slash-commands`, `--bare`.
- `test/claudePluginContent.test.ts` checks every skill's frontmatter and folder name, and that interactive skills have `disable-model-invocation: true` (only for a hard-coded list).
- `docs/skills-and-agents.md` says "seven agents and a documentation skill" and has a table of agents.
- Commit history style is short and informal ("New: ...", "Fix", "Ref: ...").

### Risks

1. CLI discovery can fail. The command must show a clear error and name the setting that fixes it.
2. A model call takes seconds: show progress and support cancellation.
3. Large or sensitive diffs: cap the size, exclude lock and binary files, and document that the diff goes to Claude.
4. Existing text in the box must not be replaced silently.
5. A spawned `claude -p` must not load project hooks, MCP servers, or skills. Use `--tools ""`, `--no-session-persistence`, `--disable-slash-commands`, and restricted `--setting-sources`. Confirm the exact flags against `claude --help` while implementing.
6. Multi-root workspaces: use the repository passed to the command by the `scm/inputBox` menu.

### Step 1: Shared message rules

Create `claude-plugin/skills/commit-message/commit-message-rules.md`. Contents: derive tone and prefix style from recent `git log` subjects, imperative subject of about 72 characters or fewer, a body only when the why is not obvious, no trailing period, plain text only, and output only the message. State that the skill and the button must never add attribution lines.

### Step 2: The `commit-message` skill

Create `claude-plugin/skills/commit-message/SKILL.md` with frontmatter `name: commit-message`, a description saying it proposes a message and does not commit, and `disable-model-invocation: true`.

Behavior:
1. Read `git status --short`, `git diff --cached`, and `git diff`. Prefer the staged diff. When nothing is staged, use the unstaged diff and say so.
2. Read `commit-message-rules.md` next to SKILL.md.
3. Print the proposed message in a fenced block.
4. State explicitly that nothing was committed.
5. Edge cases: no changes, merge in progress, huge diff (summarize by file).

### Step 3: Extension, CLI resolution

Create `src/scm/claudeCli.ts`. Resolve the executable in this order: the setting `vscode-workflow.commitMessage.claudePath`, `claude` on PATH, then the newest `anthropic.claude-code-*/resources/native-binary/claude` under the extensions folder. Return a clear error naming the setting when none is found. Keep the lookup functions pure and injectable for tests.

### Step 4: Extension, generator

Create `src/scm/commitMessageGenerator.ts`:
- gather the staged diff (fallback to unstaged) and the last 15 commit subjects through `execFile('git', ...)` in the repository root;
- exclude lock files and binaries, and cap the diff at `vscode-workflow.commitMessage.maxDiffChars` (default 60000), appending a truncation notice;
- build the prompt from the rules file and the diff;
- run the CLI with the restricted flags, honor an `AbortSignal`, apply a timeout, and return the trimmed message;
- throw typed errors for: no changes, CLI missing, CLI failure, empty output.

### Step 5: Extension, command and menu

Create `src/scm/commitMessageCommand.ts`, register `vscode-workflow.generateCommitMessage` from `src/extension.ts`. It takes the `vscode.SourceControl` argument, uses `rootUri`, and shows `withProgress` with cancel in the SCM view. It writes the result to `sourceControl.inputBox.value` through the built-in `vscode.git` API. If the box already has text, ask whether to replace it. Update `package.json`: the command (title "Generate Commit Message" with an icon), a `scm/inputBox` menu entry, and the three settings (`claudePath`, `maxDiffChars`, optional `model`).

### Step 6: Tests

- `test/claudePluginContent.test.ts`: add `commit-message` to the interactive skill list, assert it contains the "does not commit" statement, and assert the rules file exists.
- `test/commitMessageGenerator.test.ts`: prompt building, truncation, lock-file exclusion, CLI argument list (including `--tools ""`), error cases, and abort handling (with a fake runner).
- `test/claudeCli.test.ts`: resolution order, newest-version selection, and the missing-CLI error.

### Step 7: Documentation

Update `docs/skills-and-agents.md` (add the skill, fix the counts and table), `docs/settings.md` (three settings), `docs/user-documentation.md` (the button and the privacy note), and `docs/developer-documentation.md` or `docs/architecture.md` (the `src/scm` module and the shared rules file). Check the README feature list.

### Verification (planned, none run yet)

- `npm run typecheck` and `npm test` pass, including the new tests.
- Manual, in the Extension Development Host:
  - the button shows in the Source Control input box;
  - it fills the box for staged changes, and for unstaged changes when nothing is staged;
  - it shows a clear error when the CLI is missing;
  - cancel works and existing text is not lost;
  - the spawned CLI loads none of the workspace hooks or MCP servers.
- Manual: `/vscode-workflow:commit-message` prints a message and leaves `git log` unchanged.

## Proposed revision 1: task context and fixed message format

Status: Selected (Q1 answered: option A, the button uses the task context too. This revision amends steps 1, 2, 4, 6 and 7 of the plan above and adds a task-context reader.)

### Requested change

1. The skill must use the task name, the task description and all AI-generated report files, not only the code diff.
2. Fixed message format:
   - starts with one of `BC` (breaking change), `New` (new, no breaking change), `Ref` (refactoring), `Fix` (bug fix), `Doc` (documentation only: Markdown and/or code comments);
   - then a short summary of a few words;
   - details only when really necessary, as a list with one `- ` entry per line.

### Repository findings (verified)

- `.history/` is committed (`git ls-files .history` lists reports and `implementation-todo.json`; it is not ignored). Every task adds or changes files there, so a raw diff is dominated by task records.
- A task folder holds `implementation-plan.md`, `implementation-todo.json`, and, depending on the workflow, `debug-report.md`, `implement-<timestamp>-<id>.md`, `logic-review.md`, `readability-review.md`, `documentation-update.md`. Names vary, so the skill should read every `*.md` in the folder.
- The marker `.history/agents/<taskId>/.current` carries `taskId` and `taskFile`; the task JSON has `name` and `description`. `TaskRepository.listAgentTaskMarkers` (`src/tasks/taskRepository.ts:806`) already lists markers.
- The TODO JSON must be read only through `read_implementation_todos` (todo-contract). It is progress state, not a report, so it is not needed for the message.
- Existing history already uses the prefix style `New: ...`, `Ref: ...`, `Fix`, so the format is `<Prefix>: <summary>`. `Doc` is new; older commits use "Documentation".

### Changes to the selected plan

- **Step 1 (rules file).** Replace "derive tone and prefix from git log" with the fixed format above. Add selection rules for the prefix when a change mixes kinds, in this priority: `BC`, then `New`, then `Fix`, then `Ref`, then `Doc`. `Doc` only when no executable code changed. Summary of a few words, no trailing period. Details only when the summary alone would mislead; each line starts with `- `. Output only the message; no attribution lines.
- **Step 2 (skill).** Add a context step before the diff step:
  1. Find the single `.current` marker; read the task JSON for `name` and `description`; read every `*.md` in the task folder. If there is no marker, or more than one, say so and use the diff alone.
  2. Exclude `.history/` from the diff and treat it as context instead; otherwise the record files drown the real change.
  3. The diff decides what this commit contains. Task text and reports explain intent and the type of change. When a report describes work that is not in the diff (an earlier commit or unfinished work), ignore that part.
  4. The task covers many commits, so the message describes this change set, not the whole task.
- **Step 4 (generator, now in scope).** Add a task-context reader `src/scm/taskContext.ts`: locate the marker, read task name and description and the `*.md` reports (cap each file and the total), and add them to the prompt. Exclude `.history/**` from the diff. Without a unique marker, fall back to diff only.
- **Step 6 (tests).** Assert the rules file lists all five prefixes and the `- ` detail format, and that the skill reads the task JSON and the reports and excludes `.history/`. If the button uses task context: unit tests for the context reader (no marker, two markers, caps) and for the prompt.
- **Step 7 (docs).** Document the format, the five prefixes, and that task text and reports are sent to Claude along with the diff.

### Risks added

- Report files can be long and stale: cap the size, and let the diff win.
- Task descriptions and reports may contain sensitive text, which goes to the model for both the skill and (if chosen) the button.
- The prefix choice (`BC` versus `New`) is a judgment call. The message cannot prove a breaking change, so the model may under-report one. The skill should look for removed or renamed public settings, commands, file formats and schemas, and say when it is unsure.

### Open question

**Q1. Should the Source Control button use the task context too?** Answered: A. The text below is kept as the record.

- A (recommended). Yes. The extension reads the task name, description and reports and adds them to the prompt, with the same format rules. The skill and the button then give the same kind of message. The cost is one new module and its tests.
- B. No. The button works from the diff only and applies the same format rules. It is simpler and sends less to the model, but the button's messages will often be less accurate and may differ from the skill's.
