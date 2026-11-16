# Implementation Plan: review and documentation skills always run their subagent

## Summary

Option A is selected for Logic Review, Code Readability, Document and Code Comments. Each skill becomes a short launcher that starts its subagent, so the report is always written. The review criteria and rules move into the agents, which stop loading the skills. Code Comments keeps its no-report contract.

## Full Plan

Status: Selected

### Decision

The user chose option A (launcher skill plus self-contained agent) and asked to apply it to Document and Code Comments as well. Options B (forked skill) and C (skills only) are not pursued.

### Findings that shape the plan

- Today the agents load their `*-default` or `code-comment-*` skills through the `Skill` tool. A launcher skill that starts the agent would loop, so criteria move into the agent bodies and `Skill` is removed from the agents' `tools`.
- Subagents cannot see the conversation. Every launcher must pass the user's request, the intended behavior of the change and the scope in the brief.
- `documentation-standards.md` is a shared file copied next to `documentation-create-default` and `documentation-update-default`, and a test requires identical copies and the phrase "`documentation-standards.md`, located next to this SKILL.md" in both `SKILL.md` files. An agent has no sibling files, so the Document launcher passes the absolute path of the standards file (the skill's base directory is known to the skill) in the brief and the agent reads it.
- `documentation-create-default` stays as it is: it is interactive and has no agent.
- Code Comments writes no report by contract (`code-comments` agent, `code-comment-review`, `code-comment-improve`), and `code-comments` is not in `outputAgents` (`src/tasks/taskProtocol.ts`), so it has no accordion. This plan keeps that contract: the launchers run the agent for isolation only.
- The Quick Reference test (`test/tasksWebviewHtml.test.ts`) requires the skill commands and agent names to stay in the HTML. The agent list test (`test/claudePluginContent.test.ts`) requires the four agent files. Both stay valid.

### Behavior after the change

- `/vscode-workflow:logic-review-default` and `/vscode-workflow:code-readability-default` start `vscode-workflow:logic-review` and `vscode-workflow:code-readability`. The reports `logic-review.md` and `readability-review.md` and the TODO syncs happen every time.
- `/vscode-workflow:documentation-update-default` starts `vscode-workflow:document`, which writes `documentation-update.md`. If the agent returns `Status: Awaiting Confirmation`, the skill shows the proposal or question to the user and, after the answer, starts the agent again with the answer in the brief.
- `/vscode-workflow:code-comment-review` and `/vscode-workflow:code-comment-improve` start `vscode-workflow:code-comments` in review or improve mode and relay its final message. No report file.
- Slash command names do not change. All four need an active task (the agents stop and say so otherwise).
- If the agent cannot be started, the launcher says so and does not run the review itself.
- The launcher's instruction is followed by the model and is not enforced by Claude Code.

### Step 1

**Logic Review.** Inline the criteria from `claude-plugin/skills/logic-review-default/SKILL.md` into `claude-plugin/agents/logic-review.md` (trace paths, disprove, report only evidenced defects, severity fields). Remove `Skill` from its `tools` and the sentence that loads the skill. Replace the skill body with a launcher: keep name, description and user-invocable status; first action is the `Agent` call with `subagent_type` `vscode-workflow:logic-review` and a brief containing the user's request, intended behavior from the conversation and scope; then relay the highest-severity findings and the report path.

### Step 2

**Code Readability.** Inline the criteria from `claude-plugin/skills/code-readability-default/SKILL.md` into `claude-plugin/agents/code-readability.md` and remove `Skill` from its `tools`. Replace the skill body with a launcher for `vscode-workflow:code-readability`. After the agent returns, the skill asks the user which numbered proposals to apply, applies only those, and re-syncs the TODO list (done items `done: true`, rejected items removed) with `sync_code_readability_todos`, as the agent's final message already instructs. Add that tool to the launcher's allowed use only if needed; the test that limits each agent's sync tool applies to agents, not skills.

### Step 3

**Document.** Merge the unique rules from `claude-plugin/skills/documentation-update-default/SKILL.md` into `claude-plugin/agents/document.md` (document every material change, update instead of duplicating, propose a table of contents for large changes, recommend `documentation-create-default` for missing or non-standard docs, report mismatches that need code changes) and remove `Skill` from its `tools`. The agent reads `documentation-standards.md` from the absolute path given in its brief; if no path is given it stops and says so. Replace the skill body with a launcher that keeps the sentence "`documentation-standards.md`, located next to this SKILL.md" (required by a test), passes that file's absolute path in the brief, runs `vscode-workflow:document`, and handles the `Awaiting Confirmation` loop described above. Leave `documentation-create-default` and both `documentation-standards.md` copies unchanged.

### Step 4

**Code Comments.** Inline both sets of criteria (`claude-plugin/skills/code-comment-review/SKILL.md`, `claude-plugin/skills/code-comment-improve/SKILL.md`) into `claude-plugin/agents/code-comments.md`, with the review mode as default and the improve mode when the brief asks for it, and remove `Skill` from its `tools`. Replace both skill bodies with launchers that start `vscode-workflow:code-comments` with the right mode in the brief and the requested scope, and relay the final message. Keep "never write a report under `.history/agents/`" in all three files.

### Step 5

**Texts.** Update `src/tasks/tasksWebviewHtml.ts` Quick Reference: say that each skill command starts the matching subagent and that the report appears in the task (Code Comments: no report). Keep every skill command and agent name the tests look for. Update `docs/skills-and-agents.md` (the "How to run them" and "Set up documentation" parts) and the "New agent or skill" notes in `docs/architecture.md`: launcher skills, criteria live in the agent, the documentation standards path is passed in the brief.

### Step 6

**Tests.** In `test/claudePluginContent.test.ts` add checks that: each of the five launcher skills names its `subagent_type`; none of the four agents lists `Skill` in `tools` or loads a skill by name; the `documentation-update-default` skill still contains the standards sentence; the Document agent mentions reading the standards from the brief. Keep the existing tests passing. Mirror the existing style in that file.

### Step 7

**Verification.** Run `npm run typecheck` and `npm test` (all pass). Release note for the maintainer: bump `version` in `package.json` so the plugin re-syncs, then run `/reload-plugins`. Manual check in a task: run each launcher skill once and confirm `logic-review.md`, `readability-review.md` and `documentation-update.md` appear under the task folder and in the Tasks view, the TODO groups are synced, and Code Comments returns its message without writing a file. Also run a Document case that returns `Awaiting Confirmation` and confirm the skill relays the question and re-runs.

### Edge cases

- No active task or more than one marker: the agent stops, the launcher relays the message.
- Standards path missing from the brief: the Document agent stops and reports instead of guessing.
- Agent tool unavailable or the plugin not loaded: the launcher says it cannot start the subagent and does not review inline.
- Readability proposals rejected by the user: removed from the TODO list at the re-sync.

### Open follow-up

Code Comments produces no report today. If you also want a report and a Tasks view accordion for it, that needs a new file name, an `outputAgents` entry and a changed contract; say so and I will plan it separately.
