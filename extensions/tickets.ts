import path from "node:path";
import os from "node:os";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

const SUBCOMMANDS = ["start", "starrt", "integrate", "list", "cleanup"] as const;

type ParsedArgs = {
  subcommand: "start" | "integrate" | "list" | "cleanup";
  tickets: string[];
  base?: string;
  dir?: string;
  prefix: string;
  tmux: boolean;
  launch?: string;
};

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
}

function splitTickets(value: string) {
  return value
    .split(/[\s,\n]+/)
    .map((ticket) => ticket.trim())
    .filter(Boolean);
}

function parseArgs(args: string): ParsedArgs {
  const parts = args.trim().split(/\s+/).filter(Boolean);
  let subcommand: ParsedArgs["subcommand"] = "start";
  let tmux = false;
  let base: string | undefined;
  let dir: string | undefined;
  let launch: string | undefined;
  let prefix = "ticket/";
  const tickets: string[] = [];

  const first = parts[0]?.toLowerCase();
  if (first && (SUBCOMMANDS as readonly string[]).includes(first)) {
    subcommand = first === "starrt" ? "start" : first as ParsedArgs["subcommand"];
    parts.shift();
  }

  for (let index = 0; index < parts.length; index++) {
    const part = parts[index];
    if (part === "--tmux" || part === "-t") {
      tmux = true;
    } else if ((part === "--base" || part === "-b") && parts[index + 1]) {
      base = parts[++index];
    } else if ((part === "--dir" || part === "-d") && parts[index + 1]) {
      dir = parts[++index];
    } else if ((part === "--prefix" || part === "-p") && parts[index + 1]) {
      prefix = parts[++index];
    } else if (part === "--launch" && parts[index + 1]) {
      launch = parts[++index];
    } else {
      tickets.push(...splitTickets(part));
    }
  }

  return { subcommand, tickets, base, dir, prefix, tmux, launch };
}

async function execChecked(pi: ExtensionAPI, command: string, args: string[], timeout = 30_000) {
  const result = await pi.exec(command, args, { timeout });
  if (result.code !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(output || `${command} exited with ${result.code}`);
  }
  return result.stdout.trim();
}

async function maybeCurrentBranch(pi: ExtensionAPI, cwd: string) {
  try {
    return await execChecked(pi, "git", ["-C", cwd, "symbolic-ref", "--quiet", "--short", "HEAD"], 5_000);
  } catch {
    return "main";
  }
}

async function repoRoot(pi: ExtensionAPI, cwd: string) {
  return execChecked(pi, "git", ["-C", cwd, "rev-parse", "--show-toplevel"], 5_000);
}

function defaultWorktreeDir(repo: string) {
  return path.join(path.dirname(repo), `${path.basename(repo)}-worktrees`);
}

function worktreePath(ticket: string, dir: string) {
  return path.join(dir, slugify(ticket));
}

function ticketScriptPath() {
  return path.join(os.homedir(), ".pi", "agent", "scripts", "ticket-batch");
}

async function ensureTickets(ctx: ExtensionCommandContext, parsed: ParsedArgs) {
  if (parsed.tickets.length > 0 || parsed.subcommand === "list") return parsed.tickets;
  const entered = await ctx.ui.input("Ticket IDs", "e.g. T-1 T-2 T-3 T-4");
  return splitTickets(entered || "");
}

async function runTicketBatch(pi: ExtensionAPI, ctx: ExtensionCommandContext, parsed: ParsedArgs, tickets: string[]) {
  const script = ticketScriptPath();
  const args = [parsed.subcommand, "--repo", ctx.cwd];
  if (parsed.base) args.push("--base", parsed.base);
  if (parsed.dir) args.push("--dir", parsed.dir);
  if (parsed.prefix) args.push("--prefix", parsed.prefix);
  if (parsed.launch) args.push("--launch", parsed.launch);
  args.push(...tickets);

  const result = await pi.exec(script, args, { timeout: 120_000 });
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  if (result.code !== 0) throw new Error(output || `ticket-batch exited with ${result.code}`);
  return output;
}

async function launchTmux(pi: ExtensionAPI, ctx: ExtensionCommandContext, parsed: ParsedArgs, tickets: string[]) {
  await execChecked(pi, "tmux", ["-V"], 5_000);

  const repo = await repoRoot(pi, ctx.cwd);
  const dir = parsed.dir ? path.resolve(ctx.cwd, parsed.dir) : defaultWorktreeDir(repo);
  const worktrees = tickets.map((ticket) => worktreePath(ticket, dir));
  const repoSlug = (slugify(path.basename(repo)).replace(/[^a-z0-9-]+/g, "-") || "repo").slice(0, 32);
  const windowName = `tickets-${repoSlug}`.slice(0, 48);
  const piCommand = parsed.launch || "pi";

  let target: string;
  let attachHint: string | undefined;

  if (process.env.TMUX) {
    target = await execChecked(pi, "tmux", ["new-window", "-P", "-F", "#{window_id}", "-n", windowName, "-c", worktrees[0]], 10_000);
  } else {
    const sessionName = `pi-tickets-${repoSlug}`.slice(0, 48);
    target = await execChecked(pi, "tmux", ["new-session", "-d", "-P", "-F", "#{window_id}", "-s", sessionName, "-n", windowName, "-c", worktrees[0]], 10_000);
    attachHint = `tmux attach -t ${shellQuote(sessionName)}`;
  }

  await execChecked(pi, "tmux", ["send-keys", "-t", target, piCommand, "C-m"], 10_000);

  for (const worktree of worktrees.slice(1)) {
    const pane = await execChecked(pi, "tmux", ["split-window", "-t", target, "-c", worktree, "-P", "-F", "#{pane_id}"], 10_000);
    await execChecked(pi, "tmux", ["send-keys", "-t", pane, piCommand, "C-m"], 10_000);
  }

  await execChecked(pi, "tmux", ["select-layout", "-t", target, "tiled"], 10_000);

  if (attachHint) {
    ctx.ui.notify(`Created tmux session. Attach with: ${attachHint}`, "info");
  } else {
    ctx.ui.notify(`Opened ${tickets.length} Pi pane${tickets.length === 1 ? "" : "s"} in tmux.`, "info");
  }
}

export default function ticketExtension(pi: ExtensionAPI) {
  pi.registerCommand("tickets", {
    description: "Create ticket worktrees, optionally launch one auto-started Pi tmux pane per ticket, and integrate later",
    getArgumentCompletions: (prefix: string) => {
      const options = ["start", "start --tmux", "integrate", "list", "cleanup"];
      const filtered = options.filter((option) => option.startsWith(prefix.trim().toLowerCase()));
      return filtered.length ? filtered.map((value) => ({ value, label: value })) : null;
    },
    handler: async (args, ctx) => {
      const parsed = parseArgs(args);

      try {
        if (!parsed.base && parsed.subcommand !== "list") {
          parsed.base = await maybeCurrentBranch(pi, ctx.cwd);
        }

        const tickets = await ensureTickets(ctx, parsed);
        if (parsed.subcommand !== "list" && tickets.length === 0) {
          ctx.ui.notify("No tickets provided.", "error");
          return;
        }

        const output = await runTicketBatch(pi, ctx, parsed, tickets);
        if (output) ctx.ui.notify(output.length > 500 ? `${output.slice(0, 500)}…` : output, "info");

        if (parsed.subcommand === "start" && parsed.tmux) {
          await launchTmux(pi, ctx, parsed, tickets);
        }
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
      }
    },
  });
}
