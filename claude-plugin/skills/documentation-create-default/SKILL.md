---
name: documentation-create-default
description: Initialize a repository's documentation (README.md and a flat docs/ directory with developer and user documentation) after the user approves a proposed table of contents.
user-invocable: true
---

# Documentation Creation

Create the documentation of a repository from scratch, or bring existing documentation into the standard structure. This is an interactive workflow: you ask the user questions and wait for their answers. Do not change implementation code, tests, or configuration. Do not write reports under `.history/agents/`.

Read `documentation-standards.md`, located next to this SKILL.md, before you start. It defines the required `README.md` and `docs/` structure, the audiences, and the table-of-contents rules. Follow it unless the user explicitly asks for something different.

## Workflow

1. **Survey the repository.** Read `README.md`, any existing documentation (`docs/`, other Markdown files, wikis checked into the repository), license files, package manifests, entry points, configuration, scripts, CI files, and tests. Understand what the repository produces, how it is built and run, and who uses it. Verify behavior from the code, not from names.
2. **Decide the audiences.** Developer documentation is always included. Decide whether user documentation is needed: does the repository produce something that end users, or other developers building on it (for example through an API, library, or CLI), use without changing this code? If the repository and the user's instructions do not make this clear, ask the user before continuing.
3. **Propose a table of contents.** Skip this step only if the user already supplied one or explicitly asked you to proceed without one. Otherwise, present the proposal described in `documentation-standards.md`: every file to create or change, arranged as a tree under the two index pages, each with its title and one or two sentences about its content. Say whether user documentation is included and why. When documentation already exists, say where each existing piece of content will move, and list any files you plan to leave in place (for example `CONTRIBUTING.md` or `CHANGELOG.md`). Size the structure to the repository: do not split a small repository into many thin pages.
4. **Wait for confirmation.** Stop and ask the user to confirm or change the proposal. Do not write documentation files until they confirm. Revise and ask again if they request changes.
5. **Write the documentation** exactly as approved:
   - Restructure `README.md` to the required sections. Move detailed README content into the appropriate `docs/` page instead of deleting it.
   - Create `docs/developer-documentation.md`, `docs/user-documentation.md` when required, and the approved pages, all directly in `docs/`.
   - Move existing documentation from subdirectories of `docs/` or other locations into the flat structure and update every link that pointed to the old paths. Use `git mv` for moved files so history is kept.
   - Document only verified behavior. Keep commands, examples, settings, and paths accurate.
   - If you discover while writing that the approved structure does not fit, stop and propose the change before continuing.
6. **Verify.**
   - `README.md` has the title and description, a `## Documentation` section listing only the approved index pages in the required order, and a `## License` section linking the license file when one exists.
   - `docs/` contains no subdirectories.
   - Every page is reachable from one of the index pages, and every relative link and anchor resolves.
   - Commands and examples match the repository; run them when practical and safe.
   - Run the repository's documentation checks (link checkers, Markdown linters) if it provides them.

## Final message

List the created, changed, moved, and removed documentation files, the checks you ran and their results, and any gaps or open questions, such as behavior you could not verify. Use short sentences and exact paths.
