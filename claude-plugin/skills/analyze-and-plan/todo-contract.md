# Implementation TODO contract

The single source of truth is `implementation-todo.json` beside the active `.current` marker. Do not create or maintain a Markdown copy. The task-view extension parses this JSON, displays groups and items in file order, lets the user mark an item done or undone, and renders a Markdown preview from the JSON. Use only `read_implementation_todos` and `manage_implementation_todos` tools to access or change the file; never use edit, execute, or another file-writing method on the TODO JSON.

Every item has `createdBy: "agent"` or `createdBy: "user"`. Agent tools reject updates and removals of user-created items and preserve them during reorder and review sync. The user can edit, remove, and reorder any item in the task view.

Use this schema and no priority or weight field:

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

TODOs have only two states: open (`done: false`) and done (`done: true`). Do not emit a status field. Valid sources are `plan`, `request`, `user-note`, `logic-review`, and `code-readability`. IDs are unique across all groups. Group and item order in the JSON is the display order; choose a useful logical order and never sort by priority. Each item preserves its source reference, rationale, files, decisions, acceptance criteria, evidence, remaining work, and alert. Text fields may contain concise Markdown.

Read the current JSON through `read_implementation_todos` at the start of every work turn and immediately before each logical mutation batch. Use the management tools for read-modify-write; they serialize writes, validate the schema, preserve concurrent user changes, and return updated data. Never maintain a raw JSON copy. After every completed code edit batch, update the TODO through the tools before starting another item.

During normal implementation work, preserve completion the user set (`updatedBy: "user"`). A user tick sets `done: true`; an un-tick sets `done: false`. If code evidence shows a user-completed item is missing or broken, do not change its completion: add an `alert`, explain the evidence in `remaining`, and tell the user. For agent-owned items, set `done: true` only after the change and its stated verification pass; otherwise keep `done: false` and explain what remains. Deferred or unapproved work stays open, with the deferral or approval requirement recorded in `remaining`; do not implement it until the user asks or approves.

When the user changes the plan, reconcile agent-created TODOs freely, including statuses previously changed by the user: add, remove, update, regroup, reorder, tick, or un-tick them to match the newly selected plan and current implementation. Preserve every user-created TODO without editing, removing, or reordering it. Use the `reconcile` action only during an explicit plan revision when changing a user-set status on an agent-created item. Record material reconciliation decisions in the summary and item details. When a plan changes during implementation, stop the current sequence, reconcile through the tools, then continue from its new order.

Read `logic-review.md` and `readability-review.md` at the start of each turn and before reconciliation. Add confirmed logic-review findings as open items grouped under `Logic Review`, ordered by severity. Record readability proposals as open items grouped under `Readability`; record pending approval in `remaining` and implement only approved proposals. Use the source-specific sync tools and stable `sourceRef` values such as `logic-review.md#finding-2` to avoid duplicates and remove stale agent-owned findings. Recheck source files before marking review items done. When the user asks to keep something in mind, add an open item immediately with source `user-note`, their words, and enough context to act later; record that it is deferred in `remaining`.

