# Implementation run: check what is left

## Summary

The implementation was already complete. I replaced one weak test assertion with a strict check of the "do not run inline" rule in the five launcher skills. All 112 tests pass. The version bump and live launcher runs remain open for the maintainer.

## Full Record

### User request

Check what is left to do and do it.

### Implementation summary

- Read the task, plan, TODO list and earlier run record. Items 1-4 only wait for live checks; items 5-6 are done; item 7 waits for the release step.
- Fixed the weak `toContain('Do not')` assertion in `test/claudePluginContent.test.ts`. It now matches the full sentence "If the subagent cannot be started ... Do not ... in this conversation instead." in each launcher skill.
- Did not bump `version` in `package.json`: the plan assigns it to the maintainer.

### Files changed

- `test/claudePluginContent.test.ts`

### Checks run

- `vitest run` with Node v22: 10 files, 112 tests passed.
- `npm` is not on PATH, so I called vitest directly. I did not rerun tsc; the change touches only a test assertion.

### Remaining risks

- Live runs not done: the installed plugin still has old files. Bump `version` in `package.json`, re-sync, `/reload-plugins`, then run each launcher once and the Awaiting Confirmation case.
- Launcher instructions are followed by the model and not enforced.
- Code Comments has no report or accordion (separate follow-up).
