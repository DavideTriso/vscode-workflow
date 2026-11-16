# Multi-repository projects

When one project spans several repositories (for example a backend and a frontend), list them in a group with `vscode-workflow.repositoryGroups`:

```json
"vscode-workflow.repositoryGroups": [{
  "group": "Shop",
  "repositories": [
    { "path": "/home/me/shop-api", "originUrl": "https://github.com/org/shop-api", "name": "Backend", "description": "REST API" },
    { "path": "/home/me/shop-web", "originUrl": "https://github.com/org/shop-web", "name": "Frontend", "description": "Web UI" }
  ]
}]
```

- The current repository is matched to an entry by path or origin URL.
- Tasks can then be linked to tasks of every repository in the same group (see [Related tasks](tasks.md#related-tasks)).
- Links are matched by origin URL first, then by path, so they keep working for teammates whose checkouts are at other paths.
- The `description` is given to agents as context about what each repository contains.
- When the task is active, agents read the linked tasks and their reports from the local checkout as read-only context.

See [Settings](settings.md#repository-group-object) for every field.
