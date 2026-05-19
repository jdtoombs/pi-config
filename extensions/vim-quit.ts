import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.on("input", async (event, ctx) => {
    if (event.source !== "interactive") return { action: "continue" };

    const command = event.text.trim();
    if (command === ":q" || command === ":quit") {
      ctx.ui.notify("Exiting pi...", "info");
      ctx.shutdown();
      return { action: "handled" };
    }

    return { action: "continue" };
  });
}
