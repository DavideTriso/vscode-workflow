# AGENTS.md rules

`AGENTS.md` holds the lasting rules and facts an agent needs to work in a repository: how to build and test it, how it is structured, and the conventions and rules the team agreed on. This file says how to read it, how it is laid out, and how to add rules the user states in a prompt.

## Reading AGENTS.md

- Read `AGENTS.md` at the repository root when it exists. Also read every `AGENTS.md` in a directory that contains files you change or review, and in the directories between it and the root.
- When two files disagree, the one nearest to the changed file wins.
- Treat the content as project rules that bind your design and code. Explicit instructions from the user in this conversation take precedence.
- If the request or a selected plan conflicts with a rule, name the rule, quote it, and ask the user how to proceed before you act on that part.
- Check commands and paths it names against the repository before you rely on them. Report content that is out of date; do not fix it unless the user asks.

## Layout

Use this layout. Leave out a section that has nothing useful in it. Keep the file short; link to `docs/` pages for detail instead of copying them.

```markdown
# AGENTS.md

## Project overview
What the repository produces and its main parts, in a few sentences.

## Build and test
The exact commands to install, build, run, lint, type-check and test.

## Architecture
Main modules or layers, what each owns, and how they depend on each other.

## Conventions
Naming, file layout, formatting, error handling and test conventions that the code follows.

## Rules

### Architecture
- <Imperative rule.> <Optional one-line reason.>

### Code style
### Testing
### Process
```

Write each rule as one short imperative bullet, for example: "Keep `Utility` free of business logic. It holds only methods that are reusable across the repository and portable to other projects." Add a new `###` group under `## Rules` only when no existing group fits.

## Detecting rules in the user's prompt

Do this only when `AGENTS.md` exists at the repository root. If it does not exist, skip this section completely: do not look for rules, do not ask, do not create the file, and do not suggest creating it.

A candidate rule is a statement in the user's messages for this task that applies beyond the current change, for example:

- a must, never, only, or always statement about code, structure, tests, or process;
- an invariant of a class, module, or layer ("Utility contains only methods that are not bound to business logic");
- a reason that states a lasting policy ("because X must stay portable to other projects").

Not candidates:

- instructions that only describe this change ("move `myMethod` to `MyClass`");
- preferences that only concern this task;
- rules that `AGENTS.md` already states in the same or other words.

If a candidate contradicts a rule in `AGENTS.md`, propose to replace that rule: quote the existing rule next to the new one.

## Asking and writing

1. Finish the work of the run first. Then, if there are candidates, ask once, with all of them in one message. For each, give the proposed rule text and the target section, for example: "Your rule 'Keep `Utility` free of business logic …' seems like a general architecture rule that belongs to AGENTS.md (Rules → Architecture). Do you want me to add it?"
2. Wait for the answer. Write only the rules the user approves, in the wording they approve. If they decline or do not answer, write nothing and do not ask again in this run.
3. Add each approved rule to its section in the root `AGENTS.md`, or in the nested `AGENTS.md` the user names. Do not remove, reorder, or reword other content, except a rule the user approved to replace.
4. Read the file back and check that each approved rule is present. Tell the user which rules you added and where.
