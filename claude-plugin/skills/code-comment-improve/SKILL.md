---
name: code-comment-improve
description: Review code comments and autonomously improve low-value, inaccurate, or missing comments without changing executable code.
user-invocable: true
---

# Code Comment Improvement

When explicitly invoked or when the user requests comment improvements, review and apply safe comment-only changes autonomously. Do not ask for approval for each change. Do not fix or report code bugs, refactor, or update repository documentation. Never write reports or summaries under `.history/agents/`.

1. Establish the requested scope. By default, inspect staged and unstaged changes and relevant untracked code, then inspect all comments in each changed code file. Review the whole repository only when requested. Preserve existing user changes.
2. Read surrounding code and relevant callers to identify comments that merely repeat clear operations, stale or imprecise claims, and missing explanations on non-obvious classes, methods, functions, or other constructs.
3. Remove redundant narration, correct claims supported by the current code, and add concise explanations of verified rationale, constraints, invariants, contracts, tradeoffs, or surprising behavior. Preserve useful API documentation, units, and examples. Do not add comments to every declaration or invent intent; leave uncertain comments unchanged and mention the uncertainty in chat.
4. Edit only ordinary comment text. Preserve executable code, string literals, documentation strings with runtime meaning, licenses, generated content, suppression comments, and tooling or runtime directives. Avoid changing comment boundaries, syntax, or placement in ways that could affect execution or tooling. Do not run formatters that rewrite unrelated code.
5. Inspect the resulting diff to confirm that your edits affect comments only. Run narrow syntax, type, or documentation checks when needed to catch malformed comments or documentation tags. Do not claim checks passed unless run; report only comment-related verification limits.

Summarize the comment improvements and checks in chat, with affected file references and any comment-related gaps. Do not create a report file anywhere.