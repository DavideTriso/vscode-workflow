---
name: code-readability-default
description: Reviews the changed code for clarity and maintainability through the code-readability subagent, which saves readability-review.md in the active task folder, then adds the proposals the user selects to the TODO list under Code Readability. Use when the user asks for a readability, clarity, or maintainability review of their changes.
allowed-tools: mcp__plugin_vscode-workflow_todos__read_implementation_todos mcp__plugin_vscode-workflow_todos__sync_code_readability_todos
---

# Code Readability Review

This skill starts the `vscode-workflow:code-readability` subagent. The subagent holds the review criteria and writes the report, so do not review the code yourself. This skill does not edit code: the user runs `/vscode-workflow:implement` to implement the selected proposals.

1. Your first action is one `Agent` tool call with `subagent_type` set to `vscode-workflow:code-readability`. The subagent cannot see this conversation, so the prompt must contain:
   - the user's request and any arguments given to this skill;
   - what the change is meant to do, from the conversation (say so if it is unknown);
   - the scope to review, if the user named one.
2. If the subagent cannot be started, tell the user and suggest running `/reload-plugins`. Do not run the review in this conversation instead.
3. When the subagent returns, show its numbered proposals as a numbered list (number, title, file) and the path of the saved `readability-review.md`. If it reports a blocker, such as a missing active task, relay that and stop. If it has no proposals, say so and stop.
4. Ask the user which numbered proposals to add to the TODO list. Accept a list of numbers, `all`, or `none`. Wait for the answer. If a number is not in the list, say so and ask again. On `none`, change nothing and stop.
5. Call `read_implementation_todos`. Then call `sync_code_readability_todos` once with the complete set:
   - every existing agent-created item with `source: "code-readability"` in the `Code Readability` group, unchanged, because the tool removes agent-created readability items missing from the call;
   - each selected proposal that is not already in the list, with `done: false`, `sourceRef` `readability-review.md#recommendation-N`, and the report fields copied into the TODO fields the report names (`title`, `files`, `why`, `decisions`, `acceptance`), `evidence: ""`, `remaining: "Not implemented"`, and `alert: null`.
   Never edit `implementation-todo.json` directly.
6. Call `read_implementation_todos` again and check that the selected items are in `Code Readability`. If the sync fails, report the error and do not claim the items were added.
7. List the added items and tell the user to run `/vscode-workflow:implement` to implement them.
