import { SessionManager, type ExtensionAPI, type ExtensionContext, type SessionInfo } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, truncateToWidth } from "@earendil-works/pi-tui";

const LANDING_FRAMES = [
  String.raw`
░░░░░░░░░░░░░░░░░
░░░░░▀▄░░░▄▀░░░░░
░░░░▄█▀███▀█▄░░░░
░░░█▀███████▀█░░░
░░░█░█▀▀▀▀▀█░█░░░
░░░░░░▀▀░▀▀░░░░░░
░░░░░░░░░░░░░░░░░`,
  String.raw`
░░░░░░░░░░░░░░░░░
░░░▄░▀▄░░░▄▀░▄░░░
░░░█▄███████▄█░░░
░░░███▄███▄███░░░
░░░▀█████████▀░░░
░░░░▄▀░░░░░▀▄░░░░
░░░░░░░░░░░░░░░░░`,
] as const;

type LandingChoice =
  | { type: "new" }
  | { type: "session"; path: string }
  | null;

type LandingOption = {
  label: string;
  value: Exclude<LandingChoice, null>;
};

type SwitchableContext = ExtensionContext & {
  newSession?: (options?: any) => Promise<{ cancelled?: boolean } | void>;
  switchSession?: (sessionPath: string, options?: any) => Promise<{ cancelled?: boolean } | void>;
};

function formatRelativeTime(date: Date) {
  const seconds = Math.max(1, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function conversationTitle(session: SessionInfo) {
  const title = session.name || session.firstMessage || "Untitled conversation";
  const normalized = title.replace(/\s+/g, " ").trim();
  return normalized.length > 72 ? `${normalized.slice(0, 69)}...` : normalized;
}

async function getLandingOptions(ctx: SwitchableContext): Promise<LandingOption[]> {
  const sessions = (await SessionManager.listAll())
    .filter((session) => session.path !== ctx.sessionManager.getSessionFile())
    .sort((a, b) => b.modified.getTime() - a.modified.getTime())
    .slice(0, 3);

  return [
    ...sessions.map((session) => ({
      value: { type: "session" as const, path: session.path },
      label: `${formatRelativeTime(session.modified)} · ${conversationTitle(session)} (${session.messageCount} msgs)`,
    })),
    { value: { type: "new" as const }, label: "Start a new conversation" },
  ];
}

async function selectLandingAction(ctx: SwitchableContext) {
  const options = await getLandingOptions(ctx);

  return ctx.ui.custom<LandingChoice>((tui, theme, _keybindings, done) => {
    let selectedIndex = 0;
    let frameIndex = 0;
    let cachedLines: string[] | undefined;
    let interval: ReturnType<typeof setInterval> | undefined;

    const refresh = () => {
      cachedLines = undefined;
      tui.requestRender();
    };

    const finish = (value: LandingChoice) => {
      if (interval) clearInterval(interval);
      done(value);
    };

    interval = setInterval(() => {
      frameIndex = (frameIndex + 1) % LANDING_FRAMES.length;
      refresh();
    }, 450);

    return {
      render(width: number) {
        if (cachedLines) return cachedLines;

        const lines: string[] = [];
        const add = (text = "") => lines.push(truncateToWidth(text, width));
        const center = (text: string, style: "accent" | "text" | "dim" = "accent") => {
          const padding = Math.max(0, Math.floor((width - text.length) / 2));
          add(`${" ".repeat(padding)}${theme.fg(style, text)}`);
        };

        for (const line of LANDING_FRAMES[frameIndex].split("\n")) {
          center(line);
        }

        lines.push("");
        options.forEach((option, index) => {
          const selected = index === selectedIndex;
          const text = `${selected ? "> " : "  "}${index + 1}. ${option.label}`;
          center(text, selected ? "accent" : "text");
        });
        lines.push("");
        center("↑↓/jk navigate • 1-4 or Enter/l to select • Esc/h to cancel", "dim");

        const terminalRows = (tui as any).terminal?.rows ?? process.stdout.rows ?? lines.length;
        const topPadding = Math.max(0, Math.floor((terminalRows - lines.length) / 2));
        const fullScreenLines = [
          ...Array.from({ length: topPadding }, () => ""),
          ...lines,
        ];
        while (fullScreenLines.length < terminalRows) fullScreenLines.push("");

        cachedLines = fullScreenLines;
        return fullScreenLines;
      },
      invalidate() {
        cachedLines = undefined;
      },
      handleInput(data: string) {
        const optionNumber = Number(data);
        if (Number.isInteger(optionNumber) && optionNumber >= 1 && optionNumber <= options.length) {
          finish(options[optionNumber - 1].value);
          return;
        }

        if (matchesKey(data, Key.up) || data === "k") {
          selectedIndex = Math.max(0, selectedIndex - 1);
          refresh();
          return;
        }
        if (matchesKey(data, Key.down) || data === "j") {
          selectedIndex = Math.min(options.length - 1, selectedIndex + 1);
          refresh();
          return;
        }
        if (matchesKey(data, Key.enter) || data === "l") {
          finish(options[selectedIndex].value);
          return;
        }
        if (matchesKey(data, Key.escape) || data === "h") {
          finish(null);
        }
      },
    };
  });
}

async function showLanding(ctx: SwitchableContext) {
  if (!ctx.hasUI) return;

  if (!ctx.isIdle()) {
    ctx.ui.notify("Landing page is available when Pi is idle. Use Escape to abort the current response.", "info");
    return;
  }

  const choice = await selectLandingAction(ctx);
  if (!choice) return;

  if (choice.type === "new") {
    if (ctx.newSession) {
      await ctx.newSession({
        withSession: async (nextCtx: ExtensionContext) => {
          nextCtx.ui.notify("Started new conversation", "info");
        },
      });
      return;
    }

    ctx.ui.notify("Press Enter to start a new conversation.", "info");
    ctx.ui.setEditorText("/new");
    return;
  }

  if (ctx.switchSession) {
    const result = await ctx.switchSession(choice.path, {
      withSession: async (nextCtx: ExtensionContext) => {
        nextCtx.ui.notify("Resumed selected conversation", "info");
      },
    });
    if (!result?.cancelled) return;
  }

  const encodedPath = Buffer.from(choice.path, "utf8").toString("base64url");
  ctx.ui.notify("Press Enter to resume the selected conversation.", "info");
  ctx.ui.setEditorText(`/landing-resume ${encodedPath}`);
}

function decodeSessionPath(encodedPath: string) {
  return Buffer.from(encodedPath.trim(), "base64url").toString("utf8");
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("landing", {
    description: "Show the custom Pi landing page",
    handler: async (_args, ctx) => {
      await showLanding(ctx);
    },
  });

  pi.registerCommand("landing-resume", {
    description: "Resume a landing-page selected session",
    handler: async (args, ctx) => {
      const sessionPath = decodeSessionPath(args);
      if (!sessionPath) {
        ctx.ui.notify("Missing selected session path.", "error");
        return;
      }

      await ctx.switchSession(sessionPath, {
        withSession: async (nextCtx: ExtensionContext) => {
          nextCtx.ui.notify("Resumed selected conversation", "info");
        },
      });
    },
  });

  pi.registerShortcut("alt+escape", {
    description: "Show the custom Pi landing page",
    handler: async (ctx) => {
      await showLanding(ctx);
    },
  });

  pi.on("session_start", async (event, ctx) => {
    if (event.reason !== "startup" || !ctx.hasUI) return;
    await showLanding(ctx);
  });
}
