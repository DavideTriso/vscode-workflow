# Developer documentation

## Get started

```bash
npm install
npm run build      # bundles to dist/
npm test           # vitest
npm run typecheck  # extension + webview tsconfigs
```

Press **F5** (see `.vscode/launch.json`) to launch an Extension Development Host. `npm run watch` rebuilds on change. Requires Node 20+.

## Architecture

```
src/extension.ts            activation: wires everything below
src/tasks/                  task domain + Tasks view
  taskRepository.ts         all file I/O under .history/ (tasks, .current marker, TODO json)
  taskModel.ts              parse/validate/filter task JSON
  taskProtocol.ts           shared types + webview <-> extension messages
  tasksViewProvider.ts      webview host: handles messages, calls the repository
  tasksWebviewHtml.ts       view HTML (incl. Quick Reference)
  implementationTodo*.ts    TODO schema, parsing, rendering
  todoToolOperations.ts     TODO tool logic, shared by Copilot and MCP
src/ui/tasks/main.ts        webview script (browser bundle)
src/claude/                 Claude Code plugin sync + registration prompt/command
src/mcp/                    stdio MCP server exposing the TODO tools to Claude Code
github-copilot/             agents + skills for Copilot (registered in package.json)
claude-plugin/              agents, skills, .mcp.json for Claude Code
scripts/uninstall.js        vscode:uninstall hook; removes Claude settings entries
```

Key ideas:

- **Repository state is files.** Tasks are `.history/tasks/<id>.json` (status 0 new, 1 in progress, 2 done). Starting a timer writes `.history/agents/<id>/.current`; agents find the active task through it.
- **Three bundles** (`esbuild.mjs`): `dist/extension.js`, `dist/tasksView.js` (webview), `dist/mcp-server.js`.
- **TODO tools** are declared once in `package.json` `contributes.languageModelTools`. VS Code registers them for Copilot (`implementationTodoTools.ts`); the MCP server reads the same declarations and drops the `vscode-workflow_` prefix. Both call `todoToolOperations.ts`.
- **Claude plugin sync** (`claudePlugin.ts`) copies `claude-plugin/` plus `mcp-server.js` into `<globalStorage>/claude-marketplace`, stamps the extension version, pins `.mcp.json` to an absolute Node path, and enables it in Claude settings. It is idempotent and reruns on version or Node path change.

## Adding functionality

- **New task field or action:** extend types and messages in `taskProtocol.ts`, implement in `taskRepository.ts`, handle in `tasksViewProvider.ts`, render in `main.ts` / `tasksWebviewHtml.ts`. Add tests in `test/`.
- **New setting:** add it under `contributes.configuration` in `package.json`; read it in the provider and push it to the webview (see `taskSettings`).
- **New TODO tool:** add the declaration to `languageModelTools`, the operation to `todoToolOperations.ts`; both Copilot and MCP pick it up.
- **New agent or skill:** add the file to `github-copilot/` and register it in `package.json` (`chatAgents` / `chatSkills`); add the Claude variant under `claude-plugin/agents` or `claude-plugin/skills`. New agent report files must be added to `outputAgents` in `taskProtocol.ts` to appear in the view. Keep the Quick Reference text in sync.
- **Claude names:** if you rename the plugin or marketplace, update `claudePlugin.ts` and `scripts/uninstall.js` together (a test checks this).
- Tests use vitest (jsdom for the webview); mirror the existing `test/*.test.ts` for the area you change.

## Build and release

1. Bump `version` in `package.json` (it is stamped into the Claude plugin so Claude Code sees the update).
2. `npm run package` runs typecheck, tests, a minified production build and `vsce package`, producing `vscode-extension-starter-<version>.vsix`.
3. Smoke test: install the `.vsix` (`code --install-extension <file>`), open a repo, create a task, and for Claude run the register command.
4. Publish with `npx vsce publish` (needs the `davidetriso` publisher token) or upload the `.vsix` to a release.

`.vscodeignore` is an allowlist: new runtime folders must be added there or they will not ship.
