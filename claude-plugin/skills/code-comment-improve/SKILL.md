---
name: code-comment-improve
description: Improves low-value, inaccurate, or missing code comments without changing executable code, through the code-comments subagent in improve mode. Use when the user asks to fix, clean up, or add code comments.
disable-model-invocation: true
---

# Code Comment Improvement

This skill starts the `vscode-workflow:code-comments` subagent in improve mode. The subagent holds the improvement rules and applies safe comment-only edits without asking per comment, so do not edit the comments yourself. It writes no report under `.history/agents/`.

1. Your first action is one `Agent` tool call with `subagent_type` set to `vscode-workflow:code-comments`. The subagent cannot see this conversation, so the prompt must contain:
   - the mode: the user explicitly asks for comment improvements, so it applies comment-only edits;
   - the user's request and any arguments given to this skill;
   - the scope: the files or the whole repository if the user named them, otherwise the default (all comments in changed code files).
2. If the subagent cannot be started, tell the user and suggest running `/reload-plugins`. Do not edit the comments in this conversation instead.
3. When the subagent returns, relay the list of comments it changed, the checks it ran, and any comment-related gaps. If it reports a blocker, such as a missing active task, relay that and stop.
