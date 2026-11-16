---
name: documentation-update-default
description: Keep repository documentation aligned with material code, configuration, and workflow changes by running the document subagent, which saves documentation-update.md in the active task folder.
---

# Documentation Updates

This skill starts the `vscode-workflow:document` subagent. The subagent holds the update rules and writes the record, so do not edit the documentation yourself.

The standards live in `documentation-standards.md`, located next to this SKILL.md (in the base directory shown at the top of this skill). It defines where documentation lives (`README.md` plus a flat `docs/` directory with `developer-documentation.md` and `user-documentation.md` as index pages), which audience each page serves, and when a table of contents must be approved first.

1. Your first action is one `Agent` tool call with `subagent_type` set to `vscode-workflow:document`. The subagent cannot see this conversation, so the prompt must contain:
   - the user's request and any arguments given to this skill;
   - what changed and why, from the conversation (say so if it is unknown);
   - the absolute path of `documentation-standards.md`, built from this skill's base directory;
   - any table of contents or answer the user already approved.
2. If the subagent cannot be started, tell the user and suggest running `/reload-plugins`. Do not edit the documentation in this conversation instead.
3. When the subagent returns, relay a summary of the documentation changes, the checks it ran, and the path of the saved `documentation-update.md`. If it reports a blocker, such as a missing active task, relay that and stop.
4. If it reports `Status: Awaiting Confirmation`, no documentation was changed. Show the user its table-of-contents proposal or question and wait for the answer. Then run the subagent again with the answer, and the same standards path, in the prompt.
5. When the repository has no documentation or does not follow the standard structure, the subagent documents the change where it fits and recommends `/vscode-workflow:documentation-create-default`. Pass that recommendation on to the user.
