---
name: code-readability-default
description: Review the changed code for clarity and maintainability by running the code-readability subagent, which saves readability-review.md in the active task folder, then apply the proposals the user approves.
---

# Code Readability Review

This skill starts the `vscode-workflow:code-readability` subagent. The subagent holds the review criteria and writes the report, so do not review the code yourself.

1. Your first action is one `Agent` tool call with `subagent_type` set to `vscode-workflow:code-readability`. The subagent cannot see this conversation, so the prompt must contain:
   - the user's request and any arguments given to this skill;
   - what the change is meant to do, from the conversation (say so if it is unknown);
   - the scope to review, if the user named one.
2. If the subagent cannot be started, tell the user and suggest running `/reload-plugins`. Do not run the review in this conversation instead.
3. When the subagent returns, show its numbered proposals in short form and the path of the saved `readability-review.md`. If it reports a blocker, such as a missing active task, relay that and stop.
4. Ask the user which numbered proposals to apply. Apply only those, and make no behavior changes.
5. Re-sync the recommendation set with `read_implementation_todos` and `sync_code_readability_todos`: applied items `done: true`, rejected items removed, the rest open with "pending user approval" in `remaining`. Never edit `implementation-todo.json` directly.
