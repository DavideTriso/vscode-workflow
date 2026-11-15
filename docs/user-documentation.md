# User documentation

## Setup

1. Install the extension and open a folder that is a Git repository. Set your identity in `vscode-workflow.user.email` / `vscode-workflow.user.name`, or leave them empty to use `git config user.email` / `user.name`. An email is required. To assign tasks to others, list them in `vscode-workflow.teamMembers` as `[{ "email": "...", "name": "..." }]`.
   - **Multi-repository projects** (for example backend + frontend): list the repositories in `vscode-workflow.repositoryGroups`:

     ```json
     "vscode-workflow.repositoryGroups": [{
       "group": "Shop",
       "repositories": [
         { "path": "/home/me/shop-api", "originUrl": "https://github.com/org/shop-api", "name": "Backend", "description": "REST API" },
         { "path": "/home/me/shop-web", "originUrl": "https://github.com/org/shop-web", "name": "Frontend", "description": "Web UI" }
       ]
     }]
     ```

     The current repository is matched by path or origin URL. Links between tasks are matched by origin URL first, so they keep working for teammates whose checkouts live at other paths.
2. **Claude Code:** run **Workflow: Register Agents and Skills with Claude Code** from the Command Palette (or accept the prompt shown once if `~/.claude` exists). Then run `/reload-plugins` in Claude Code and check `/mcp` shows `plugin:vscode-workflow:todos` as connected.
   - The extension adds a local plugin to `~/.claude/settings.json` (or `$CLAUDE_CONFIG_DIR`) and keeps it updated. Uninstalling the extension removes the entries.
   - Set `vscode-workflow.claudeCode.registration` to `disabled` to never touch Claude Code settings.

## Daily use

1. **Create a task** with `+` in the Tasks view: name, optional description and project management URL. Set `vscode-workflow.tasks.requireProjectManagementUrl` to `false` to make the URL optional. Pick an **assignee** (defaults to you). The task file stores `createdBy` (set automatically) and `assignee`, both as `email <name>`; timer entries store their `user` the same way. The person icon next to search filters the list to tasks assigned to you.
   - **Related tasks:** use **Add related task** in the form and type part of a task name. The list shows every matching task (any status) from this repository and from the repositories in its group, each with its repository name. Only tasks created in the last `vscode-workflow.relatedTasks.maxAgeDays` days (default 90, `0` for no limit) are listed; existing links are kept. The selected task shows its related tasks under the description; click one to open its task file from the matching local repository. The links are stored in the task file as `relatedTasks`. When the task is active, agents also read each related task and its agent reports (plans, reviews, TODOs) as read-only context, for example to update a frontend from the API changes planned or made in the backend.
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

   - `/vscode-workflow:analyze-and-plan`, `/vscode-workflow:implement` and `/vscode-workflow:debug` are skills; the others are subagents, so ask for them by name ("use the vscode-workflow:logic-review subagent").
4. **Follow the results** in the Tasks view: select a task to see agent reports and its TODO list. Add, edit, reorder or check off your own TODOs; agents never change items you created. Each TODO's `⋮` menu has **Edit**, **Delete** and **Create task**: the last one opens the new-task form filled from the TODO (its title, all its details as the description, and the parent task's URL and assignee); saving the task removes the TODO. The new task is linked to the parent task as a related task (remove the link in the form if you don't want it).
5. **Mark done** when finished. Done tasks leave the list; use the person icon to show only your tasks.

Tip: the **Quick Reference** panel at the bottom of the view repeats this per tool.

## Where data lives

- `.history/tasks/*.json`: tasks.
- `.history/agents/<task id>/`: agent reports and `implementation-todo.json`; a `.current` file marks the active task and lists its related tasks with absolute paths on this machine.

Commit or ignore `.history/` as your team prefers.
