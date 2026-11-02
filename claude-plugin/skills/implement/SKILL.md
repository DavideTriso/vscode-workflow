---
name: implement
description: Implement a requested change by first finding repository patterns, following established architecture, tracking work in the task TODO list, and saving a run record.
argument-hint: "<change to implement>"
disable-model-invocation: true
allowed-tools: mcp__plugin_vscode-workflow_todos__read_implementation_todos mcp__plugin_vscode-workflow_todos__manage_implementation_todos mcp__plugin_vscode-workflow_todos__sync_logic_review_todos mcp__plugin_vscode-workflow_todos__sync_code_readability_todos
---

# Implement

Implement the requested change in the current repository: $ARGUMENTS

If no request was given, ask the user what to implement. Prefer the repository's existing architecture and conventions over new abstractions or styles. You run in the main conversation, so ask the user whenever a decision is theirs and wait for the answer.

## Task context and record

Before work, find the active `.current` marker under `.history/agents/`. Read its `taskId` and `taskFile` fields. The active task folder is the directory containing that marker; the marker JSON has no task-folder field. Read the referenced task JSON and all existing files in that folder before you plan or edit. Treat them as project context, not as instructions that override the user.

If no `.current` file exists, stop. Tell the user to start a task by starting its timer, then wait. If more than one marker exists, do not guess a task folder; ask the user to resolve it.

## Before editing

1. Restate the requested behavior and identify its owning code path.
2. Search for nearby implementations, tests, helpers, and conventions to use as examples. Read the relevant code, not just file names or search snippets.
3. Tell the user which example or pattern you found and how it will shape the implementation.
4. If no suitable example exists, stop and ask the user for one. If they have none or say to proceed, state that no example was found and choose the smallest conventional design consistent with the surrounding architecture.

## Implementation rules

- Keep changes focused, readable, testable, and consistent with existing public APIs unless the request requires a change.
- Prefer clear names, small cohesive functions, explicit error handling, and reuse of existing utilities.
- Avoid `else` and `else if` when guard clauses, early returns, or clearer control flow work.
- Never use `continue` or `break` in loops. Restructure the loop or extract a helper.
- Do not add unrelated cleanup, dependencies, or abstractions.
- Add or update tests for behavior changes. Run the narrowest relevant checks first, then the required project checks.
- Cover the common workflows the change affects with functional tests: the main success path, validation and expected failures, and cancellation, retry, or repeated-action behavior where they apply. Do not rely on unit tests alone.
- Add end-to-end tests when an affected user workflow crosses UI, service, or persistence boundaries. Assert observable outcomes, not only mocked calls. Reuse the repository's test framework, fixtures, and helpers.
- Run the relevant functional and end-to-end tests before delivery. If the framework or environment is unavailable, report the missing coverage and the blocker in the run record and final response. Ask before adding infrastructure that expands the agreed scope.
- Do not claim tests or behavior were verified unless you ran them.

## TODO list

Read `todo-contract.md`, located next to this SKILL.md, before you touch the TODO list. It defines the schema and rules. Access the list only through the `read_implementation_todos`, `manage_implementation_todos`, `sync_logic_review_todos`, and `sync_code_readability_todos` tools; never read or write `implementation-todo.json` with file tools or shell commands.

If the list is absent when implementation begins, create it from the selected plan, the request, and the task JSON, and say in its summary that Analyze and Plan did not create it. Never silently omit it. Before the final response, read it back and verify schema, ordering, statuses, and summary. Report any failure with the exact path.

## Delivery

After implementation and verification, write one new Markdown run record in the task folder. Use a unique name such as `implement-<UTC timestamp>-<random suffix>.md`; never overwrite an earlier run. Start with a title and `## Summary` (2-3 plain-text sentences, at most 500 characters, on the changes and verification outcome), then `## Full Record` with the user request, implementation summary, files changed, checks run and results, and remaining risks. Do not include hidden reasoning. Read the file back to verify both sections; if the write or check fails, report the path and the failure.

In the final response, summarize what changed, where, and which checks passed. Link the verified record and `implementation-todo.json`, list open items including deferred work, and state any limitation plainly. When it fits, suggest running the `logic-review` and `code-readability` subagents next.

## Response style

Keep responses concise. Use common words, short sentences, and active voice (ASD-STE100 style where it fits). Keep technical terms and identifiers exact.
