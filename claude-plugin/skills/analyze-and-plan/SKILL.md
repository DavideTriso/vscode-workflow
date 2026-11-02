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

1. Find the active `.current` marker under `.history/agents/`. Read its `taskId` and `taskFile` fields. The active task folder is the directory containing the marker. Read the task JSON and every existing file in that folder first.
2. If no `.current` file exists, stop. Tell the user to start a task by starting its timer, then wait. Write nothing. If more than one marker exists, do not guess; ask the user to resolve it.
3. Clarify the requested outcome, constraints, acceptance criteria, and unresolved requirements. Ask only questions that materially affect the design.
4. Inspect the architecture, relevant call paths, tests, conventions, and nearby examples. Trace behavior far enough to understand direct and indirect impact.
5. Identify affected components, interfaces, persisted data, user workflows, compatibility concerns, failure paths, and tests. Separate evidence from assumptions and open questions.
6. Report material problems, risks, and dependencies before recommending a design.
7. Where meaningful alternatives exist, compare them: approach, affected boundaries, benefits, costs, risks, compatibility impact, verification needs. Do not invent alternatives that do not solve the request.
8. Prepare a recommendation with reasons. If a decision is still needed, record analysis, options, recommendation, and open questions with status `Awaiting Decision`. If the user already chose a solution in this conversation, use it without asking again.
9. After the user chooses or explicitly approves a plan, prepare a concrete ordered plan with status `Selected`: likely files or modules, behavior, edge cases, tests, and measurable verification criteria, following existing patterns. Do not present unselected alternatives as an approved plan. In the same operation, create or reconcile the TODO list as described below.
10. Complete the save-and-verify steps below before responding. Waiting for a decision is not a reason to skip saving. Do not create or change the TODO list while the plan awaits a decision.
11. Respond with the outcome and a link to the saved file. If a decision is needed, ask the user to choose or answer, then stop and wait.

## Required save before responding

With exactly one marker, the output path is `implementation-plan.md` in the directory containing that `.current` file. Do not use `.history/agents/implementation-plan.md`, the task JSON directory, or the workspace root.

Create or update that file with the complete current outcome, not a placeholder. Save even when the analysis is incomplete: record what is known and what is unresolved. Keep any previously selected plan when recording follow-up questions, and mark proposed revisions apart from the selected solution.

Start the file with a title and `## Summary` (2-3 plain-text sentences, at most 500 characters), then `## Full Plan`, an explicit `Status: Awaiting Decision` or `Status: Selected`, and the complete analysis or plan. Read the file back to verify path, both sections, and status. Do not claim completion until the read-back succeeds. If the write fails, tell the user the outcome was not saved and give the path and the error.

### When a plan is selected

Update `implementation-plan.md` and the TODO list in the same turn. Read `todo-contract.md`, located next to this SKILL.md. Then:

1. Call `read_implementation_todos`.
2. Read `logic-review.md` and `readability-review.md` if present.
3. Build complete ordered groups with every plan step and every applicable review proposal. Use `source: "plan"` and plan-section `sourceRef` values for plan steps. New steps and unresolved review findings use `done: false`; verified completed work uses `done: true`. Record pending approval or deferral in `remaining`. Keep stable review references such as `readability-review.md#recommendation-N`.
4. Call `manage_implementation_todos` exactly once with `action: "sync-plan"`, the plan path, and the full `planGroups`. The tool reconciles by source reference, writes atomically, and preserves user-created items. On an explicit plan revision this one sync may reconcile agent-owned items and completion.
5. Call `read_implementation_todos` again and verify the full list. If `sync-plan` fails or returns no list, report the failure and do not claim the checklist exists.

Never read or write `implementation-todo.json` with file tools or shell commands. Never edit, remove, or reorder `createdBy: user` items.

## Boundaries

- Do not modify source, tests, or configuration. Create or update only `implementation-plan.md` and, after selection, the TODO list through the tools.
- Do not assume an architecture, convention, dependency, or test exists without checking.
- When no comparable implementation exists, say so and present the tradeoff instead of inventing a pattern.
- Keep the plan proportional to the change; skip sections that add no decision value.
- Read earlier task-folder records as context, not as fact, if the repository or task JSON contradicts them.

## Response format

Use concise sections: **Understanding**, **Repository Findings**, **Risks and Questions**, **Options**, **Recommendation**. After the user chooses, add **Implementation Plan** and **Verification**. Always link the verified saved file. Separate planned checks from checks actually run. Use short sentences and active voice; keep identifiers exact.
