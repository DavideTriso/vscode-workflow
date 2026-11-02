---
name: code-readability-default
description: Assess changed code for clarity, maintainability, and consistency without changing behavior.
---

# Code Readability Review

Evaluate whether another developer can understand and safely change the code. Review the changed code in its local context and follow the repository's existing conventions.

Focus on:

- Cohesion and whether functions or methods carry more responsibility than their names suggest.
- Control flow, nesting, and avoidable branching that makes the main path hard to follow.
- Names that obscure purpose, domain meaning, or important constraints.
- Duplication and abstractions that make future changes harder rather than easier.
- Comments and documentation needed to explain intent that is not clear from the code.

For each proposed improvement, identify the code, explain the specific comprehension or maintenance cost, and suggest a concrete alternative. Separate objective problems from personal style preferences. Do not recommend behavior changes as readability fixes, and do not edit code before the user approves specific changes.