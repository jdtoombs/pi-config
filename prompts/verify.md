---
description: Verify the current work with relevant tests, lint, and build commands
argument-hint: "[what changed or what to verify]"
---
Verify the current work and summarize whether it is ready.

Scope or context:
$ARGUMENTS

Instructions:
1. Inspect the repository to identify the relevant test, lint, typecheck, and build commands. Prefer project documentation and package scripts over guessing.
2. Run the smallest useful verification commands first, then broader commands if appropriate.
3. If failures occur and edit tools are available, fix them when the fix is clear and safe. If edit tools are not available or the fix is ambiguous, report the failure and recommended next step.
4. Keep track of every command run and whether it passed or failed.
5. End with a concise verification summary: passed checks, failed checks, fixes made, remaining risks, and suggested next command if anything is unresolved.
