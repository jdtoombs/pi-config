import { type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, truncateToWidth } from "@earendil-works/pi-tui";

type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

const EFFORT_LEVELS: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh"];

const DESCRIPTIONS: Record<ThinkingLevel, string> = {
  off: "No extended reasoning",
  minimal: "Smallest reasoning budget",
  low: "Light reasoning",
  medium: "Balanced reasoning",
  high: "Deeper reasoning",
  xhigh: "Maximum reasoning where supported",
};

function isThinkingLevel(value: string): value is ThinkingLevel {
  return (EFFORT_LEVELS as string[]).includes(value);
}

async function chooseEffort(pi: ExtensionAPI, ctx: ExtensionContext): Promise<ThinkingLevel | null> {
  if (!ctx.hasUI) return null;

  const current = pi.getThinkingLevel() as ThinkingLevel;
  let selectedIndex = Math.max(0, EFFORT_LEVELS.indexOf(current));
  let cachedLines: string[] | undefined;

  return ctx.ui.custom<ThinkingLevel | null>((tui, theme, _keybindings, done) => {
    const refresh = () => {
      cachedLines = undefined;
      tui.requestRender();
    };

    return {
      render(width: number) {
        if (cachedLines) return cachedLines;

        const lines: string[] = [];
        const add = (text = "") => lines.push(truncateToWidth(text, width));

        add(theme.fg("accent", "Select model effort / thinking level"));
        add(theme.fg("dim", `Current: ${current}`));
        add("");

        EFFORT_LEVELS.forEach((level, index) => {
          const selected = index === selectedIndex;
          const currentMarker = level === current ? "*" : " ";
          const selector = selected ? ">" : " ";
          const text = `${selector} ${index + 1}. ${level.padEnd(7)} ${currentMarker} ${DESCRIPTIONS[level]}`;
          add(selected ? theme.fg("accent", text) : text);
        });

        add("");
        add(theme.fg("dim", "↑↓/jk navigate • 1-6 or Enter/l to select • Esc/h to cancel"));

        cachedLines = lines;
        return lines;
      },
      invalidate() {
        cachedLines = undefined;
      },
      handleInput(data: string) {
        const optionNumber = Number(data);
        if (Number.isInteger(optionNumber) && optionNumber >= 1 && optionNumber <= EFFORT_LEVELS.length) {
          done(EFFORT_LEVELS[optionNumber - 1]);
          return;
        }

        if (matchesKey(data, Key.up) || data === "k") {
          selectedIndex = Math.max(0, selectedIndex - 1);
          refresh();
          return;
        }
        if (matchesKey(data, Key.down) || data === "j") {
          selectedIndex = Math.min(EFFORT_LEVELS.length - 1, selectedIndex + 1);
          refresh();
          return;
        }
        if (matchesKey(data, Key.enter) || data === "l") {
          done(EFFORT_LEVELS[selectedIndex]);
          return;
        }
        if (matchesKey(data, Key.escape) || data === "h") {
          done(null);
        }
      },
    };
  });
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("effort", {
    description: "Choose model effort/thinking level (off, minimal, low, medium, high, xhigh)",
    getArgumentCompletions: (prefix: string) => {
      const items = EFFORT_LEVELS.map((level) => ({
        value: level,
        label: `${level} - ${DESCRIPTIONS[level]}`,
      })).filter((item) => item.value.startsWith(prefix.trim().toLowerCase()));

      return items.length > 0 ? items : null;
    },
    handler: async (args, ctx) => {
      const requested = args.trim().toLowerCase();
      const level = requested ? requested : await chooseEffort(pi, ctx);

      if (!level) return;

      if (!isThinkingLevel(level)) {
        ctx.ui.notify(`Unknown effort level: ${requested}. Use one of: ${EFFORT_LEVELS.join(", ")}`, "error");
        return;
      }

      pi.setThinkingLevel(level);
      ctx.ui.notify(`Effort set to ${pi.getThinkingLevel()}`, "info");
    },
  });
}
