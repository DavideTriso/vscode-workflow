# Architecture

## Source layout

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
  implementationTodo.ts     TODO schema, parsing, rendering
  todoToolDefinitions.ts    provider-neutral TODO tool names, descriptions and input schemas
  todoToolOperations.ts     provider-neutral TODO tool logic
src/ui/tasks/main.ts        webview script (browser bundle)
src/claude/                 Claude Code plugin sync + registration prompt/command
src/scm/                    Generate Commit Message button
  commitMessageCommand.ts   the only file that uses `vscode`: command, progress, Git API, settings
  commitMessageGenerator.ts reads the diff, builds the prompt, runs Claude, cleans the answer
  taskContext.ts            reads the active task name, description and Markdown reports
  claudeCli.ts              finds the `claude` executable
  processRunner.ts          runs a program with input, abort signal and timeout
  repositoryArgument.ts     reads the repository folder from the menu command argument
src/mcp/                    stdio MCP server: the Claude Code adapter for the TODO tools
claude-plugin/              agents, skills, .mcp.json for Claude Code
scripts/uninstall.js        vscode:uninstall hook; removes Claude settings entries
test/                       vitest suites
```

## Bundles

`esbuild.mjs` produces three bundles in `dist/`:

| Bundle | Entry point | Runs in |
| --- | --- | --- |
| `extension.js` | `src/extension.ts` | VS Code extension host (Node, `vscode` is external) |
| `tasksView.js` | `src/ui/tasks/main.ts` | Tasks webview (browser) |
| `mcp-server.js` | `src/mcp/server.ts` | Claude Code, started over stdio by the plugin's `.mcp.json` |

`--production` minifies and drops source maps; `--watch` rebuilds on change.

## Repository state is files

- Tasks are `.history/tasks/<id>.json`. Status is `0` new, `1` in progress, `2` done.
- Starting a timer writes `.history/agents/<id>/.current`. Agents find the active task through it.
- Agent output lives in `.history/agents/<id>/`: reports (see `outputAgents` in `taskProtocol.ts`) and `implementation-todo.json`.
- All reads and writes go through `taskRepository.ts`.

## Related tasks

- A task stores links as `relatedTasks` (`taskId`, `repositoryUrl`, `repositoryPath`, plus name snapshots).
- The task form loads candidates (`loadRelatedTaskCandidates`) from the current repository and from every repository that shares a `repositoryGroups` group with it. Tasks older than `relatedTasks.maxAgeDays` are skipped, by file-name timestamp when present, so old files are never read.
- When writing `.current`, `TaskRepository.startAgentTask` resolves each link to this machine's checkout, by origin URL first and then by path. It writes absolute `taskFile` and `taskFolder` paths into the marker's `relatedTasks`.
- Agents and skills read those paths as read-only context. The paragraph that says so must stay identical across `claude-plugin/`; a test checks that it is present.

## TODO tools

TODO tools are declared once in `todoToolDefinitions.ts` and implemented in `todoToolOperations.ts`, with no editor or provider API. The MCP server in `src/mcp/` is the Claude Code adapter that exposes them. Another provider would get its own adapter over the same two modules. To add a tool, add the declaration and the operation; the MCP server picks it up.

## Claude Code plugin

`claudePlugin.ts` copies `claude-plugin/` plus `mcp-server.js` into `<globalStorage>/claude-marketplace`. It stamps the extension version, pins `.mcp.json` to an absolute Node path, and enables the plugin in the Claude Code settings (`~/.claude/settings.json` or `$CLAUDE_CONFIG_DIR`). It is idempotent and reruns when the extension version or the Node path changes. In a development host (`extensionMode` is Development) `syncOnActivation` skips that check and copies on every start, because unreleased plugin files keep the same version; otherwise new skills such as `commit-message` would never reach Claude Code. After a sync, run `/reload-plugins` in Claude Code. `commit-message` has `disable-model-invocation: true`, so Claude never starts it on its own; invoke it as `/vscode-workflow:commit-message`. With `vscode-workflow.claudeCode.registration` set to `disabled` nothing is copied. `claudeRegistration.ts` owns the registration prompt, the `vscode-workflow.claudeCode.registration` setting and the register command.

Things to keep in sync:

- **Claude names.** If you rename the plugin or marketplace, update `claudePlugin.ts` and `scripts/uninstall.js` together. A test checks this.
- **New agent or skill.** Add it under `claude-plugin/agents` or `claude-plugin/skills`. A new agent report file must be added to `outputAgents` in `taskProtocol.ts` to appear in the view. Update the Quick Reference text in `tasksWebviewHtml.ts`.
- **Skill plus subagent.** The review, documentation and comment capabilities are a subagent that holds the criteria and writes the report, plus one or more launcher skills (`logic-review-default`, `code-readability-default`, `documentation-update-default`, `code-comment-review`, `code-comment-improve`) whose first action is the `Agent` call. The agent must not load its launcher skill. Subagents cannot see the conversation, so a launcher passes the request, intent and scope in the brief. The Document launcher also passes the absolute path of `documentation-standards.md`, since an agent has no sibling files.
- **Shared skill files.** A file used by several skills is copied into each skill folder (`todo-contract.md`, `documentation-standards.md`). Edit all copies together; a test checks that the documentation standards copies match.
- **Commit messages.** The skill `claude-plugin/skills/commit-message` and the Source Control button share one rules file, `commit-message-rules.md`. The skill reads it next to its `SKILL.md`; the extension reads it at runtime from `<extensionPath>/claude-plugin/skills/commit-message/`, so keep it inside `claude-plugin/`, which the package ships. Change the format only in that file; a test checks that it names every prefix. The button starts `claude -p` with the prompt on standard input and with `--tools ""`, `--no-session-persistence`, `--disable-slash-commands`, `--strict-mcp-config` and `--setting-sources user`, so the run cannot act on the repository and ignores project and local settings. It does not use `--bare`, which skips the keychain and breaks login-based authentication. The diff leaves out `.history/`, lock files and `package-lock.json`, because task records say nothing about the change; the task records reach the model through `taskContext.ts` instead. `commitMessageCommand.ts` imports `vscode`, so keep logic that needs a test in the other `src/scm/` files.
- **New setting.** Add it under `contributes.configuration` in `package.json`, read it in `userSettings.ts` or the view provider, and push it to the webview when the view needs it (see `taskSettings`). Add it to the [settings reference](settings.md).
- **New task field or action.** Extend types and messages in `taskProtocol.ts`, implement in `taskRepository.ts`, handle in `tasksViewProvider.ts`, render in `main.ts` and `tasksWebviewHtml.ts`, and add tests.
