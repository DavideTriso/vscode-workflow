# Documentation Standards

These rules define where repository documentation lives and how it is organized. Follow them when creating or updating documentation, unless the user explicitly asks for something different.

## Audiences

- **Developer documentation** is for developers who work on this repository's code: setup, architecture, conventions, testing, build, release, and how to change or extend the code safely.
- **User documentation** is for anyone who uses what the repository produces without changing its code. This includes end users of an application and developers who build on the software, for example someone who calls this system's API to build a frontend, or who consumes this library or CLI.
- Developer documentation is always required. User documentation is required only when the repository produces software that has users as defined above. If you cannot tell from the repository and the user's instructions whether it has users, ask the user. Do not guess.

## README.md

`README.md` at the repository root contains, in this order:

1. A `#` title and a short description of the repository and what it does. Keep it brief; detailed content belongs in `docs/`.
2. A `## Documentation` section with a list of exactly these items, in this order, and nothing else:
   1. `[Developer documentation](docs/developer-documentation.md)`
   2. `[User documentation](docs/user-documentation.md)`, only when user documentation is required.
3. A `## License` section, only when the repository contains a license file (for example `LICENSE`, `LICENSE.md`, `LICENSE.txt`, `COPYING`, or another file that clearly holds the repository's license). It contains a link to that file.

Do not add other sections to `README.md` unless the user asks for them. Content that already lives in the README beyond this structure belongs in `docs/`; move it there instead of deleting it.

## The docs directory

- All documentation pages live directly in `docs/`. Do not create subdirectories: `docs/` is flat.
- `docs/developer-documentation.md` is the index page of the developer documentation.
- `docs/user-documentation.md` is the index page of the user documentation, and exists only when user documentation is required.
- `docs/coding-standard.md` is always required. It is a developer page, linked from `docs/developer-documentation.md`. See [Coding standard](#coding-standard).
- Organize the remaining content into further Markdown pages in `docs/` according to the repository's size, content, and the user's instructions. A small repository may need only the index pages; a larger one splits topics into separate pages.
- Hierarchy is expressed by content, not by folders. An index page links to its top-level pages; a page links to its sub-pages from the place where the topic is introduced. Every page must be reachable from one of the two index pages.
- Name pages in lowercase kebab-case after their topic (for example `docs/api-authentication.md`). When a page belongs to only one audience and the topic name alone is ambiguous, prefix it with the audience (for example `docs/developer-testing.md`, `docs/user-installation.md`).
- Each page starts with a single `#` heading and uses relative links between pages (for example `[Authentication](api-authentication.md)` inside `docs/`).
- Keep developer and user content apart. A page serves one audience. When both audiences need the same fact, write it once on the user-facing page and link to it from the developer documentation.

## Coding standard

`docs/coding-standard.md` holds all standards and preferences for writing code in the repository. Agents read it and make the code they write follow it.

- Start the page with `# Coding standard` and one sentence that says agents and developers follow it when they write code.
- Group the rules by topic, for example naming, formatting, file and module structure, error handling, comments, tests, and language idioms. Write each rule as one short imperative bullet.
- Base the default rules on the widely used style guide of the repository's main programming language. Then adjust them to what the repository already does: its formatter, linter, and editor configuration (for example `.editorconfig`, ESLint, Prettier, Ruff, or `tsconfig.json`) and the conventions the existing code follows. A rule must not contradict that configuration or the existing code. When the repository has more than one main language, add a section per language.
- The team owns this page. When it already exists, keep its rules unchanged; only make sure `docs/developer-documentation.md` links it. Change its rules only when the user asks; fixing links is allowed.

## Table of contents approval

Before creating documentation for the first time, restructuring it, or writing a large amount of new documentation (several new pages or a major rewrite), propose a table of contents and get the user's confirmation before writing. Skip the proposal only when the user already supplied a table of contents or explicitly asked you to proceed without one.

The proposal lists every file to create or change, as a tree that mirrors the index pages and the links between pages (even though `docs/` itself is flat). For each entry, give the file name, its title, and one or two sentences about what it will contain. Mark existing files that will be changed and say what changes. Also state whether user documentation is included and why.

## Writing

- Document verified behavior only. Read the code, configuration, and tests before writing; do not infer behavior from names.
- Write for the page's audience. Explain why and how to do something, not a line-by-line narration of the code.
- Keep commands, examples, paths, settings, and links accurate and runnable.
- Prefer short sections, lists, and tables over long prose. Do not repeat content across pages; link instead.
