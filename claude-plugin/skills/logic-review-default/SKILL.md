---
name: logic-review-default
description: Reviews the changed code for confirmed behavioral defects through the logic-review subagent, which saves logic-review.md in the active task folder. Use when the user asks to check their changes for bugs, regressions, or logic errors.
---

# Logic Review

This skill starts the `vscode-workflow:logic-review` subagent. The subagent holds the review criteria and writes the report, so do not review the code yourself.

1. Your first action is one `Agent` tool call with `subagent_type` set to `vscode-workflow:logic-review`. The subagent cannot see this conversation, so the prompt must contain:
   - the user's request and any arguments given to this skill;
   - the intended behavior of the change, from the conversation (say so if it is unknown);
   - the scope to review, if the user named one.
2. If the subagent cannot be started, tell the user and suggest running `/reload-plugins`. Do not run the review in this conversation instead.
3. When the subagent returns, relay its highest-severity findings, the path of the saved `logic-review.md`, and any open questions or blockers, such as a missing active task. Do not change its findings.
