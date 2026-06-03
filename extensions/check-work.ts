import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";

const DEBUG_PORT = 9222;
const CDP_PORT_FILE = resolve(homedir(), "Library/Application Support/Google/Chrome/DevToolsActivePort");
const BRAVE_EXE_CANDIDATES = [
  "/mnt/c/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe",
  "/mnt/c/Program Files (x86)/BraveSoftware/Brave-Browser/Application/brave.exe",
];

function isWsl(): boolean {
  try {
    return readFileSync("/proc/version", "utf8").toLowerCase().includes("microsoft");
  }
  catch {
    return false;
  }
}

async function getBrowserWsPath(): Promise<string | null> {
  try {
    const response = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
    if (!response.ok) return null;

    const version = await response.json() as { webSocketDebuggerUrl?: string };
    const wsUrl = version.webSocketDebuggerUrl;
    if (!wsUrl) return null;

    const parsed = new URL(wsUrl);
    return parsed.pathname;
  }
  catch {
    return null;
  }
}

function writeCdpPortFile(wsPath: string): void {
  mkdirSync(dirname(CDP_PORT_FILE), { recursive: true });
  writeFileSync(CDP_PORT_FILE, `${DEBUG_PORT}\n${wsPath}\n`, "utf8");
}

function launchWindowsBrave(): boolean {
  const braveExe = BRAVE_EXE_CANDIDATES.find(existsSync);
  if (!braveExe) return false;

  spawn("cmd.exe", [
    "/c",
    "start",
    "",
    braveExe.replaceAll("/", "\\").replace(/^\\mnt\\c/i, "C:"),
    `--remote-debugging-port=${DEBUG_PORT}`,
    "--user-data-dir=%TEMP%\\pi-brave-cdp",
    "about:blank",
  ], {
    detached: true,
    stdio: "ignore",
  }).unref();

  return true;
}

async function ensureCdpReady(): Promise<{ ready: boolean; message: string }> {
  let wsPath = await getBrowserWsPath();
  if (wsPath) {
    writeCdpPortFile(wsPath);
    return { ready: true, message: `Connected to existing browser on port ${DEBUG_PORT}.` };
  }

  if (isWsl()) {
    const launched = launchWindowsBrave();
    if (launched) {
      for (let i = 0; i < 20; i++) {
        await new Promise(resolve => setTimeout(resolve, 500));
        wsPath = await getBrowserWsPath();
        if (wsPath) {
          writeCdpPortFile(wsPath);
          return { ready: true, message: "Launched Windows Brave with remote debugging enabled." };
        }
      }
    }

    return {
      ready: false,
      message: [
        "Could not reach Brave CDP from WSL.",
        "Open Windows Brave with remote debugging enabled, then run /check-work again:",
        '  "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe" --remote-debugging-port=9222 --user-data-dir=%TEMP%\\pi-brave-cdp',
      ].join("\n"),
    };
  }

  return {
    ready: false,
    message: `Could not reach Chrome/Brave CDP on port ${DEBUG_PORT}. Start the browser with --remote-debugging-port=${DEBUG_PORT}.`,
  };
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("check-work", {
    description: "Use Brave/Chrome CDP to inspect the current app/page and review UX/UI quality",
    handler: async (args, ctx) => {
      const target = args?.trim();
      const targetInstruction = target
        ? `If a URL or route is provided here, navigate Chrome/Brave to it before reviewing: ${target}`
        : "Use the currently open local app/page in Chrome/Brave. If multiple suitable tabs are open, list them and choose the most likely local app tab.";

      await ctx.waitForIdle();

      const cdpStatus = await ensureCdpReady();
      if (ctx.hasUI) {
        ctx.ui.notify(cdpStatus.message, cdpStatus.ready ? "info" : "warning");
      }

      if (!cdpStatus.ready) {
        pi.sendUserMessage([
          "The user invoked /check-work, but Chrome/Brave CDP is not reachable yet.",
          "Explain the browser setup issue concisely and include these instructions:",
          cdpStatus.message,
        ].join("\n\n"));
        return;
      }

      pi.sendUserMessage(`
The user explicitly approved Chrome/Brave CDP inspection by invoking /check-work.

Use the chrome-cdp skill to inspect the UI/UX of the current work.
Environment note: this may be WSL using Windows Brave. The extension prepared the DevToolsActivePort bridge for localhost:${DEBUG_PORT}. ${cdpStatus.message}
${targetInstruction}

Review the page as a product/UI reviewer, not just as a DOM checker:
1. Connect to Chrome CDP and identify the correct tab.
2. Capture a screenshot and inspect the accessibility snapshot/DOM as needed.
3. Check visual hierarchy, spacing, alignment, responsive layout, touch targets, readability, color/contrast, loading/empty states, and obvious interaction issues.
4. If relevant, click through the area recently changed and validate the intended flow.
5. Report concise findings grouped as: Looks good, Issues found, Recommended fixes.
6. If code changes are needed, propose them first unless the fix is obvious and low-risk.
`.trim());
    },
  });
}
