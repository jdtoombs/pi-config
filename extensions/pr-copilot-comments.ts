import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type ReviewComment = {
	user?: { login?: string };
	body?: string;
	path?: string;
	line?: number | null;
	original_line?: number | null;
	diff_hunk?: string;
	html_url?: string;
	url?: string;
	created_at?: string;
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
	kind: "review-comment" | "review-body";
	body: string;
	path?: string;
	line?: number | null;
	url?: string;
	diffHunk?: string;
	createdAt?: string;
};

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

async function fetchCopilotComments(cwd: string, prNumber: number): Promise<CopilotComment[]> {
	const repo = await currentRepo(cwd);
	const reviewComments: ReviewComment[] = JSON.parse(await gh([
		"api", `repos/${repo}/pulls/${prNumber}/comments`, "--paginate",
	], cwd));
	const reviews: Review[] = JSON.parse(await gh([
		"api", `repos/${repo}/pulls/${prNumber}/reviews`, "--paginate",
	], cwd));

	const comments: CopilotComment[] = [];
	for (const c of reviewComments) {
		if (!isCopilot(c.user?.login) || !c.body?.trim()) continue;
		comments.push({
			kind: "review-comment",
			body: cleanBody(c.body),
			path: c.path,
			line: c.line ?? c.original_line ?? null,
			url: c.html_url ?? c.url,
			diffHunk: c.diff_hunk,
			createdAt: c.created_at,
		});
	}
	for (const r of reviews) {
		if (!isCopilot(r.user?.login) || !r.body?.trim()) continue;
		const body = cleanBody(r.body);
		// Copilot's review body is usually an overview; keep it only if there are no inline comments.
		if (comments.length === 0 || !body.includes("Pull request overview")) {
			comments.push({ kind: "review-body", body, url: r.html_url, createdAt: r.submitted_at });
		}
	}
	return comments;
}

function formatComment(pr: PullRequest, comment: CopilotComment, index: number, total: number): string {
	const location = comment.path ? `${comment.path}${comment.line ? `:${comment.line}` : ""}` : "PR review body";
	return [
		`Copilot comment ${index + 1}/${total} on PR #${pr.number} — ${pr.title}`,
		`Location: ${location}`,
		comment.url ? `URL: ${comment.url}` : undefined,
		"",
		comment.body,
	].filter(Boolean).join("\n");
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("copilot-comments", {
		description: "Review Copilot PR comments one at a time; optionally send each to the agent with your instruction. Usage: /copilot-comments [PR-number]",
		handler: async (args, ctx) => {
			try {
				await ctx.waitForIdle();
				const pr = await findPr(ctx.cwd, args || "");
				ctx.ui.notify(`Fetching Copilot comments for PR #${pr.number}...`, "info");
				const comments = await fetchCopilotComments(ctx.cwd, pr.number);

				if (comments.length === 0) {
					ctx.ui.notify(`No Copilot comments found on PR #${pr.number}.`, "info");
					return;
				}

				for (let i = 0; i < comments.length; i++) {
					const commentText = formatComment(pr, comments[i], i, comments.length);
					const choice = await ctx.ui.select(`${commentText}\n\nWhat do you want to do?`, [
						"Tell agent what to do with this comment",
						"Ask agent to explain this comment",
						"Skip this comment",
						"Stop reviewing comments",
					]);

					if (!choice || choice === "Stop reviewing comments") break;
					if (choice === "Skip this comment") continue;

					let instruction = "";
					if (choice === "Tell agent what to do with this comment") {
						instruction = await ctx.ui.input("What should I do with this Copilot comment?", "e.g. fix it, investigate first, ignore with rationale...") || "";
						if (!instruction.trim()) continue;
					} else {
						instruction = "Explain this Copilot PR comment, why it matters, and suggest how to address it. Do not edit files unless I ask.";
					}

					pi.sendUserMessage([
						{ type: "text", text: `${instruction.trim()}\n\n${commentText}` },
					]);
					await ctx.waitForIdle();
				}
			} catch (error) {
				ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
			}
		},
	});
}
