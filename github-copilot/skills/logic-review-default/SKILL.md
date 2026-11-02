---
name: logic-review-default
description: Find confirmed behavioral defects by tracing intended behavior through code, state, and tests.
---

# Logic Review

Review changed behavior against the user's stated intent and the contracts enforced by nearby code. Trace relevant inputs, guards, state transitions, side effects, callers, and consumers before deciding that a defect exists.

For each suspected issue:

1. State the condition that triggers it and the expected behavior.
2. Follow the complete relevant path and inspect tests or checks that may prevent it.
3. Try to disprove the issue by checking guards, callers, invariants, and intentional behavior.
4. Report it only when concrete evidence supports a user-visible defect or regression.

Describe confirmed issues with severity, affected code, triggering condition, impact, and evidence. Keep speculative concerns and style preferences out of the findings. Do not modify implementation code during a review.