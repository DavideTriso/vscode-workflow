# Implementation TODO contract

`implementation-todo.json`, beside the active `.current` marker, is the single source of truth for the task's TODO list. The Tasks view shows its groups and items in file order, lets the user tick items done or undone, and renders a Markdown preview from it, so keep no Markdown copy.

## Access

- Read and change the list only through the TODO tools (`read_implementation_todos`, `manage_implementation_todos`, `sync_logic_review_todos`, `sync_code_readability_todos`). They serialize writes, validate the schema, keep concurrent user changes, and return the updated list. A file tool or shell command on the JSON can overwrite the user's ticks.
- Call `read_implementation_todos` at the start of every work turn and right before each batch of changes. Keep no raw JSON copy between calls.
- After each completed batch of code edits, update the list before you start the next item.

## Schema

Use this schema, with no priority, weight, or status field:

```json
{
	"version": 1,
	"summary": "2-3 concise sentences, at most 500 characters, describing progress, next item, and blockers",
	"plan": "implementation-plan.md",
	"planSyncedAt": "2026-11-01T10:00:00Z",
	"groups": [
		{
			"name": "Persistence",
			"items": [
				{
					"id": "persist-selected-task",
					"title": "Persist the selected task",
					"done": false,
					"source": "plan",
					"sourceRef": "implementation-plan.md#step-1",
					"why": "Why this change matters",
					"files": ["src/tasks/tasksViewProvider.ts"],
					"decisions": "Decisions, constraints, and edge cases",
					"acceptance": "How completion is verified",
					"evidence": "Changes made and actual checks run",
					"remaining": "What remains, blockers, and open questions",
					"alert": null,
					"createdBy": "agent",
					"updatedBy": "agent",
					"updatedAt": "2026-11-01T10:00:00Z"
				}
			]
		}
	]
}
```

- An item is open (`done: false`) or done (`done: true`).
- Valid sources: `plan`, `request`, `user-note`, `logic-review`, `code-readability`.
- IDs are unique across all groups.
- JSON order is display order. Choose a useful logical order; do not sort by priority.
- Keep every field of an item filled in as work goes on. Text fields may contain concise Markdown.

## Ownership and completion

- Every item has `createdBy: "agent"` or `createdBy: "user"`. The tools reject changes to user-created items and keep them in place during reorder and sync. Leave them as they are; the user edits them in the Tasks view.
- Keep completion the user set (`updatedBy: "user"`) during normal work. If the code shows that a user-completed item is missing or broken, leave `done` as it is, add an `alert`, explain the evidence in `remaining`, and tell the user.
- Set `done: true` on an agent item only after the change and its stated verification pass. Otherwise keep it open and say in `remaining` what is left.
- Deferred or unapproved work stays open, with the deferral or approval need in `remaining`. Implement it only when the user asks or approves.

## Plan changes

- When the user changes the plan, reconcile agent-created items freely to match the new plan and the current code: add, remove, update, regroup, reorder, tick, or un-tick them, including statuses the user set. Leave user-created items untouched.
- Use the `reconcile` action only during an explicit plan revision, to change a user-set status on an agent-created item.
- Record material reconciliation decisions in the summary and the item details.
- If the plan changes during implementation, stop, reconcile through the tools, and continue in the new order.

## Review items

- Read `logic-review.md` and `readability-review.md` at the start of each turn and before reconciliation.
- Confirmed logic-review findings are open items in the `Logic Review` group, ordered by severity.
- Items in the `Code Readability` group are proposals the user selected; implement them like other open items. Add no proposals from `readability-review.md` that are not in the list, because the user chose which ones to keep.
- When you mark readability items done, call `sync_code_readability_todos` with every agent-created item with `source: "code-readability"` in the `Code Readability` group, because the tool removes the ones missing from the call. Never send items from other groups: the tool adds them to `Code Readability` as copies. To mark done an item in another group, use `manage_implementation_todos` `update`.
- Use the source-specific sync tools and stable `sourceRef` values such as `logic-review.md#finding-2`, so findings are not duplicated and stale ones are removed.
- Recheck the source files before you mark a review item done.

## User notes

When the user asks you to keep something in mind, add an open item right away with source `user-note`, their words, and enough context to act later. Record in `remaining` that it is deferred.
