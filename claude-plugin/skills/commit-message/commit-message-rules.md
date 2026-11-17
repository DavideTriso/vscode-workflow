# Commit message rules

These rules apply to every commit message the `commit-message` skill and the "Generate Commit Message" button propose. Follow them exactly.

## Format

```
<Prefix>: <short summary>
- <detail>
- <detail>
```

1. The first line starts with one prefix, then a colon and a space, then a short summary of a few words.
2. The summary has no trailing period. Write it in the imperative mood, in English.
3. Add detail lines only when they are really necessary: when the summary alone would mislead, or when the change has separate parts a reader must know about. Most messages have no detail lines.
4. Each detail line starts with `- ` and sits on its own line directly below the first line. Do not add a blank line, a paragraph, or any other text.
5. Output only the message. Do not add quotes, headings, explanations, `Co-Authored-By` lines, or any other attribution. The skill may show the message in one code block so the user can copy it; the button needs plain text with no code block.

## Prefixes

| Prefix | Use it for |
| --- | --- |
| `BC` | A new implementation that introduces a breaking change. |
| `New` | A new implementation that does not break anything. |
| `Ref` | A refactoring. Behavior stays the same. |
| `Fix` | A bug fix. |
| `Doc` | A documentation change only: Markdown documentation and/or code comments. No executable code changed. |

When a change fits more than one prefix, use the first that applies in this order: `BC`, `New`, `Fix`, `Ref`, `Doc`.

Use `Doc` only when no executable code, configuration, or test changed.

Use `BC` only for a concrete break that you can point to in the change, such as a removed or renamed public command, setting, option, API, file format, or schema, or a changed behavior that existing users or callers rely on. When you are unsure, prefer `New` and do not claim a break.

## Sources

- The code change (the diff) decides what the message says. Describe the change set that is being committed, not the whole task.
- The task name, the task description, and the AI-generated report files of the task (plans, run records, reviews, debug reports, documentation records) give the intent and help you choose the prefix and the wording. A task usually covers more than one commit, so ignore any part of a report that the code change does not contain.
- Files under `.history/` are task records. They are context, not part of the change that the message describes.
