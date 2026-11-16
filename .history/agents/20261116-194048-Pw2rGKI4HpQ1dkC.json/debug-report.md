# Debug report: no documentation-update.md after debug test

## Summary

Claude Code still loads the old 0.4.1 plugin. The register command was answered by an old installed copy of the extension (`vscode-extension-starter`), not by the debug extension (`vscode-workflow`). Diagnosis only; no code changed.

## Full Report

### Expected versus actual

- Expected: `/vscode-workflow:documentation-update-default` starts the `vscode-workflow:document` subagent, which writes `documentation-update.md`.
- Actual: no report. The loaded plugin is the pre-change copy.

### Evidence

- `~/.claude/settings.json` marketplace path: `.../globalStorage/davidetriso.vscode-extension-starter/claude-marketplace`.
- That folder was rewritten at 21:33:09 but `plugin.json` still says 0.4.1 and `agents/document.md` still lists `Skill`.
- Folder `.../globalStorage/davidetriso.vscode-workflow` does not exist, so the debug extension wrote nothing.
- `~/.vscode-server/extensions/` holds `davidetriso.vscode-extension-starter-0.1.0`, `-0.3.0`, `-0.4.1`. Their `package.json` uses the same `vscode-workflow.*` command and setting ids.
- The last commit renamed the package to `vscode-workflow`.

### Root cause (confirmed for the symptom; the exact handler is inferred)

The register command id is shared by the old installed extension and the debug extension. The old one handled it and re-synced its own old bundled plugin. I did not observe which window ran the command.

### Changes

None.

### Next steps for the user

1. Uninstall all `vscode-extension-starter` copies, reload the window.
2. Start **Run Extension** (F5). In that debug window, run the command "Workflow: Register Agents and Skills with Claude Code".
3. In Claude Code (this session), run `/reload-plugins`.
4. Check `davidetriso.vscode-workflow/.../plugin.json` shows 0.5.0.

### Risks

- If the debug host still does not create `davidetriso.vscode-workflow`, check the Extension Host log for activation errors.
