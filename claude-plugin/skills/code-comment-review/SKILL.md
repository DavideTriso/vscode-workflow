---
name: code-comment-review
description: Reviews code comments for low value, stale or inaccurate claims, and missing explanations of intent through the code-comments subagent, and reports without editing files. Use when the user asks to check or review code comments.
---

# Code Comment Review

This skill starts the `vscode-workflow:code-comments` subagent in review mode. The subagent holds the review criteria, so do not review the comments yourself. It edits no files and writes no report under `.history/agents/`.

1. Your first action is one `Agent` tool call with `subagent_type` set to `vscode-workflow:code-comments`. The subagent cannot see this conversation, so the prompt must contain:
   - the mode: review only, no file changes;
   - the user's request and any arguments given to this skill;
   - the scope: the files or the whole repository if the user named them, otherwise the default (all comments in changed code files).
2. If the subagent cannot be started, tell the user and suggest running `/reload-plugins`. Do not run the review in this conversation instead.
3. When the subagent returns, show its findings, grouped as it returned them. If it reports a blocker, such as a missing active task, relay that and stop.
