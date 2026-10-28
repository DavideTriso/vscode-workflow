# Copilot Workflow Guide

VS Code extension (Windows and macOS, VS Code ≥ 1.105) that guides the developer through a standard workflow integrated with GitHub Copilot Chat and records every step in a versioned file in the repository.

The only UI it adds is a **Workflow** view in the Secondary Side Bar (where Copilot Chat lives); all AI interaction stays in the chat.

The UI is in English (primary language), with Italian and German translations. The language follows the VS Code display language; other languages fall back to English.

## Workflow

| Step | What the extension does |
|---|---|
| 1. Analysis | Captures requirements (messages in Plan mode) and plan (last Plan response): with the **Capture** button, or automatically when an implementation starts after the Plan. |
| 2. Implementation | Free (manual, Copilot, or mixed). |
| 3. Review | **Start AI review** sends requirements, plan and `git diff HEAD` to the chat; the agent produces *Final plan and divergences* + *Code review*. The response is captured automatically (or with **Capture last response**). Repeatable. |
| 4. Style | **Start style check** sends the prompt to the chat; nothing is captured. |
| 5. Tests | Checkbox + notes for automated and manual tests. |
| 6. Final notes | Optional free text. |
| 7. Commit | **Add workflow file to stage** (enabled only with analysis, ≥1 review and a style check). Optional: **Install pre-commit guard** (git hook that blocks commits without a workflow file; bypass with `--no-verify`). |

Each Copilot chat session generates a `.copilot-workflow/<YYYYMMDD-HHMMSS>-<id>.json` file (JSON with LF line endings, stable diffs across operating systems).

## Settings

- `copilotWorkflow.outputFolder` (default `.copilot-workflow`)
- `copilotWorkflow.autoCaptureAnalysis` (default `true`)
- `copilotWorkflow.planModeNamePattern` (regex, default `plan`)
- `copilotWorkflow.maxDiffCharacters` (default `80000`)

## Known limitations

- VS Code exposes no public API to read the chat or to add tabs to the Copilot view. The extension:
  - reads the `chatSessions/*.json(l)` session files in the workspace storage (internal format, isolated in `src/infrastructure/chat/`; it may change between VS Code versions);
  - shows its view in the Secondary Side Bar, next to Copilot Chat.
- Prompts are sent with `workbench.action.chat.open` in *ask* mode.
- The first workspace folder is assumed to be the root of the git repository.
- Plan mode is recognized by the mode name (`planModeNamePattern`); if it is not recognized, **Capture** uses the last chat response.

## Architecture

```
src/domain          session model and progress calculation (pure)
src/application     use cases (WorkflowService), prompts, plan/review extraction, ports
src/infrastructure  adapters: JSON files, VS Code chat, git CLI, hook, vscode API
src/ui              webview (provider, HTML, script) and message contract
src/i18n            message catalogs (en, it, de) and translation helper
test                vitest (domain, application with fakes, adapters on real git repos)
```

## Localization

- Runtime messages: add the key to `src/i18n/en.ts` (the primary catalog), then to `it.ts` and `de.ts`; the compiler enforces that every catalog has the same keys.
- Manifest texts (commands, settings, description): `package.nls.json` (English), `package.nls.it.json`, `package.nls.de.json`.

## Development

```
npm install
npm run typecheck && npm test
npm run build        # F5 starts the Extension Development Host
npm run package      # produces the .vsix
```
