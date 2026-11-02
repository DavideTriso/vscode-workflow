---
name: code-comment-review
description: Review code comments for low value, stale or inaccurate claims, and missing explanations of intent; report without editing files.
user-invocable: true
---

# Code Comment Review

Review comments only and print the report in chat. Do not edit any files or write reports under `.history/agents/`. Do not fix or report code bugs, refactor, or update repository documentation.

1. Establish the requested scope. By default, inspect staged and unstaged changes and relevant untracked code, then review all comments in each changed code file, including unchanged comments. Use a repository-wide scope when explicitly requested.
2. Read surrounding code and relevant callers to verify what each comment claims and why the code behaves that way.
3. Identify comments that repeat obvious operations rather than explain intent, outdated or imprecise claims, and missing comments on non-obvious classes, methods, functions, or other constructs.
4. Recommend comments only when they explain rationale, constraints, invariants, contracts, tradeoffs, or surprising behavior. Useful API documentation, units, and examples are not low-value merely because they describe behavior. Do not demand comments on self-explanatory code or guess intent.
5. Exclude licenses, generated comments, and tooling or runtime directives from ordinary prose cleanup.

Group findings as Low Value, Inaccurate or Outdated, and Missing Intent. For each finding, give the workspace-relative file and line, the specific comment concern, evidence, and a suggested deletion or replacement. For missing comments, reference the construct that needs explanation. State uncertainties as comment-related questions rather than inventing explanations or reporting unrelated code defects. If no improvements are justified, say so clearly.