import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const ACTIONS = [
  "New session (/new)",
  "Resume session (/resume)",
  "Session tree (/tree)",
  "Plan something (/plan)",
  "Write todos (/todos)",
  "Settings (/settings)",
  "Reload config (/reload)",
  "Cancel",
] as const;

type LandingAction = (typeof ACTIONS)[number];

async function showLanding(ctx: ExtensionContext) {
  if (!ctx.hasUI) return;

  if (!ctx.isIdle()) {
    ctx.ui.notify("Landing page is available when Pi is idle. Use Escape to abort the current response.", "info");
    return;
  }

  const choice = await ctx.ui.select<LandingAction>("Pi landing", ACTIONS.map((value) => ({ value, label: value })));
  if (!choice || choice === "Cancel") return;

  switch (choice) {
    case "New session (/new)":
      ctx.ui.setEditorText("/new");
      break;
    case "Resume session (/resume)":
      ctx.ui.setEditorText("/resume");
      break;
    case "Session tree (/tree)":
      ctx.ui.setEditorText("/tree");
      break;
    case "Plan something (/plan)":
      ctx.ui.setEditorText("/plan ");
      break;
    case "Write todos (/todos)":
      ctx.ui.setEditorText("/todos ");
      break;
    case "Settings (/settings)":
      ctx.ui.setEditorText("/settings");
      break;
    case "Reload config (/reload)":
      ctx.ui.setEditorText("/reload");
      break;
  }
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("landing", {
    description: "Show the custom Pi landing page",
    handler: async (_args, ctx) => {
      await showLanding(ctx);
    },
  });

  pi.registerShortcut("alt+escape", {
    description: "Show the custom Pi landing page",
    handler: async (ctx) => {
      await showLanding(ctx);
    },
  });
}
