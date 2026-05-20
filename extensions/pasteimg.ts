import { execFile } from "node:child_process";
import { readFile, unlink } from "node:fs/promises";
import { promisify } from "node:util";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const execFileAsync = promisify(execFile);
const DEFAULT_PROMPT = "Analyze this image.";
const PASTEIMG_COMMAND = "/home/jdtoombs/bin/pasteimg";

async function pasteClipboardImage(): Promise<string> {
  const { stdout } = await execFileAsync(PASTEIMG_COMMAND, [], { timeout: 10_000 });
  return stdout.trim().split(/\r?\n/).at(-1)?.trim() ?? "";
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("pasteimg", {
    description: "Paste the clipboard image and send it to the model with an optional prompt",
    handler: async (args, ctx) => {
      if (!ctx.isIdle()) {
        ctx.ui.notify("/pasteimg is available when Pi is idle. Use Escape to abort the current response.", "info");
        return;
      }

      let imagePath = "";
      try {
        imagePath = await pasteClipboardImage();
        if (!imagePath) throw new Error("pasteimg did not return an image path");

        const data = (await readFile(imagePath)).toString("base64");
        const prompt = args.trim() || DEFAULT_PROMPT;

        await pi.sendUserMessage([
          { type: "text", text: prompt },
          { type: "image", data, mimeType: "image/png" },
        ]);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(`Could not paste image: ${message}`, "error");
      } finally {
        if (imagePath.startsWith("/tmp/paste-")) {
          await unlink(imagePath).catch(() => undefined);
        }
      }
    },
  });
}
