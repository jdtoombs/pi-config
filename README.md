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

## Useful Pi paths

- Global config: `~/.pi/agent/`
- Settings: `~/.pi/agent/settings.json`
- Keybindings: `~/.pi/agent/keybindings.json`
- Extensions: `~/.pi/agent/extensions/`
- Skills: `~/.pi/agent/skills/`
- Prompt templates: `~/.pi/agent/prompts/`
- Themes: `~/.pi/agent/themes/`
- Sessions: `~/.pi/agent/sessions/`
