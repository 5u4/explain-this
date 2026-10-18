import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { formatRef, type Ref } from "../../packages/contract/src/citation.ts";
import { parsePage } from "../../packages/contract/src/parse-page/parse-page.ts";
import type { Criteria } from "./judge.ts";

export const PAGE_RUBRIC = {
  "bottom-line-up-front":
    "The first paragraph after the page's # title says what the component is for and the one idea that makes it work, so a reader who stops after that paragraph can state both. Fail if the page opens on a detail, a code excerpt, a section heading, or background, or if its first paragraph gives only one of the two.",
  "headings-are-claims":
    'Every section heading (## to ####; the # page title is exempt) states what its section shows as a claim a reader could check, such as "Retries stop after the third failure", rather than a topic label such as "Retries", "The shape", or "Overview". Read in order, the headings alone outline the page. Fail if any section heading is a bare topic or noun phrase.',
  "trace-one-case":
    "The page picks one concrete case and states its assumptions in one sentence: the input, the caller, and the state it starts from. It follows that same case through every step the page covers, and each step cites the code lines it runs, says why the step happens, and names the condition that would skip or end it. Variants come after the trace, each naming the step where it diverges. A section after the variants may reuse the traced case's result as a running example; such a section is not a step of the trace. Fail if there is no single concrete traced case, if the steps are described only in general terms, or if any step lacks a code citation, a reason, or its skip condition.",
  "curse-of-knowledge":
    "Every project-specific term (a name this codebase gives to a concept, type, function, or setting, as opposed to general programming vocabulary) is defined in plain words at or before its first use, and each concept keeps one name for the whole page. Fail if a project term is used before it is defined or is never defined, or if one concept appears under two different names.",
  "terms-stay-in-english":
    "Applies only when the page's prose is written in a language other than English; for an English page the status is n/a. Every word that names a thing or state in software stays in English, for example skill, stale, citation, page, claim, file, command, directory, commit, exit code, repo, path, link, string, function, error, range. The page's language carries verbs, connectives, explanation, and the page naming itself (such as 本页); a verb for what code or a page does, such as 引用 meaning cite in 引用此 file 的 page, is a verb and stays in the page's language. A term's first-use definition is written in the page's language, and after it the English term stands alone. Fail if any word that names a software thing or state is translated into the page's language (for example 引用 as the noun for citation, 路径 for path, 文件 for file, 链接 for link).",
  "near-miss":
    'Applies when the page states a rule a reader could over-apply, such as a rule deciding which inputs are accepted, rejected, or classified a certain way; the status is n/a only when the page states no such rule. Where it applies, the page shows a case that looks like it fits the rule but lacks the one attribute that matters, names that attribute, and labels the tempting wrong reading before showing it (for example "You might expect …, but …"). Fail if the page states such a rule but shows no such case, or shows one without naming the deciding attribute.',
} as const satisfies Criteria;

export type PageCheck = keyof typeof PAGE_RUBRIC;

export const INIT_REPLY_RUBRIC = {
  "tells-user-to-init":
    "The reply tells the user to run `explain init` themselves (with or without flags such as `--locales`) so that the work can continue. Fail if the reply does not ask the user to run it, if it says `explain init` was already run or that the assistant ran it, or if it tells the user to skip `explain init` or do something else instead of it.",
} as const satisfies Criteria;

export const WRITE_REPLY_RUBRIC = {
  "reports-pages":
    "The material holds the page files the assistant wrote, under <pages-written>; the last shell command it ran that calls `explain validate`, with everything that command printed, under <validate-run>; and its final reply, under <reply>. The reply names every page listed in <pages-written> (by file path or page id), reports the output `explain validate` printed in <validate-run> faithfully (for example a line such as `2 pages valid`, or the diagnostics that run listed), and gives `explain dev` as the command to view the pages. Fail if the reply misses any listed page, only says that validation passed without its output, reports validation output that <validate-run> does not show or that contradicts it (such as saying the pages are valid when <validate-run> lists diagnostics), or does not give `explain dev`.",
} as const satisfies Criteria;

export type CommandRun = { command: string; output: string };

export function replyMaterial(reply: string, pagesWritten: string[], validate: CommandRun): string {
  return `<pages-written>\n${pagesWritten.join("\n")}\n</pages-written>\n\n<validate-run>\n$ ${validate.command}\n${validate.output}\n</validate-run>\n\n<reply>\n${reply}\n</reply>`;
}

export const CITATION_REQUEST =
  "/skill:explain-this I'd like a page on how citations get parsed in the explain-this repo (checked out at ../explain-this). Mostly the path from a `repo:path:ranges` string to what the viewer ends up showing.";

export const SCOPE_RUBRIC = {
  "covers-requested-scope":
    "The material holds the user's request under <request> and every page written for it under <pages>. The pages may split the content between them, and a page in another language may repeat another page's content. Read together, the pages explain the subject the request asks a page about, starting from the input the request names, and cover each part of that subject the request asks for. Fail if the pages are mainly about a different subject, if they never show what happens to the input the request names, or if they leave out a part the request explicitly asks for.",
} as const satisfies Criteria;

export function scopeMaterial(
  request: string,
  pages: { file: string; markdown: string }[],
): string {
  const listed = pages
    .map(({ file, markdown }) => `<page file="${file}">\n${markdown}\n</page>`)
    .join("\n");
  return `<request>\n${request}\n</request>\n\n<pages>\n${listed}\n</pages>`;
}

function citedLines(ref: Ref, repos: Record<string, string>): string {
  const root = Object.hasOwn(repos, ref.repo) ? repos[ref.repo] : undefined;
  const file = root === undefined ? undefined : join(root, ref.path);
  if (file === undefined || !existsSync(file)) return "(not found)";
  const lines = readFileSync(file, "utf8").split("\n");
  const ranges = ref.ranges.length === 0 ? [{ from: 1, to: lines.length }] : ref.ranges;
  return ranges
    .map((range) =>
      lines
        .slice(range.from - 1, range.to)
        .map((line, index) => `${range.from + index}| ${line}`)
        .join("\n"),
    )
    .join("\n…\n");
}

export function pageMaterial(markdown: string, repos: Record<string, string>): string {
  const refs = parsePage(markdown, "page").page?.refs ?? [];
  const cited = new Map(refs.map(({ ref }) => [formatRef(ref), ref]));
  const code = [...cited]
    .map(([citation, ref]) => `<code citation="${citation}">\n${citedLines(ref, repos)}\n</code>`)
    .join("\n");
  return `<page>\n${markdown}\n</page>\n\n<cited-code>\n${code}\n</cited-code>`;
}
