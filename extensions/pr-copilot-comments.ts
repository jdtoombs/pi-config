import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const ACTIONS = [
	"Send instruction to agent",
	"Ask agent to explain",
	"Mark resolved now",
	"Skip",
	"Stop reviewing",
] as const;

const POST_AGENT_ACTIONS = [
	"Mark resolved",
	"Resolve with comment",
	"Comment only",
	"Leave unresolved",
	"Send another instruction",
	"Stop reviewing",
] as const;

type ReviewComment = {
	author?: { login?: string } | null;
	body?: string;
	path?: string;
	line?: number | null;
	originalLine?: number | null;
	diffHunk?: string;
	url?: string;
	createdAt?: string;
};

type ReviewThread = {
	id: string;
	isResolved: boolean;
	comments?: { nodes?: ReviewComment[] };
};

type ReviewThreadPage = {
	data?: {
		repository?: {
			pullRequest?: {
				reviewThreads?: {
					pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
					nodes?: ReviewThread[];
				};
			};
		};
	};
};

type Review = {
	user?: { login?: string };
	state?: string;
	body?: string;
	html_url?: string;
	submitted_at?: string;
};

type PullRequest = {
	number: number;
	title: string;
	url: string;
	headRefName: string;
	state: string;
};

type CopilotComment = {
	kind: "review-thread" | "review-body";
	body: string;
	path?: string;
	line?: number | null;
	url?: string;
	diffHunk?: string;
	createdAt?: string;
	threadId?: string;
	isResolved?: boolean;
	commentCount?: number;
};

type ParsedArgs = {
	prArg: string;
	includeResolved: boolean;
};

type CommentAction = typeof ACTIONS[number] | null;
type PostAgentAction = typeof POST_AGENT_ACTIONS[number] | null;

async function gh(args: string[], cwd: string): Promise<string> {
	const { stdout } = await execFileAsync("gh", args, {
		cwd,
		maxBuffer: 20 * 1024 * 1024,
	});
	return stdout.toString();
}

async function currentBranch(cwd: string): Promise<string> {
	const { stdout } = await execFileAsync("git", ["branch", "--show-current"], { cwd });
	return stdout.toString().trim();
}

async function currentRepo(cwd: string): Promise<string> {
	return (await gh(["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"], cwd)).trim();
}

function parseArgs(args: string): ParsedArgs {
	const parts = args.trim().split(/\s+/).filter(Boolean);
	const includeResolved = parts.includes("--all") || parts.includes("--include-resolved");
	const prArg = parts.filter((part) => part !== "--all" && part !== "--include-resolved").join(" ");
	return { prArg, includeResolved };
}

