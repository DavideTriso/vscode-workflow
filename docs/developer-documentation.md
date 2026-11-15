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
  taskModel.ts              parse/validate/filter task JSON, user formatting (`email <name>`)
  userSettings.ts           reads user identity (settings, falling back to git), team members and repository groups
  repositoryGroups.ts       parses repositoryGroups; lists linkable repositories; resolves related-task links to local paths
  taskProtocol.ts           shared types + webview <-> extension messages
  tasksViewProvider.ts      webview host: handles messages, calls the repository
  tasksWebviewHtml.ts       view HTML (incl. Quick Reference)
  implementationTodo*.ts    TODO schema, parsing, rendering
  todoToolDefinitions.ts    provider-neutral TODO tool names, descriptions and input schemas
  todoToolOperations.ts     provider-neutral TODO tool logic
src/ui/tasks/main.ts        webview script (browser bundle)
src/claude/                 Claude Code plugin sync + registration prompt/command
src/mcp/                    stdio MCP server: the Claude Code adapter for the TODO tools
claude-plugin/              agents, skills, .mcp.json for Claude Code
scripts/uninstall.js        vscode:uninstall hook; removes Claude settings entries
```

Key ideas:

- **Repository state is files.** Tasks are `.history/tasks/<id>.json` (status 0 new, 1 in progress, 2 done). Starting a timer writes `.history/agents/<id>/.current`; agents find the active task through it.
- **Related tasks** are stored in the task JSON as `relatedTasks` (`taskId`, `repositoryUrl`, `repositoryPath`, plus name snapshots). The task form loads candidates (`loadRelatedTaskCandidates`) from the current repository and from every repository sharing a `repositoryGroups` group with it, skipping tasks older than `relatedTasks.maxAgeDays` (by file-name timestamp when present, so old files are never read). When writing `.current`, `TaskRepository.startAgentTask` resolves each link to this machine's checkout, by origin URL first and then by path, and writes absolute `taskFile`/`taskFolder` paths into the marker's `relatedTasks`. Agents and skills read those paths as read-only context; keep that paragraph identical across `claude-plugin/` (a test checks it is present).
- **Three bundles** (`esbuild.mjs`): `dist/extension.js`, `dist/tasksView.js` (webview), `dist/mcp-server.js`.
- **TODO tools** are declared once in `todoToolDefinitions.ts` and implemented in `todoToolOperations.ts`, with no editor or provider API. The MCP server (`src/mcp/`) is the Claude Code adapter that exposes them; another provider would get its own adapter over the same two modules.
- **Claude plugin sync** (`claudePlugin.ts`) copies `claude-plugin/` plus `mcp-server.js` into `<globalStorage>/claude-marketplace`, stamps the extension version, pins `.mcp.json` to an absolute Node path, and enables it in Claude settings. It is idempotent and reruns on version or Node path change.

## Adding functionality

- **New task field or action:** extend types and messages in `taskProtocol.ts`, implement in `taskRepository.ts`, handle in `tasksViewProvider.ts`, render in `main.ts` / `tasksWebviewHtml.ts`. Add tests in `test/`.
- **New setting:** add it under `contributes.configuration` in `package.json`; read it in the provider and push it to the webview (see `taskSettings`).
- **New TODO tool:** add the declaration to `todoToolDefinitions.ts` and the operation to `todoToolOperations.ts`; the MCP server picks it up.
- **New agent or skill:** add it under `claude-plugin/agents` or `claude-plugin/skills`. New agent report files must be added to `outputAgents` in `taskProtocol.ts` to appear in the view. Keep the Quick Reference text in sync.
- **Claude names:** if you rename the plugin or marketplace, update `claudePlugin.ts` and `scripts/uninstall.js` together (a test checks this).
- Tests use vitest (jsdom for the webview); mirror the existing `test/*.test.ts` for the area you change.

## Build and release

1. Bump `version` in `package.json` (it is stamped into the Claude plugin so Claude Code sees the update).
2. `npm run package` runs typecheck, tests, a minified production build and `vsce package`, producing `vscode-extension-starter-<version>.vsix`.
3. Smoke test: install the `.vsix` (`code --install-extension <file>`), open a repo, create a task, and for Claude run the register command.
4. Publish with `npx vsce publish` (needs the `davidetriso` publisher token) or upload the `.vsix` to a release.

`.vscodeignore` is an allowlist: new runtime folders must be added there or they will not ship.
