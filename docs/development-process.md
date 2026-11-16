# Development process

## 1. Set up

Prerequisites: Git, Node 20+ (the CI and the dev container use Node 22), VS Code 1.105+.

```bash
git clone https://github.com/DavideTriso/vscode-workflow.git
cd vscode-workflow
npm install
```

A dev container definition is available in `compose.yaml` (`node:22-bookworm`, runs `npm ci` and stays up).

## 2. Build

| Command | Result |
| --- | --- |
| `npm run build` | Development bundles with source maps in `dist/` |
| `npm run watch` | Same, rebuilt on every change |
| `node esbuild.mjs --production` | Minified bundles without source maps |
| `npm run typecheck` | `tsc --noEmit` for `tsconfig.json` (extension) and `tsconfig.webview.json` (webview) |

`dist/` is git-ignored. The three bundles are described in [Architecture](architecture.md#bundles).

## 3. Run and debug in VS Code

1. Run `npm run watch` in a terminal, or `npm run build` once.
2. Open the repository in VS Code and press **F5** (launch configuration **Run Extension** in `.vscode/launch.json`). An Extension Development Host window opens with the extension loaded from this folder.
3. In that window, open a folder that is a Git repository and click the **Tasks** icon in the activity bar. Create a task and start its timer.
4. To try the Claude Code integration, run **Workflow: Register Agents and Skills with Claude Code** from the Command Palette. This copies the plugin into the extension's global storage and enables it in your real Claude Code settings. Then run `/reload-plugins` in Claude Code and check that `/mcp` lists `plugin:vscode-workflow:todos` as connected. Set `vscode-workflow.claudeCode.registration` to `disabled` in the development host to avoid touching Claude Code settings.
5. Set breakpoints in `src/` (extension host code) in the original VS Code window. After a code change, reload the development host (**Developer: Reload Window**, or restart the debug session). The webview script (`src/ui/tasks/main.ts`) can be inspected with **Developer: Open Webview Developer Tools** in the development host.

## 4. Test

```bash
npm test
```

Runs vitest (`vitest run`) over `test/*.test.ts`. The webview tests run in jsdom. Mirror the existing suite for the area you change:

| Area | Tests |
| --- | --- |
| Task model, validation, related tasks | `taskModel.test.ts`, `relatedTasks.test.ts` |
| File storage under `.history/` | `taskRepository.test.ts` |
| Tasks view host and HTML | `tasksViewProvider.test.ts`, `tasksWebviewHtml.test.ts`, `tasksWebview.test.ts` |
| TODO model and MCP server | `implementationTodo.test.ts`, `todoMcpServer.test.ts` |
| Claude plugin sync and content | `claudePlugin.test.ts`, `claudePluginContent.test.ts` |

`claudePluginContent.test.ts` also guards consistency between plugin files, for example identical `documentation-standards.md` copies and the related-tasks paragraph. See [Architecture](architecture.md#claude-code-plugin).

## 5. Build a package

1. Bump `version` in `package.json`. The version is stamped into the Claude plugin, which is how Claude Code sees an update.
2. Run `npm run package`. It runs typecheck, tests, a production build and `vsce package`, and writes `vscode-workflow-<version>.vsix` in the repository root (the name comes from the `name` field in `package.json`). `*.vsix` is git-ignored.
3. Smoke test: `code --install-extension <file>.vsix`, open a repository, create a task, and run the register command for Claude Code.

`.vscodeignore` is an allowlist. A new runtime folder or file must be added there or it will not ship.

## 6. Release

Two ways to publish a build:

- **Marketplace:** `npx vsce publish`. It needs a token for the `davidetriso` publisher.
- **GitHub release:** run the **Release** workflow (`.github/workflows/release.yml`) manually from the Actions tab and enter a tag such as `v0.5.0`. It installs dependencies, runs typecheck and tests, builds in production mode, packages the VSIX, and creates a GitHub release with generated notes. The attached file is named `vscode-workflow-<tag>.vsix`, so it includes the `v` of the tag (for example `vscode-workflow-v0.5.0.vsix`).

Uninstalling the extension runs `scripts/uninstall.js` (the `vscode:uninstall` hook), which removes the plugin entries from the Claude Code settings.
