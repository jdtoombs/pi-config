---
name: plan
description: Pi-native planning workflow. Use when asked to "plan", "brainstorm", "design", "create a plan", "I want to build", "let's build", or before implementing multi-step work. Scouts the repo, writes a concrete plan to a markdown file, asks for approval, then optionally creates TODO.md tasks.
---

# Plan

Use this skill to create an evidence-based implementation plan before doing multi-step work.

This is a **plain Pi-native** workflow. Do not use Solo subagents, Solo scratchpads, Solo todos, or non-existent orchestration tools.

## Goals

- Understand the requested change before editing code.
- Inspect the repository enough to ground the plan in real files and conventions.
- Write a durable plan artifact that can be committed, reviewed, resumed, or converted into todos.
- Ask the user before executing substantial implementation work.

## Default Artifacts

Prefer project-local artifacts:

- Plan: `.pi/plans/<slug>.md`
- Todos: `TODO.md` or `.pi/todos/<slug>.md` when the user wants a separate todo artifact

Create directories as needed.

If the repo already has a planning/todo convention, follow it instead.

## Workflow

### 1. Clarify the request

Restate the user's goal in one or two sentences. If the request is ambiguous, ask only the minimum necessary questions. Otherwise continue.

### 2. Scout the repository

Spend a short, bounded amount of time inspecting relevant files. Prefer commands like:

```bash
pwd
ls -la
find . -maxdepth 3 -type f | head -100
```

Then inspect likely relevant files with `read`. Check for project instructions and conventions:

- `AGENTS.md`
- `CLAUDE.md`
- `README.md`
- package/build/test config files
- existing files similar to the requested change

Do not make code changes during scouting unless explicitly asked.

### 3. Identify constraints

Capture practical constraints:

- files likely affected
- existing patterns to follow
- tests or commands that should verify the work
- risks, unknowns, and assumptions
- things not to do

### 4. Write the plan artifact

Write a markdown plan using this structure:

```markdown
# Plan: <short title>

## Goal

<What we are trying to accomplish and why.>

## Current State

<Evidence from inspected files. Include paths.>

## Proposed Approach

<High-level design and rationale.>

## Steps

1. <Concrete implementation step>
2. <Concrete implementation step>
3. <Concrete implementation step>

## Files Likely to Change

- `path/to/file` — <expected change>

## Verification

- `<command>` — <what it verifies>
- <manual check if needed>

## Risks / Open Questions

- <risk or question>

## Out of Scope

- <explicitly excluded work>
```

Use a filename like:

```text
.pi/plans/YYYY-MM-DD-short-slug.md
```

### 5. Present summary and ask for approval

After writing the plan, summarize:

- plan path
- major approach
- verification strategy
- open questions

Ask whether to:

1. implement the plan now
2. revise the plan
3. convert it into todos first
4. stop after planning

### 6. Execute only after approval

Do not begin implementation until the user approves. If approved, follow the plan step by step. Update the plan if reality changes significantly.

## Rules

- Do not invent repository details. Inspect files and cite real paths.
- Prefer simple, direct plans over over-engineered designs.
- Keep plan scope aligned to the user's request.
- Do not create backwards-compatibility shims or fallback paths unless the user asks or the project requires them.
- Prefer editing existing files over creating new abstractions.
- Include verification commands whenever possible.
- If tests are unavailable, say so and provide the best available checks.