async function findPr(cwd: string, arg: string): Promise<PullRequest> {
	const requested = arg.trim();
	if (/^#?\d+$/.test(requested)) {
		const number = requested.replace(/^#/, "");
		return JSON.parse(await gh(["pr", "view", number, "--json", "number,title,url,headRefName,state"], cwd));
	}

	const branch = requested || await currentBranch(cwd);
	const prs: PullRequest[] = JSON.parse(await gh([
		"pr", "list",
		"--head", branch,
		"--state", "open",
		"--json", "number,title,url,headRefName,state",
		"--limit", "10",
	], cwd));

	if (prs.length === 0) {
		throw new Error(`No open PR found for branch ${branch}. Pass a PR number, e.g. /copilot-comments 50`);
	}
	if (prs.length > 1) {
		throw new Error(`Multiple open PRs found for ${branch}: ${prs.map((p) => `#${p.number}`).join(", ")}. Pass a PR number.`);
	}
	return prs[0];
}

function isCopilot(login?: string): boolean {
	return !!login && /copilot/i.test(login);
}

function cleanBody(body: string): string {
	return body.replace(/\r\n/g, "\n").trim();
}

function graphQlString(value: string): string {
	return JSON.stringify(value);
}

async function fetchReviewThreads(cwd: string, prNumber: number, includeResolved: boolean): Promise<CopilotComment[]> {
	const [owner, name] = (await currentRepo(cwd)).split("/");
	const comments: CopilotComment[] = [];
	let cursor: string | undefined;

	do {
		const after = cursor ? `, after: ${graphQlString(cursor)}` : "";
		const query = `
query {
  repository(owner: ${graphQlString(owner)}, name: ${graphQlString(name)}) {
    pullRequest(number: ${prNumber}) {
      reviewThreads(first: 100${after}) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          isResolved
          comments(first: 100) {
            nodes {
              author { login }
              body
              path
              line
              originalLine
              diffHunk
              url
              createdAt
            }
          }
        }
      }
    }
  }
}`;

		const page: ReviewThreadPage = JSON.parse(await gh(["api", "graphql", "-f", `query=${query}`], cwd));
		const reviewThreads = page.data?.repository?.pullRequest?.reviewThreads;
		if (!reviewThreads) break;

		for (const thread of reviewThreads.nodes ?? []) {
			if (thread.isResolved && !includeResolved) continue;

			const threadComments = thread.comments?.nodes ?? [];
			const copilotComment = threadComments.find((comment) => isCopilot(comment.author?.login) && comment.body?.trim());
			if (!copilotComment?.body?.trim()) continue;

			comments.push({
				kind: "review-thread",
				body: cleanBody(copilotComment.body),
				path: copilotComment.path,
				line: copilotComment.line ?? copilotComment.originalLine ?? null,
				url: copilotComment.url,
				diffHunk: copilotComment.diffHunk,
				createdAt: copilotComment.createdAt,
				threadId: thread.id,
				isResolved: thread.isResolved,
				commentCount: threadComments.length,
			});
		}

		cursor = reviewThreads.pageInfo?.hasNextPage ? reviewThreads.pageInfo?.endCursor ?? undefined : undefined;
	} while (cursor);

	return comments;
}

async function fetchCopilotReviewBodies(cwd: string, prNumber: number): Promise<CopilotComment[]> {
	const repo = await currentRepo(cwd);
	const reviews: Review[] = JSON.parse(await gh([
		"api", `repos/${repo}/pulls/${prNumber}/reviews`, "--paginate",
	], cwd));

	return reviews
		.filter((review) => isCopilot(review.user?.login) && !!review.body?.trim())
		.map((review) => ({
			kind: "review-body" as const,
			body: cleanBody(review.body ?? ""),
			url: review.html_url,
			createdAt: review.submitted_at,
		}));
}

async function fetchCopilotComments(cwd: string, prNumber: number, includeResolved: boolean): Promise<CopilotComment[]> {
	const comments = await fetchReviewThreads(cwd, prNumber, includeResolved);
	const reviewBodies = await fetchCopilotReviewBodies(cwd, prNumber);

	// Copilot's review body is usually an overview; keep it only when there are no inline threads,
	// or when it contains a more specific review message.
	for (const reviewBody of reviewBodies) {
		if (comments.length === 0 || !reviewBody.body.includes("Pull request overview")) {
			comments.push(reviewBody);
		}
	}

	return comments;
}

async function resolveReviewThread(cwd: string, threadId: string): Promise<void> {
	const query = `
mutation($threadId: ID!) {
  resolveReviewThread(input: { threadId: $threadId }) {
    thread { id isResolved }
  }
}`;
	await gh(["api", "graphql", "-f", `query=${query}`, "-f", `threadId=${threadId}`], cwd);
}

async function replyToReviewThread(cwd: string, threadId: string, body: string): Promise<string | undefined> {
	const query = `
mutation($threadId: ID!, $body: String!) {
  addPullRequestReviewThreadReply(input: { pullRequestReviewThreadId: $threadId, body: $body }) {
    comment { url }
  }
}`;
	const response = JSON.parse(await gh(["api", "graphql", "-f", `query=${query}`, "-f", `threadId=${threadId}`, "-f", `body=${body}`], cwd));
	return response.data?.addPullRequestReviewThreadReply?.comment?.url;
}

function locationFor(comment: CopilotComment): string {
	return comment.path ? `${comment.path}${comment.line ? `:${comment.line}` : ""}` : "PR review body";
}

function formatComment(pr: PullRequest, comment: CopilotComment, index: number, total: number): string {
	return [
		`Copilot comment ${index + 1}/${total} on PR #${pr.number} — ${pr.title}`,
		`Location: ${locationFor(comment)}`,
		comment.url ? `URL: ${comment.url}` : undefined,
		comment.kind === "review-thread" ? `Resolved: ${comment.isResolved ? "yes" : "no"}` : undefined,
		"",
		comment.body,
	].filter(Boolean).join("\n");
}

function wrapText(text: string, width: number): string[] {
	const lines: string[] = [];
	const maxWidth = Math.max(20, width);

	for (const rawLine of text.split("\n")) {
		let line = rawLine.trimEnd();
		if (!line) {
			lines.push("");
			continue;
		}

		while (line.length > maxWidth) {
			let breakAt = line.lastIndexOf(" ", maxWidth);
			if (breakAt < Math.floor(maxWidth / 2)) breakAt = maxWidth;
			lines.push(line.slice(0, breakAt));
			line = line.slice(breakAt).trimStart();
		}
		lines.push(line);
	}

	return lines;
}

async function chooseCommentAction(ctx: any, pr: PullRequest, comment: CopilotComment, index: number, total: number): Promise<CommentAction> {
	if (!ctx.hasUI) {
		return await ctx.ui.select(`${formatComment(pr, comment, index, total)}\n\nWhat do you want to do?`, [...ACTIONS]);
	}

	let selectedIndex = 0;
	let showDiff = false;
	let cachedLines: string[] | undefined;

	return ctx.ui.custom<CommentAction>((tui: any, theme: any, _keybindings: any, done: (value: CommentAction) => void) => {
		const refresh = () => {
			cachedLines = undefined;
			tui.requestRender();
		};

		return {
			render(width: number) {
				if (cachedLines) return cachedLines;

				const lines: string[] = [];
				const add = (text = "") => lines.push(truncateToWidth(text, width));
				const bodyWidth = Math.max(30, width - 4);

				add(theme.fg("accent", `Copilot ${index + 1}/${total} · PR #${pr.number}: ${pr.title}`));
				add(`${theme.fg("dim", "Location:")} ${locationFor(comment)}`);
				if (comment.url) add(`${theme.fg("dim", "URL:")} ${comment.url}`);
				if (comment.kind === "review-thread") {
					add(`${theme.fg("dim", "Thread:")} ${comment.isResolved ? "resolved" : "unresolved"}${comment.commentCount ? ` · ${comment.commentCount} comment(s)` : ""}`);
				} else {
					add(theme.fg("warning", "Review body only: this item cannot be marked resolved."));
				}
				add("");

				for (const line of wrapText(comment.body, bodyWidth).slice(0, 18)) {
					add(`  ${line}`);
				}
				if (wrapText(comment.body, bodyWidth).length > 18) add(theme.fg("dim", "  … body truncated"));

				if (comment.diffHunk) {
					add("");
					add(theme.fg("dim", showDiff ? "Diff hunk (-d to hide):" : "Diff hunk hidden (-d to show)"));
					if (showDiff) {
						for (const line of comment.diffHunk.split("\n").slice(0, 12)) add(theme.fg("dim", `  ${line}`));
					}
				}

				add("");
				ACTIONS.forEach((action, actionIndex) => {
					const disabled = action === "Mark resolved now" && !comment.threadId;
					const selected = actionIndex === selectedIndex;
					const text = `${selected ? ">" : " "} ${actionIndex + 1}. ${action}${disabled ? " (unavailable)" : ""}`;
					add(disabled ? theme.fg("dim", text) : selected ? theme.fg("accent", text) : text);
				});
				add("");
				add(theme.fg("dim", "↑↓/jk navigate • 1-5 or Enter/l select • d diff • e explain • r resolve • s skip • q/Esc stop"));

				cachedLines = lines;
				return lines;
			},
			invalidate() {
				cachedLines = undefined;
			},
			handleInput(data: string) {
				const optionNumber = Number(data);
				if (Number.isInteger(optionNumber) && optionNumber >= 1 && optionNumber <= ACTIONS.length) {
					done(ACTIONS[optionNumber - 1]);
					return;
				}

				if (matchesKey(data, Key.up) || data === "k") {
					selectedIndex = Math.max(0, selectedIndex - 1);
					refresh();
					return;
				}
				if (matchesKey(data, Key.down) || data === "j") {
					selectedIndex = Math.min(ACTIONS.length - 1, selectedIndex + 1);
					refresh();
					return;
				}
				if (matchesKey(data, Key.enter) || data === "l") {
					done(ACTIONS[selectedIndex]);
					return;
				}
				if (data === "d") {
					showDiff = !showDiff;
					refresh();
					return;
				}
				if (data === "e") {
					done("Ask agent to explain");
					return;
				}
				if (data === "r") {
					done("Mark resolved now");
					return;
				}
				if (data === "s") {
					done("Skip");
					return;
				}
				if (matchesKey(data, Key.escape) || data === "q") {
					done("Stop reviewing");
				}
			},
		};
	});
}

async function choosePostAgentAction(ctx: any, comment: CopilotComment): Promise<PostAgentAction> {
	const options = comment.threadId
		? [...POST_AGENT_ACTIONS]
		: POST_AGENT_ACTIONS.filter((action) => action === "Leave unresolved" || action === "Send another instruction" || action === "Stop reviewing");

	return await ctx.ui.select("The agent finished addressing this Copilot comment. What next?", options);
}

async function addThreadComment(ctx: any, comment: CopilotComment, resolveAfter: boolean): Promise<void> {
	if (!comment.threadId) {
		ctx.ui.notify("This item is not a resolvable review thread.", "error");
		return;
	}

	const body = await ctx.ui.input(
		resolveAfter ? "Comment to add before resolving this thread:" : "Comment to add to this thread:",
		"e.g. Fixed in the latest commit.",
	) || "";
	if (!body.trim()) return;

	const url = await replyToReviewThread(ctx.cwd, comment.threadId, body.trim());
	ctx.ui.notify(url ? `Comment added: ${url}` : "Comment added.", "info");

	if (resolveAfter) {
		await resolveReviewThread(ctx.cwd, comment.threadId);
		comment.isResolved = true;
		ctx.ui.notify("Thread marked resolved.", "info");
	}
}

async function resolveThreadNow(ctx: any, comment: CopilotComment): Promise<void> {
	if (!comment.threadId) {
		ctx.ui.notify("This item is not a resolvable review thread.", "error");
		return;
	}

	await resolveReviewThread(ctx.cwd, comment.threadId);
	comment.isResolved = true;
	ctx.ui.notify("Thread marked resolved.", "info");
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("copilot-comments", {
		description: "Review Copilot PR comments one at a time, send them to the agent, and resolve/comment on GitHub. Usage: /copilot-comments [PR-number] [--all]",
		handler: async (args, ctx) => {
			try {
				await ctx.waitForIdle();
				const parsed = parseArgs(args || "");
				const pr = await findPr(ctx.cwd, parsed.prArg);
				ctx.ui.notify(`Fetching Copilot comments for PR #${pr.number}...`, "info");
				const comments = await fetchCopilotComments(ctx.cwd, pr.number, parsed.includeResolved);

				if (comments.length === 0) {
					ctx.ui.notify(`No ${parsed.includeResolved ? "" : "unresolved "}Copilot comments found on PR #${pr.number}.`, "info");
					return;
				}

				for (let i = 0; i < comments.length; i++) {
					const comment = comments[i];

					while (true) {
						const choice = await chooseCommentAction(ctx, pr, comment, i, comments.length);

						if (!choice || choice === "Stop reviewing") return;
						if (choice === "Skip") break;

						if (choice === "Mark resolved now") {
							await resolveThreadNow(ctx, comment);
							break;
						}

						let instruction = "";
						if (choice === "Send instruction to agent") {
							instruction = await ctx.ui.input("What should I do with this Copilot comment?", "e.g. fix it, investigate first, ignore with rationale...") || "";
							if (!instruction.trim()) continue;
						} else {
							instruction = "Explain this Copilot PR comment, why it matters, and suggest how to address it. Do not edit files unless I ask.";
						}

						pi.sendUserMessage([
							{ type: "text", text: `${instruction.trim()}\n\n${formatComment(pr, comment, i, comments.length)}` },
						]);
						await ctx.waitForIdle();

						const postAction = await choosePostAgentAction(ctx, comment);
						if (!postAction || postAction === "Leave unresolved") break;
						if (postAction === "Stop reviewing") return;
						if (postAction === "Send another instruction") continue;
						if (postAction === "Mark resolved") {
							await resolveThreadNow(ctx, comment);
							break;
						}
						if (postAction === "Resolve with comment") {
							await addThreadComment(ctx, comment, true);
							break;
						}
						if (postAction === "Comment only") {
							await addThreadComment(ctx, comment, false);
							break;
						}
					}
				}
			} catch (error) {
				ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
			}
		},
	});
}
