# User documentation

VS Code Workflow keeps your tasks next to your code and guides AI coding agents through a repeatable workflow, so you stop switching between a task tracker, your editor and a chat window.

It is built for **solo developers and small development teams** who work with Claude Code. What you gain:

- **One place for tasks.** Create, search, time-track and complete tasks in the VS Code activity bar.
- **A consistent way of working.** Agents take a change from plan to implementation, review and documentation, in a fixed order.
- **History in the repository.** Tasks, plans, reviews and TODO lists are stored as files under `.history/`, so they travel with the code and give later work full context.
- **Better collaboration.** Assign tasks to teammates, link related tasks across repositories (for example backend and frontend), and let agents read the linked work.

## Quick start

1. Open a Git repository in VS Code (1.105 or newer) and click the **Tasks** icon in the activity bar.
2. Add a task, then start its timer to make it the active task.
3. In Claude Code, run a skill such as `/vscode-workflow:analyze-and-plan`.

Setup details are in [Installation and setup](installation.md).

## How to use

- [Installation and setup](installation.md): requirements, your identity, registering with Claude Code, uninstalling.
- [Working with tasks](tasks.md): creating tasks, assignees, related tasks, the timer, TODOs, completing tasks, and where data lives.
- [Skills and agents](skills-and-agents.md): the workflow order, what each agent does, and how to run them.
- [Commit messages](commit-messages.md): the Generate Commit Message button and the `commit-message` skill, with the message format.
- [History encryption](history-encryption.md): encrypt `.history` with git-crypt, share access with teammates, and unlock a clone.
- [Multi-repository projects](multi-repository.md): grouping repositories so tasks and agents can see each other's work.
- [Settings](settings.md): every setting with description, default and example.
