# Coding standard

Agents and developers follow these rules when they write code in this repository.

The rules start from the [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html) and are adjusted to `tsconfig.json`, `tsconfig.webview.json` and the code in `src/` and `test/`. The repository has no formatter or linter configuration, so `npm run typecheck` and the existing code are the reference. Architecture and process rules, such as which files may import `vscode` and where `.history/` is read and written, are in [AGENTS.md](../AGENTS.md); this page does not repeat them.

## Formatting

- Indent with 4 spaces in TypeScript and JavaScript files. `vitest.config.ts` uses 2 spaces; leave it as it is.
- Use single quotes for strings. Use template literals only when you interpolate values. JSON-shaped data copied as is, such as the tool schemas in `src/tasks/todoToolDefinitions.ts`, keeps its double quotes.
- End every statement with a semicolon.
- Put a trailing comma after the last item of a multi-line array, object, parameter list or import list.
- Always use braces for `if`, `for` and `while` bodies, also for a single `return`.
- Always put parentheses around arrow function parameters: `(entry) => ...`.
- Keep lines readable; there is no hard length limit. Break long parameter lists and conditions one item per line.

## Naming

- Use `camelCase` for variables, functions, methods and module-level constants, for example `maxOutputBytes` and `defaultClaudeTimeoutMs`. Do not use `UPPER_CASE` constants.
- Use `PascalCase` for classes, interfaces and type aliases.
- Name files in `camelCase` after their main export or area, for example `taskRepository.ts` and `historyEncryptionTypes.ts`.
- Name functions with a verb that says what they do: `readRelatedTasks`, `createTaskSummary`, `isSameRelatedTask`. Start boolean helpers and type guards with `is`.
- Use full words. Add the unit to numeric names when it is not obvious: `timeoutMs`, `maxDiffChars`.
- Name error classes `<Reason>Error` and set `this.name` to the class name in the constructor.

## Types

- Keep the code valid under `strict` and `noUncheckedIndexedAccess`. Run `npm run typecheck` before you finish.
- Do not use `any`. Type unknown input as `unknown` and narrow it with type guards such as `isRecord`.
- Use `interface` for object shapes and `type` for unions, function types and aliases.
- Use `undefined` for "no value" in TypeScript code. Use `null` only where a JSON format or a DOM API requires it.
- Use the non-null assertion `!` only where the value is guaranteed by a check just before it, or in tests.
- Use `as const` or `satisfies` to keep literal types instead of widening casts.
- Model messages between the extension and the webview as discriminated unions with a `type` field, declared in `src/tasks/taskProtocol.ts`.

## Imports and modules

- Use named exports. Do not use default exports in `src/`; only tool configuration files such as `vitest.config.ts` use one, because the tool requires it.
- Import Node built-ins with the `node:` prefix, for example `import path from 'node:path'` and `import { readFile } from 'node:fs/promises'`.
- Import `vscode` as `import * as vscode from 'vscode'`.
- Mark type-only imports with `import type` or an inline `type` modifier.
- Prefer plain exported functions. Use a class when the code holds state or implements a VS Code interface such as `vscode.Disposable`.
- Pass dependencies that tests must replace, such as process runners and identity providers, as constructor parameters or options with defaults.
- Declare `const` by default and `let` only when you reassign. Do not use `var`.

## Async code

- Use `async` and `await`. Use `.catch(() => undefined)` only for a single call whose failure means "no value".
- Run independent asynchronous work in parallel with `Promise.all`.
- Mark a promise you do not wait for with `void`, for example `void vscode.window.showErrorMessage(...)`.
- Accept an `AbortSignal` and a timeout in code that runs a long external process, as `runProcess` in `src/scm/processRunner.ts` does.

## Error handling

- Throw `Error` or a subclass with a message that is one full sentence ending with a period. The message is shown to the user or to an agent.
- Catch only errors you can handle. Check the error code, for example `ENOENT`, and rethrow anything else.
- Use `catch` without a binding when the error is not used.
- Turn a caught value into text with `error instanceof Error ? error.message : String(error)`.
- In the extension host, report failures with `vscode.window.showErrorMessage` and a prefix that names the action, for example `Unable to load tasks: ...`.
- Validate input from files, settings and messages before you use it. Skip malformed entries instead of failing the whole operation when the rest is still usable.

## Webview code

- Look up elements with typed `querySelector<HTMLElement>` calls and check that they exist before you use them.
- Set user and file content with `textContent`. Use `innerHTML` only for constant markup such as the built-in SVG icons.
- Send messages to the extension only through the typed `postMessage` of `acquireVsCodeApi()`.

## Comments

- Add a `/** ... */` comment to exported functions, types and fields when the name does not say everything: what it returns, edge cases, units, or why it exists.
- Write a `//` comment only to explain why the code does something unexpected, not what it does.
- Write comments as full sentences in plain English.
- Do not leave commented-out code or `TODO` comments; track open work in the task TODO list.

## Tests

- Write tests with vitest in `test/<area>.test.ts`, one suite per area. Import `describe`, `it`, `expect` and `vi` from `vitest` explicitly.
- Name the `describe` block after the area in lower case, for example `'task model'`. Start each `it` name with a verb in the present tense that states the behavior: `'sorts open tasks newest first'`.
- Test behavior through exported functions and classes, not private helpers.
- For file system code, create a temporary folder with `mkdtemp` in `beforeEach` and remove it in `afterEach`.
- Replace `vscode` with `vi.mock('vscode', ...)` and pass fakes for injected dependencies instead of running real processes.
- Test the webview with `JSDOM`: build `src/ui/tasks/main.ts` with esbuild and run it in the page from `getTasksWebviewHtml`, as `test/tasksWebview.test.ts` does.
- Add or update a test with every behavior change. Run `npm test` before you finish.
