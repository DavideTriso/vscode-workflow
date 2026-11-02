# Documentation Update

## Summary
Added the repository's first documentation: a README and two short guides in docs/ (user and developer). Content was checked against the source, package.json, esbuild config and tests. No code was changed.

## Full Record
- Added `README.md`: features, requirements, getting started, settings, command, links.
- Added `docs/user-documentation.md`: setup (Copilot, Claude Code), daily workflow, agents table, data location.
- Added `docs/developer-documentation.md`: getting started, architecture, extension points, build and release.
- Checks: facts verified by reading src/, package.json, esbuild.mjs, .vscodeignore, scripts/uninstall.js. Links are relative and point to existing files. Commands were not executed.
- Gaps: README has no screenshots or CHANGELOG (neither exists). The `package.json` has no `repository` field and `.vscodeignore` already lists README.md. The stopping-timer behavior and the vsce publish step were read from code, not run. The built package name uses the current `vscode-extension-starter` name.
