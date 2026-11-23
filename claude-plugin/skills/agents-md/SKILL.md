---
name: agents-md
description: Create or update the repository's AGENTS.md (build and test commands, architecture, conventions, and rules) after the user approves the proposal, and offer to import it from CLAUDE.md.
argument-hint: "[what to add or change]"
disable-model-invocation: true
---

# AGENTS.md

Create or update `AGENTS.md` at the repository root: $ARGUMENTS

This is an interactive workflow: you ask the user questions and wait for their answers. It does not need an active task and writes no report under `.history/agents/`. Change only `AGENTS.md` and, with approval, `CLAUDE.md`. Do not change source, tests, configuration, or other documentation.

Read `agents-md-rules.md`, located next to this SKILL.md, before you start. It defines the layout of `AGENTS.md` and how rules are written. Follow it unless the user asks for something different.

## Workflow

1. **Survey the repository.** Read `AGENTS.md` and `CLAUDE.md` if present, `README.md`, `docs/` (including `docs/coding-standard.md`), package manifests, build and test scripts, CI files, lint and format configuration, test setup, and other agent instruction files such as `.github/copilot-instructions.md` and `.cursor/rules`. Read enough source to describe the main modules and the conventions the code follows. Verify every command and path from the repository, not from names.
2. **Choose the mode.**
   - **Create** when `AGENTS.md` does not exist. Propose the content: each section from `agents-md-rules.md` you plan to write, with one or two lines about what it will contain, and the commands you verified. Say which existing instruction files you took content from.
   - **Update** when `AGENTS.md` exists. Compare it with the repository. Propose a numbered list of changes: out-of-date or wrong commands, paths, and structure; missing sections; a missing link to `docs/coding-standard.md`; content the user asked for in the request.
   - In both modes, when `docs/coding-standard.md` exists, `## Conventions` links it and states that code the agent writes must follow the coding standard in that file, as `agents-md-rules.md` shows. Do not copy its rules into `AGENTS.md`. List each rule of `AGENTS.md` that conflicts with it as a proposal item, with the fix you suggest. Keep every rule. Propose to remove or reword a rule only when it contradicts the code or the user asked, and give the reason.
3. **Wait for approval.** Stop and ask the user to confirm or change the proposal. Do not write until they confirm. In update mode, apply only the numbered items they approve.
4. **Write `AGENTS.md`.** Use the layout and rule style from `agents-md-rules.md`. Keep it short and factual; link to `docs/` pages for detail. Document only verified commands and behavior.
5. **Offer the `CLAUDE.md` import.** Claude Code loads `CLAUDE.md` automatically but not `AGENTS.md`. If `CLAUDE.md` has no line that is exactly `@AGENTS.md`, ask whether to add it: at the top of the existing `CLAUDE.md`, or as a new `CLAUDE.md` that contains only that line. Write only after a yes. Do not move or copy other content between the two files. If the line is already present, do not ask.
6. **Verify.** Read the written files back. Check that every command and path in `AGENTS.md` exists in the repository, and that the sections follow the approved proposal.

## Final message

List the files you created or changed, the sections you wrote or updated, the checks you ran, and any open questions, such as commands you could not verify. Use short sentences and exact paths.
