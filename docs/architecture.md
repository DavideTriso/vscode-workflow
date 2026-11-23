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
src/crypt/                  History encryption (git-crypt)
  historyEncryptionTypes.ts   status types shared with the webview (no Node imports)
  historyEncryptionStatus.ts  reads the state (not-installed, not-enabled, locked, unlocked), keys and files; status bar text
  historyEncryptionActions.ts enable, add a teammate key, export a public key, re-stage `.history`
  historyEncryptionMessages.ts webview <-> extension messages for this feature and their type guards
  historyEncryptionController.ts the only file that uses `vscode`: status bar item, command, terminals, confirmations
  installHint.ts            install command per platform
src/ui/tasks/historyEncryptionView.ts  renders the History Encryption accordion in the webview
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

## History encryption

`.history/` can be stored encrypted in Git with git-crypt. The extension reads the state from repository files (`.gitattributes` rule, `.git/git-crypt/keys/default`, `.git-crypt/keys/default/0/*.gpg`) so a machine without git-crypt can still say the history is encrypted. States: `not-installed`, `not-enabled`, `locked` (rule present, no local key, files unreadable), `unlocked`.

- `HistoryEncryptionController` owns the status bar item and runs panel requests one at a time, each followed by a status refresh. Copy requests are the exception: they run at once, skip the refresh, and answer with `historyEncryptionCopied` and the request's `requestId`, so the panel can show a spinner, then a check or a cross, on the right button. Enable, add teammate and the public key export use `runProcess`, because they need no passphrase. Unlock runs `git-crypt unlock` in a terminal named `git-crypt`, because gpg may ask for the key passphrase. There is no lock action on purpose. The controller also refreshes when `.gitattributes` changes, the window gets focus, the workspace folders change, or the `git-crypt` terminal closes.
- Enabling runs `git-crypt init`, writes `.history/** filter=git-crypt diff=git-crypt` to `.gitattributes`, runs `git-crypt add-gpg-user --no-commit <fingerprint>`, then `git add` and `git add --renormalize -- .history`. It never commits and never rewrites history. Adding a teammate imports the pasted armored key (`gpg --import`), wraps the key the same way, and stages `.git-crypt`; it needs an unlocked clone. There is no remove action, because git-crypt has no command to remove a key. A teammate cannot add themselves: they send their public key to someone who can unlock.
- `TasksViewProvider` forwards `isHistoryEncryptionRequest` messages to the controller, posts its notices to the webview, and expands the section on `revealHistoryEncryption()` (the status bar click). The webview shows a notice above the task list when the clone is locked, because task files are unreadable then and the list would look empty.
- The repository is the one that contains the first workspace folder (`extension.ts`).
- The private key is never read. `readHistoryEncryptionStatus` lists secret keys with `--with-keygrip` and reads `Home:` from `gpg --version`, so the panel can show the key file path `<home>/private-keys-v1.d/<keygrip>.key`. Do not add a private key export.
- The shared types file must not import Node modules; the webview bundle imports it.
- Keep the Quick Reference entry and the `install-git-crypt` skill in step with the panel states.

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
- **Skill plus subagent.** The review, documentation and comment capabilities are a subagent that holds the criteria and writes the report, plus one or more launcher skills (`logic-review-default`, `code-readability-default`, `documentation-update-default`, `code-comment-review`, `code-comment-improve`) whose first action is the `Agent` call. The agent must not load its launcher skill. Subagents cannot see the conversation, so a launcher passes the request, intent and scope in the brief. The `code-readability` agent only writes its report; its launcher asks the user which proposals to keep and adds them to the TODO list with `sync_code_readability_todos`, so the list never holds unselected proposals. The Document launcher also passes the absolute path of `documentation-standards.md`, since an agent has no sibling files.
- **Shared skill files.** A file used by several skills has one copy, in the skill that owns it; the other skills read it at `../<owner>/<file>` relative to their base directory. `agents-md-rules.md` lives in `agents-md` (read by `analyze-and-plan`, `implement`, `debug`), `todo-contract.md` in `implement` (read by `analyze-and-plan`), and `documentation-standards.md` in `documentation-create-default` (read by `documentation-update-default`, which passes its absolute path to the Document agent). This works because `claudePlugin.ts` copies the whole `claude-plugin/` folder, so sibling skill folders are always present. A test checks each path resolves and that no copies come back. The `logic-review` and `code-readability` agents have no sibling files, so their `AGENTS.md` instructions are inline.
- **Coding standard.** `docs/coding-standard.md` in the user's repository holds the team's coding rules. `documentation-standards.md` requires it and defines its default content, so `documentation-create-default` always creates it. `agents-md-rules.md` tells its readers (`analyze-and-plan`, `implement`, `debug`) to read and follow it, and defines the `## Conventions` line that links it from `AGENTS.md`. `implement` and `debug` also hold an identical `## Coding standard` paragraph, and `code-readability` reads the file through an inline instruction. Every reader uses the same conflict rule with `AGENTS.md`: name both rules, ask the user, offer a fix, and change either file only after approval; `code-readability` cannot ask, so it adds a proposal. Change the conflict rule wording in all of these files together; a test checks it in `implement`, `debug`, `analyze-and-plan` and `agents-md-rules.md`.
- **Commit messages.** The skill `claude-plugin/skills/commit-message` and the Source Control button share one rules file, `commit-message-rules.md`. The skill reads it next to its `SKILL.md`; the extension reads it at runtime from `<extensionPath>/claude-plugin/skills/commit-message/`, so keep it inside `claude-plugin/`, which the package ships. Change the format only in that file; a test checks that it names every prefix. The button starts `claude -p` with the prompt on standard input and with `--tools ""`, `--no-session-persistence`, `--disable-slash-commands`, `--strict-mcp-config` and `--setting-sources user`, so the run cannot act on the repository and ignores project and local settings. It does not use `--bare`, which skips the keychain and breaks login-based authentication. The diff leaves out `.history/`, lock files and `package-lock.json`, because task records say nothing about the change; the task records reach the model through `taskContext.ts` instead. `commitMessageCommand.ts` imports `vscode`, so keep logic that needs a test in the other `src/scm/` files.
- **New setting.** Add it under `contributes.configuration` in `package.json`, read it in `userSettings.ts` or the view provider, and push it to the webview when the view needs it (see `taskSettings`). Add it to the [settings reference](settings.md).
- **New task field or action.** Extend types and messages in `taskProtocol.ts`, implement in `taskRepository.ts`, handle in `tasksViewProvider.ts`, render in `main.ts` and `tasksWebviewHtml.ts`, and add tests.
