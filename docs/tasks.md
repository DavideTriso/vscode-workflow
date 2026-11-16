# Working with tasks

## Create a task

Click `+` in the Tasks view and fill in the name, an optional description and a project management URL. The URL is required by default; set `vscode-workflow.tasks.requireProjectManagementUrl` to `false` to make it optional. An entered URL must be a valid http(s) URL.

Pick an **assignee**; it defaults to you. The task file stores `createdBy` (set automatically) and `assignee`, both as `email <name>`. Timer entries store their `user` the same way. The person icon next to the search box filters the list to tasks assigned to you.

## Related tasks

Use **Add related task** in the form and type part of a task name. The list shows matching tasks of any status from this repository and from the repositories in its [group](multi-repository.md), each with its repository name.

- Only tasks created in the last `vscode-workflow.relatedTasks.maxAgeDays` days are listed (default 90, `0` for no limit). Existing links are kept.
- The selected task shows its related tasks under the description. Click one to open its task file from the matching local repository.
- Links are stored in the task file as `relatedTasks`.
- When the task is active, agents also read each related task and its agent reports (plans, reviews, TODOs) as read-only context. For example, a frontend task can use the API changes planned or made in the backend.

## Start and stop the timer

Starting the timer marks the task **active**. Only one task is active at a time; other timers stop. Agents only work when a task is active. Stopping the timer ends the active state.

## Follow agent results and TODOs

Select a task to see its agent reports and TODO list. Run agents as described in [Skills and agents](skills-and-agents.md).

- Add, edit, reorder or check off your own TODOs. Agents never change items you created.
- Each TODO's `⋮` menu has **Edit**, **Delete** and **Create task**. **Create task** opens the new-task form filled from the TODO: its title, all its details as the description, and the parent task's URL and assignee. Saving the task removes the TODO.
- The new task is linked to the parent as a related task. Remove the link in the form if you do not want it.

## Mark done

Mark a task done when finished. Done tasks leave the list.

## Quick Reference

The **Quick Reference** panel at the bottom of the Tasks view summarizes how to use each agent.

## Where data lives

- `.history/tasks/*.json`: tasks.
- `.history/agents/<task id>/`: agent reports and `implementation-todo.json`. A `.current` file marks the active task and lists its related tasks with absolute paths on this machine.

Commit or ignore `.history/` as your team prefers. Commit it to share tasks and agent history with teammates and give future agents context.
