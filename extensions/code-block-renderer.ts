import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Markdown } from "@earendil-works/pi-tui";

const PATCH_FLAG = "__jdtoombsCodeBlockRendererPatched";

type MarkdownInternals = Markdown & {
  theme: {
    codeBlock: (text: string) => string;
    highlightCode?: (code: string, lang?: string) => string[];
    codeBlockIndent?: string;
  };
  renderToken: (token: MarkdownToken, width: number, nextTokenType?: string, styleContext?: unknown) => string[];
  __jdtoombsCodeBlockRendererPatched?: true;
};

type MarkdownToken = {
  type: string;
  text?: string;
  lang?: string;
};

function patchMarkdownCodeBlocks(): boolean {
  const prototype = Markdown.prototype as unknown as MarkdownInternals;
  if (prototype[PATCH_FLAG]) return false;

  const originalRenderToken = prototype.renderToken;

  prototype.renderToken = function renderTokenWithoutFenceLines(
    token: MarkdownToken,
    width: number,
    nextTokenType?: string,
    styleContext?: unknown,
  ): string[] {
    if (token.type !== "code") {
      return originalRenderToken.call(this, token, width, nextTokenType, styleContext);
    }

    const indent = this.theme.codeBlockIndent ?? "  ";
    const code = token.text ?? "";
    const highlightedLines = this.theme.highlightCode
      ? this.theme.highlightCode(code, token.lang)
      : code.split("\n").map((line) => this.theme.codeBlock(line));

    const lines = highlightedLines.map((line) => `${indent}${line}`);

    if (nextTokenType && nextTokenType !== "space") {
      lines.push("");
    }

    return lines;
  };

  prototype[PATCH_FLAG] = true;
  return true;
}

export default function (pi: ExtensionAPI) {
  // NOTE: This intentionally patches Pi's internal Markdown renderer. Pi does
  // not currently expose a public setting/API for assistant code-block framing,
  // so this may need adjustment after Pi upgrades.
  patchMarkdownCodeBlocks();

  pi.registerCommand("codeblocks", {
    description: "Show a sample fenced code block using the custom renderer",
    handler: async (_args, ctx) => {
      await pi.sendMessage({
        customType: "code-block-renderer",
        display: true,
        content: [
          "Code block renderer sample:",
          "",
          "```json",
          JSON.stringify({ fences: "hidden", highlighting: "kept" }, null, 2),
          "```",
        ].join("\n"),
      });

      ctx.ui.notify("Rendered sample code block. If fences are still visible, run /reload and try again.", "info");
    },
  });
}
