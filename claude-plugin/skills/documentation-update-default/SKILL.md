---
name: documentation-update-default
description: Keep repository documentation aligned with material code, configuration, and workflow changes, following the README.md and flat docs/ structure standards.
---

# Documentation Updates

Review the complete task change, including relevant untracked files, and update the repository's canonical documentation to match verified behavior.

Read `documentation-standards.md`, located next to this SKILL.md, before you write. It defines where documentation lives (`README.md` plus a flat `docs/` directory with `developer-documentation.md` and `user-documentation.md` as index pages), which audience each page serves, and when a table of contents must be approved first.

- Document every material user-visible or maintainer-relevant change. Cover affected workflows, setup, configuration, constraints, and maintenance guidance.
- Read the changed code and relevant tests before writing. Do not infer behavior from names or task descriptions when the implementation can verify it.
- Put each change on the page for its audience: developer documentation for people who work on this code, user documentation for people who use what it produces, including developers who build on its API, library, or CLI.
- Update existing documentation instead of creating duplicates. Follow its structure, terminology, and style. New pages go directly in `docs/` and must be linked from the relevant index page or parent page.
- When the change needs a large amount of new documentation (several new pages or a major rewrite) and the user has not supplied a table of contents, propose one as described in `documentation-standards.md` and get confirmation before writing it.
- When it is unclear whether a change needs user documentation and none exists yet, ask the user instead of guessing.
- When the repository has no documentation, or its documentation does not follow the standard structure, do not restructure it as part of an update. Document the change in the existing location and recommend running `/vscode-workflow:documentation-create-default` to initialize or migrate the documentation.
- Keep examples, commands, links, and configuration references accurate. Do not claim behavior that has not been verified.
- Do not edit implementation code, tests, or configuration as part of documentation work. Report any mismatch that requires a code change.
- Avoid line-by-line narration of internal code. Explain internal changes when maintainers need the information to use or safely change the repository.
- If a change has no meaningful documentation impact, explain why in the task's documentation update record rather than inventing content.
