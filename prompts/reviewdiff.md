---
description: Review the current git diff for bugs, regressions, and missing tests
argument-hint: "[focus area or extra context]"
---
Review the current git diff. Focus on correctness, regressions, edge cases, missing tests, security issues, performance problems, and confusing code.

Extra context or focus:
$ARGUMENTS

Instructions:
1. If `bash` is available, inspect the diff with read-only git commands such as `git status --short`, `git diff --stat`, `git diff`, and `git diff --cached` if relevant.
2. If `bash` is not available, ask me to paste the diff or provide the files to review.
3. Do not edit files or make commits.
4. Prioritize findings by severity.
5. For each finding, include the file/location, why it matters, and a concrete suggested fix.
6. If there are no serious issues, say so and mention any minor risks or test gaps.
