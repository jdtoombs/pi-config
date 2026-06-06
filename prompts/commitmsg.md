---
description: Draft a conventional commit message from the current diff
argument-hint: "[optional scope or style preference]"
---
Draft a concise commit message for the current changes.

Optional scope or style preference:
$ARGUMENTS

Instructions:
1. If `bash` is available, inspect the changes with read-only git commands such as `git status --short`, `git diff --stat`, `git diff`, and `git diff --cached` if relevant.
2. If `bash` is not available, ask me to paste the diff or staged diff.
3. Do not edit files and do not create a commit.
4. Prefer Conventional Commit format: `type(scope): summary`.
5. Keep the subject under 72 characters when possible.
6. Include a short body only if it clarifies important details, tradeoffs, or follow-up work.
7. If there are unrelated changes, propose separate commit messages.
