---
name: write-todos
description: Write clear Pi-native implementation todos from a plan or request. Use when asked to "create todos", "write todos", "break into tasks", "plan todos", or convert a plan into actionable work items. Produces TODO.md-style tasks with context, constraints, files, and acceptance criteria.
---

# Write Todos

Use this skill to turn a plan or feature request into concrete, executable todos.

This is a **plain Pi-native** workflow. Do not use Solo todos, Solo scratchpads, subagents, or non-existent orchestration tools.

## Default Artifact

Prefer one of:

- `TODO.md` for repo-level task tracking
- `.pi/todos/<slug>.md` for planning-specific task lists

If the repository already has a todo/planning convention, follow it.

## Todo Format

Use markdown checkboxes with enough detail that the work can be resumed later.

```markdown
# TODO: <short title>

Source plan: `.pi/plans/<plan-file>.md` <!-- omit if none -->

## Context

<Brief summary of the goal and important architectural decisions.>

## Tasks

### 1. <Task title>

- [ ] Status: pending
- **Outcome:** <what this task produces>
- **Files:**
  - `path/to/file` — <expected change>
- **Constraints:**
  - <patterns/libraries/anti-patterns to follow or avoid>
- **References:**
  - `path/to/example.ts` — <pattern to follow>
- **Acceptance criteria:**
  - [ ] <specific, verifiable criterion>
  - [ ] `<command>` passes

### 2. <Task title>

...
```

## Rules

### Preserve architectural intent

Repeat relevant plan decisions in the todo body. Do not rely on memory or unstated context.

Weak:

```markdown
- [ ] Build the service
```

Strong:

```markdown
### Add the user settings service

- [ ] Status: pending
- **Outcome:** Add a settings service that reads/writes user preferences through the existing repository layer.
- **Files:**
  - `src/settings/service.ts` — new service functions
  - `src/settings/repository.ts` — add missing repository methods if needed
- **Constraints:**
  - Use the existing repository abstraction.
  - Do not add direct SQL calls in route handlers.
  - Keep validation at the API boundary.
- **Acceptance criteria:**
  - [ ] Settings can be saved and read back.
  - [ ] `npm test` passes.
```

### Keep tasks focused

One todo should be small enough to complete and verify in a single focused work session. Split tasks when they:

- touch unrelated behavior
- span too many files
- require separate verification
- mix refactoring with feature implementation

### Include references

When possible, include exact files or patterns to follow. If no reference exists, include a short expected shape or describe the intended structure.

### Make acceptance criteria verifiable

Prefer concrete checks:

- test commands
- lint/typecheck commands
- specific UI behavior
- API response shape
- files that should exist
- screenshots/manual browser checks when relevant

Avoid vague criteria like “works well” or “is clean.”

## Workflow

1. Read the plan if one exists.
2. Inspect relevant files if needed to ground tasks in real paths.
3. Choose `TODO.md` or `.pi/todos/<slug>.md`.
4. Write focused tasks with outcomes, files, constraints, references, and acceptance criteria.
5. Summarize the artifact path and ask whether to begin execution.

## Updating Todos During Work

When executing tasks:

- Mark active task status as `in-progress` if useful.
- Check off acceptance criteria as they are verified.
- Mark completed tasks with `[x]`.
- Add notes when implementation differs from the original plan.
- Do not silently delete skipped tasks; mark them as skipped with a reason.
