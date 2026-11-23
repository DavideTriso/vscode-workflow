# Developer documentation

VS Code Workflow is a VS Code extension that tracks tasks as JSON files inside the Git repository you work on and registers a set of agents and skills with Claude Code. The agents follow a fixed workflow (analyze and plan, implement, test, review, document) and write their reports next to the task, so later work, by people or agents, starts with the full history of earlier changes.

The goals of the project:

- Track tasks in VS Code to reduce context switching between tools.
- Deliver consistent, high-quality code by running AI coding agents through a predefined workflow.
- Keep every change recorded in the repository as context for later implementation.
- Improve collaboration between team members, human and not.

## Quick start

Requires Node 20+ and VS Code 1.105+.

```bash
git clone https://github.com/DavideTriso/vscode-workflow.git
cd vscode-workflow
npm install
npm run build      # bundles to dist/
npm test           # vitest
npm run typecheck  # extension + webview tsconfigs
```

Open the folder in VS Code and press **F5** to launch an Extension Development Host with the extension loaded. Run `npm run watch` to rebuild on change.

## Contents

- [Architecture](architecture.md): source layout, bundles, how repository state and the Claude Code plugin work, and what to keep in sync when changing them.
- [Development process](development-process.md): from cloning the repository to building, debugging, testing and releasing.
- [Coding standard](coding-standard.md): the rules for writing TypeScript and tests in this repository. Agents and developers follow it when they write code.

For what the extension does and how it is used, see the [User documentation](user-documentation.md).
