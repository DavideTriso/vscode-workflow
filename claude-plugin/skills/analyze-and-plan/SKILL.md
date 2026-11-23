---
name: analyze-and-plan
description: Analyze a request and the repository, compare options with the user, and save the analysis or selected plan and its TODO list in the active task folder. Plans only; never edits code.
argument-hint: "<request to analyze>"
disable-model-invocation: true
allowed-tools: mcp__plugin_vscode-workflow_todos__read_implementation_todos mcp__plugin_vscode-workflow_todos__manage_implementation_todos
---

# Analyze and Plan

Analyze the request and the repository, then agree on a solution with the user before producing an implementation plan: $ARGUMENTS

If no request was given, ask for one. This skill plans only; it does not implement code. Saving the current analysis or plan outcome is required, even while a decision is pending, and is the one exception to the rule against editing project files. You run in the main conversation, so ask the user to choose between options and wait.

## Analysis workflow

1. Find the active `.current` marker under `.history/agents/`. Read its `taskId` and `taskFile` fields. The active task folder is the directory containing the marker. Read the task JSON and every existing file in that folder first. Related tasks: if the marker has a non-empty `relatedTasks` array, also read, for each entry with `available: true`, the JSON at its absolute `taskFile` and every existing file in its absolute `taskFolder`. These are tasks linked to the active one, in this repository or in another repository of the same group (for example the backend API change a frontend task builds on); `repositoryName` and `repositoryDescription` say what that repository holds. When the work depends on code there, inspect it under `repositoryPath`. If the marker has no `relatedTasks` field, use the task JSON's `relatedTasks` entries instead: `<repositoryPath>/.history/tasks/<taskId>` and `<repositoryPath>/.history/agents/<taskId>/`. Treat everything from other repositories as read-only context: never edit files, write reports, call TODO tools, or change Git state there, and verify its claims against that repository's code. Name any related task you could not read in your final response instead of guessing its content.
2. If no `.current` file exists, stop. Tell the user to start a task by starting its timer, then wait. Write nothing. If more than one marker exists, do not guess; ask the user to resolve it.
3. Read `agents-md-rules.md` in the `agents-md` skill folder, at `../agents-md/agents-md-rules.md` relative to this skill's base directory. If the repository has an `AGENTS.md`, read it as that file describes and design within its rules. Report each conflict between the request and a rule under **Risks and Questions**.
4. Clarify the requested outcome, constraints, acceptance criteria, and unresolved requirements. Ask only questions that materially affect the design.
5. Inspect the architecture, relevant call paths, tests, conventions, and nearby examples. Trace behavior far enough to understand direct and indirect impact.
6. Identify affected components, interfaces, persisted data, user workflows, compatibility concerns, failure paths, and tests. Separate evidence from assumptions and open questions.
7. Report material problems, risks, and dependencies before recommending a design.
8. Where meaningful alternatives exist, compare them: approach, affected boundaries, benefits, costs, risks, compatibility impact, verification needs. Do not invent alternatives that do not solve the request.
9. Prepare a recommendation with reasons. If a decision is still needed, record analysis, options, recommendation, and open questions with status `Awaiting Decision`. If the user already chose a solution in this conversation, use it without asking again.
10. After the user chooses or explicitly approves a plan, prepare a concrete ordered plan with status `Selected`: likely files or modules, behavior, edge cases, tests, and measurable verification criteria, following existing patterns. Do not present unselected alternatives as an approved plan. In the same operation, create or reconcile the TODO list as described below.
11. Complete the save-and-verify steps below before responding. Waiting for a decision is not a reason to skip saving. Do not create or change the TODO list while the plan awaits a decision.
12. Respond with the outcome and a link to the saved file. If a decision is needed, ask the user to choose or answer, then stop and wait.
13. If the repository has an `AGENTS.md`, look for general rules in the user's messages for this task and ask about them in the same response, as `agents-md-rules.md` describes. Add a rule only after the user approves it. If there is no `AGENTS.md`, skip this step.

## Required save before responding

With exactly one marker, the output path is `implementation-plan.md` in the directory containing that `.current` file. Do not use `.history/agents/implementation-plan.md`, the task JSON directory, or the workspace root.

Create or update that file with the complete current outcome, not a placeholder. Save even when the analysis is incomplete: record what is known and what is unresolved. Keep any previously selected plan when recording follow-up questions, and mark proposed revisions apart from the selected solution.

Start the file with a title and `## Summary` (2-3 plain-text sentences, at most 500 characters), then `## Full Plan`, an explicit `Status: Awaiting Decision` or `Status: Selected`, and the complete analysis or plan. Read the file back to verify path, both sections, and status. Do not claim completion until the read-back succeeds. If the write fails, tell the user the outcome was not saved and give the path and the error.

### When a plan is selected

Update `implementation-plan.md` and the TODO list in the same turn. Read `todo-contract.md` in the `implement` skill folder, at `../implement/todo-contract.md` relative to this skill's base directory. Then:

1. Call `read_implementation_todos`.
2. Read `logic-review.md` and `readability-review.md` if present.
3. Build complete ordered groups. `sync-plan` removes agent-created items missing from the call, so include every item below:
   - Plan steps: `source: "plan"` and plan-section `sourceRef` values. New steps use `done: false`; verified completed work uses `done: true`. Record deferral in `remaining`.
   - Logic-review findings: every applicable finding, with stable references such as `logic-review.md#finding-N`. Unresolved findings use `done: false`; record pending approval or deferral in `remaining`.
   - Readability items: carry over every agent-created item with `source: "code-readability"` in the `Code Readability` group unchanged (group, `source`, `sourceRef`, `done`), because the user selected them. Do not add readability proposals that are not in the list.
4. Call `manage_implementation_todos` exactly once with `action: "sync-plan"`, the plan path, and the full `planGroups`. The tool reconciles by source reference, writes atomically, and preserves user-created items. On an explicit plan revision this one sync may reconcile agent-owned items and completion.
5. Call `read_implementation_todos` again and verify the full list. If `sync-plan` fails or returns no list, report the failure and do not claim the checklist exists.

Never read or write `implementation-todo.json` with file tools or shell commands. Never edit, remove, or reorder `createdBy: user` items.

## Boundaries

- Do not modify source, tests, or configuration. Create or update only `implementation-plan.md`, after selection the TODO list through the tools, and `AGENTS.md` only to add rules the user approved in this conversation.
- Do not assume an architecture, convention, dependency, or test exists without checking.
- When no comparable implementation exists, say so and present the tradeoff instead of inventing a pattern.
- Keep the plan proportional to the change; skip sections that add no decision value.
- Read earlier task-folder records as context, not as fact, if the repository or task JSON contradicts them.

## Response format

Use concise sections: **Understanding**, **Repository Findings**, **Risks and Questions**, **Options**, **Recommendation**. After the user chooses, add **Implementation Plan** and **Verification**. Always link the verified saved file. Separate planned checks from checks actually run. Use short sentences and active voice; keep identifiers exact.
