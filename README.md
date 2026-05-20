# My Pi Coding Agent Config

Personal configuration for [Pi](https://pi.dev), a minimal terminal coding agent harness.

This repository is intended to be checked out at:

```bash
~/.pi/agent
```

## What is included

- `settings.json` — default provider/model, thinking level, and installed package list.
- `keybindings.json` — Vim-style navigation shortcuts for Pi's TUI.
- `extensions/vim-quit.ts` — adds `:q` and `:quit` commands to exit Pi from interactive mode.
- `extensions/landing.ts` — adds `/landing` and `Alt+Escape` for returning to the custom landing menu.
- `skills/code-simplifier/SKILL.md` — code refinement skill for simplifying and cleaning up code while preserving behavior.
- `skills/plan/SKILL.md` — Pi-native planning workflow skill adapted from HazAT/pi-config.
- `skills/write-todos/SKILL.md` — Pi-native task/todo-writing skill adapted from HazAT/pi-config.
- `prompts/plan.md` — `/plan` prompt template for starting the planning workflow.
- `prompts/todos.md` — `/todos` prompt template for creating implementation todos.
- `README.md` — this documentation.
- `.gitignore` — excludes credentials, sessions, package checkouts, caches, and other machine-local files.

## Current defaults

Pi is configured with:

- Provider: `openai`
- Model: `gpt-5.5`
- Thinking level: `low`

Installed Pi packages are tracked in `settings.json`:

- `git:github.com/pasky/chrome-cdp-skill@v1.0.1`

## Chrome CDP skill

This config includes the [`chrome-cdp-skill`](https://github.com/pasky/chrome-cdp-skill), which allows Pi to inspect and interact with your live Chrome browser session after you explicitly enable Chrome remote debugging.

Install/restore with:

```bash
pi install git:github.com/pasky/chrome-cdp-skill@v1.0.1
```

Then enable Chrome remote debugging in Chrome:

```text
chrome://inspect/#remote-debugging
```

Toggle remote debugging on, then restart Pi or run `/reload`.

> Security note: this skill can allow an agent to read and interact with tabs in your existing logged-in browser session. Only use it with trusted agents and workflows.

## Code simplifier skill

This config includes a `code-simplifier` skill adapted from [HazAT/pi-config](https://github.com/HazAT/pi-config/blob/main/skills/code-simplifier/SKILL.md).

It helps Pi simplify and refine code for clarity, consistency, and maintainability while preserving existing behavior. It is useful for prompts like:

- “simplify this code”
- “clean this up”
- “refactor for clarity”
- “improve readability”

The skill lives at:

```bash
skills/code-simplifier/SKILL.md
```

After cloning this config, restart Pi or run `/reload` so Pi discovers the skill.

## Planning and todo skills

This config includes Pi-native `plan` and `write-todos` skills adapted from [HazAT/pi-config skills](https://github.com/HazAT/pi-config/tree/main/skills).

Unlike the upstream Solo-native versions, these local versions use normal repository files instead of Solo subagents, scratchpads, and todos:

- `skills/plan/SKILL.md` — scouts the repo, writes an evidence-based plan to `.pi/plans/<slug>.md`, and asks before implementation.
- `skills/write-todos/SKILL.md` — creates clear implementation todos in `TODO.md` or `.pi/todos/<slug>.md` with context, constraints, references, and acceptance criteria.
- `prompts/plan.md` — use `/plan <request>` to start a planning workflow.
- `prompts/todos.md` — use `/todos <request or plan path>` to create implementation todos.

## Vim-style keybindings

`keybindings.json` adds familiar navigation shortcuts:

- `Ctrl+h/j/k/l` for left/down/up/right in the editor and selectors.
- `Ctrl+b` / `Ctrl+w` for word-left / word-right.
- `Ctrl+l` to confirm selector items.
- `Ctrl+c` / `Ctrl+h` to cancel selectors.
- `Ctrl+Shift+j/k` to reorder models.

## Landing page shortcut

`extensions/landing.ts` adds a custom landing menu with shortcuts for common actions:

- New session
- Resume session
- Session tree
- Plan something
- Write todos
- Settings
- Reload config

Open it with:

```text
Alt+Escape
```

or:

```text
/landing
```

The shortcut only opens the landing menu when Pi is idle. Plain `Escape` remains available to abort/cancel active responses.

## Vim quit extension

`extensions/vim-quit.ts` lets you quit Pi by typing:

```text
:q
```

or:

```text
:quit
```

## Restoring this config on a new machine

```bash
mkdir -p ~/.pi
cd ~/.pi
git clone <your-repo-url> agent
cd ~/.pi/agent
pi install git:github.com/pasky/chrome-cdp-skill@v1.0.1
```

Then authenticate Pi separately using `/login` or environment variables. Do **not** commit auth files or API keys.

## Files intentionally not committed

The following are machine-local or sensitive and should stay out of git:

- `auth.json` — OAuth/API authentication data.
- `sessions/` — saved conversation history, which may contain secrets or private code.
- `git/` and `npm/` — installed package checkouts/caches; restore them with `pi install`.
- caches, logs, temporary files, and local overrides.

## How Pi builds model context

For each turn, Pi sends the model two main pieces of context:

1. **System prompt** — built by Pi before the request. By default this is generated in the installed Pi package at:

   ```bash
   /home/jdtoombs/.nvm/versions/node/v20.19.3/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/system-prompt.js
   ```

   You usually should not edit that installed package file directly because package updates can overwrite it. To customize the prompt, add one of these files instead:

   - Project override: `<project>/.pi/SYSTEM.md`
   - Global override: `~/.pi/agent/SYSTEM.md`
   - Project append-only additions: `<project>/.pi/APPEND_SYSTEM.md`
   - Global append-only additions: `~/.pi/agent/APPEND_SYSTEM.md`

   `SYSTEM.md` replaces the default generated prompt. `APPEND_SYSTEM.md` is appended to the generated or custom system prompt.

2. **Conversation messages** — stored as JSONL session entries under `~/.pi/agent/sessions/`. On resume or before a turn, Pi resolves the active conversation branch into the messages sent to the LLM. The core path is:

   - `dist/core/session-manager.js` — `buildSessionContext(...)` walks from the selected leaf entry back to the root, preserving the active branch.
   - If there is no compaction, it emits all messages on that branch.
   - If there is a compaction, it emits the compaction summary first, then the retained messages and later messages.
   - Branch summaries and extension custom messages are included as user-context messages.
   - `dist/core/messages.js` — `convertToLlm(...)` converts Pi-specific message types, such as bash execution records, compaction summaries, branch summaries, and custom extension messages, into normal LLM-compatible messages.
   - `dist/core/agent-session.js` — rebuilds `agent.state.messages` from `sessionManager.buildSessionContext().messages` and calls `agent.prompt(messages)` for each turn.

Project instruction files such as `AGENTS.md` and `CLAUDE.md` are not normal conversation messages. They are discovered by `dist/core/resource-loader.js` and appended into the **system prompt** as `# Project Context` unless disabled with `--no-context-files` / `-nc`.

## Useful Pi paths

This repo is intended to live at `~/.pi/agent`, so these paths can be opened directly in Neovim.

### Quick edit locations

```bash
cd ~/.pi/agent
nvim README.md
nvim settings.json
nvim keybindings.json
nvim extensions/landing.ts
nvim extensions/vim-quit.ts
nvim prompts/plan.md
nvim prompts/todos.md
nvim skills/plan/SKILL.md
nvim skills/write-todos/SKILL.md
nvim skills/code-simplifier/SKILL.md
```

### Config files in this git repo

- Global config repo: `~/.pi/agent/`
- Settings: `~/.pi/agent/settings.json`
- Keybindings: `~/.pi/agent/keybindings.json`
- Landing page extension: `~/.pi/agent/extensions/landing.ts`
- Vim quit extension: `~/.pi/agent/extensions/vim-quit.ts`
- Extensions directory: `~/.pi/agent/extensions/`
- Plan prompt template: `~/.pi/agent/prompts/plan.md`
- Todos prompt template: `~/.pi/agent/prompts/todos.md`
- Prompt templates directory: `~/.pi/agent/prompts/`
- Plan skill: `~/.pi/agent/skills/plan/SKILL.md`
- Write todos skill: `~/.pi/agent/skills/write-todos/SKILL.md`
- Code simplifier skill: `~/.pi/agent/skills/code-simplifier/SKILL.md`
- Skills directory: `~/.pi/agent/skills/`
- Themes directory, if added later: `~/.pi/agent/themes/`

### Machine-local paths not committed

- Sessions: `~/.pi/agent/sessions/`
- Auth file: `~/.pi/agent/auth.json`
- Installed package checkouts/cache: `~/.pi/agent/git/` and `~/.pi/agent/npm/`

### Installed Pi package files patched locally

These are **not** in this git repo and may be overwritten by Pi updates, but they are useful when editing local Pi behavior:

- Installed Pi package root: `/home/jdtoombs/.nvm/versions/node/v20.19.3/lib/node_modules/@earendil-works/pi-coding-agent/`
- File-change approval helper: `/home/jdtoombs/.nvm/versions/node/v20.19.3/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/tools/change-approval.js`
- Edit tool implementation: `/home/jdtoombs/.nvm/versions/node/v20.19.3/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/tools/edit.js`
- Write tool implementation: `/home/jdtoombs/.nvm/versions/node/v20.19.3/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/tools/write.js`
