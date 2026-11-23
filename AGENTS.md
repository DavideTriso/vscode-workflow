# AGENTS.md

## Project overview

VS Code Workflow is a VS Code extension (VS Code 1.105+) that tracks tasks as JSON files under `.history/` in the user's Git repository. It registers a Claude Code plugin from `claude-plugin/` (skills, subagents and a TODO MCP server). The agents write their plans, reports and TODO lists next to each task in `.history/agents/<task id>/`.

## Build and test

```bash
npm install
npm run build      # development bundles in dist/
npm run watch      # rebuild on change
npm run typecheck  # tsconfig.json (extension) + tsconfig.webview.json (webview)
npm test           # vitest over test/**/*.test.ts
npm run package    # typecheck, test, production build, vsce package
```

- Node 20+ is required. Without Node on the host, use the `dev` service in `compose.yaml` (`node:22-bookworm`), for example `docker compose run --rm dev npm test`.
- Press F5 in VS Code (launch configuration **Run Extension**) to start an Extension Development Host.
- The Release workflow (`.github/workflows/release.yml`) runs `npm ci`, `npm run typecheck`, `npm test` and a production build.
- Details: [docs/development-process.md](docs/development-process.md).

## Architecture

- `src/extension.ts`: activation; wires the modules below.
- `src/tasks/`: task model, file storage under `.history/`, the Tasks webview host and HTML, and the TODO model and tool definitions.
- `src/ui/tasks/`: webview script (browser bundle).
- `src/claude/`: copies the Claude Code plugin into global storage and registers it.
- `src/scm/`: the Generate Commit Message button.
- `src/crypt/`: `.history` encryption with git-crypt.
- `src/mcp/`: stdio MCP server that exposes the TODO tools to Claude Code.
- `claude-plugin/`: skills, agents and `.mcp.json`.
- `test/`: vitest suites.
- `esbuild.mjs` builds three bundles in `dist/`: `extension.js`, `tasksView.js`, `mcp-server.js`.
- Details: [docs/architecture.md](docs/architecture.md).

## Conventions

- TypeScript in strict mode with `noUncheckedIndexedAccess`. 4-space indentation, single quotes.
- Tests: one vitest suite per area in `test/*.test.ts`. Webview tests use jsdom. Mirror the existing suite for the area you change.
- Documentation: a short `README.md` and a flat `docs/` directory with `developer-documentation.md` and `user-documentation.md` as index pages.

## Rules

### Architecture

- Do all reads and writes under `.history/` through `src/tasks/taskRepository.ts`.
- Import `vscode` only in the existing host files (`extension.ts`, `tasksViewProvider.ts`, `tasksWebviewHtml.ts`, `userSettings.ts`, `claudeRegistration.ts`, `commitMessageCommand.ts`, `historyEncryptionController.ts`). Keep logic that needs tests in files without `vscode`.
- Do not import Node modules in `src/crypt/historyEncryptionTypes.ts`. The webview bundle imports it.
- Declare TODO tools in `todoToolDefinitions.ts` and implement them in `todoToolOperations.ts`, with no editor or provider API. The MCP server picks them up.
- History encryption never reads or exports the private key, never commits, and never rewrites history.

### Claude plugin

- Keep one copy of a file shared by several skills, in the skill that owns it. Other skills read it at `../<owner>/<file>` relative to their base directory.
- Keep the related-tasks paragraph identical in every agent and skill that reads tasks. A test checks it.
- When you add a skill or agent, add its Quick Reference entry in `src/tasks/tasksWebviewHtml.ts`. Add a new agent report file to `outputAgents` in `src/tasks/taskProtocol.ts`.
- Rename the plugin or marketplace in `src/claude/claudePlugin.ts` and `scripts/uninstall.js` together.

### Process

- `.vscodeignore` is an allowlist. Add every new runtime file or folder to it, or it does not ship.
- Bump `version` in `package.json` for a release. Claude Code sees a plugin update through that version.
