---
name: documentation-update-default
description: Keep repository documentation aligned with material code, configuration, and workflow changes.
---

# Documentation Updates

Review the complete task change, including relevant untracked files, and update the repository's canonical documentation to match verified behavior.

- Document every material user-visible or maintainer-relevant change. Cover affected workflows, setup, configuration, constraints, and maintenance guidance.
- Read the changed code and relevant tests before writing. Do not infer behavior from names or task descriptions when the implementation can verify it.
- Update existing documentation instead of creating duplicates. Follow its structure, terminology, and style.
- Keep examples, commands, links, and configuration references accurate. Do not claim behavior that has not been verified.
- Do not edit implementation code, tests, or configuration as part of documentation work. Report any mismatch that requires a code change.
- Avoid line-by-line narration of internal code. Explain internal changes when maintainers need the information to use or safely change the repository.
- If a change has no meaningful documentation impact, explain why in the task's documentation update record rather than inventing content.