# User documentation

## Setup

1. Install the extension and open a folder that is a Git repository. Set `git config user.email` (used as task creator and timer user).
2. **Copilot:** nothing else to do. The agents appear in Copilot Chat's agent picker.
3. **Claude Code:** run **Workflow: Register Agents and Skills with Claude Code** from the Command Palette (or accept the prompt shown once if `~/.claude` exists). Then run `/reload-plugins` in Claude Code and check `/mcp` shows `plugin:vscode-workflow:todos` as connected.
   - The extension adds a local plugin to `~/.claude/settings.json` (or `$CLAUDE_CONFIG_DIR`) and keeps it updated. Uninstalling the extension removes the entries.
   - Set `vscode-workflow.claudeCode.registration` to `disabled` to never touch Claude Code settings.

## Daily use

1. **Create a task** with `+` in the Tasks view: name, optional description and project management URL. Set `vscode-workflow.tasks.requireProjectManagementUrl` to `false` to make the URL optional.
2. **Start the timer.** This marks the task active (only one at a time; other timers stop). Agents only work when a task is active. Stopping the timer ends the active state.
3. **Run agents** in this order for best results:

   | Agent | Use it to |
   | --- | --- |
   | Analyze and Plan | Agree on an approach; saves a plan and TODOs. No code changes. |
   | Implement | Build the planned change and tick off TODOs. |
   | Debug | Reproduce and fix a bug. |
   | Logic Review | Find confirmed bugs in the change. |
   | Code Readability | Get clarity proposals. |
   | Document | Update the docs. |
   | Code Comments | Review or improve comments. |

   - Copilot: pick the agent in Chat.
   - Claude Code: `/vscode-workflow:analyze-and-plan` and `/vscode-workflow:implement` are skills; the others are subagents, so ask for them by name ("use the vscode-workflow:logic-review subagent").
4. **Follow the results** in the Tasks view: select a task to see agent reports and its TODO list. Add, edit, reorder or check off your own TODOs; agents never change items you created.
5. **Mark done** when finished. Done tasks leave the list; use the person icon to show only your tasks.

Tip: the **Quick Reference** panel at the bottom of the view repeats this per tool.

## Where data lives

- `.history/tasks/*.json`: tasks.
- `.history/agents/<task id>/`: agent reports and `implementation-todo.json`; a `.current` file marks the active task.

Commit or ignore `.history/` as your team prefers.
