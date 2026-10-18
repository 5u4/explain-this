import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type CalibrationCase, defineCalibration } from "../harness/eval.ts";
import type { JudgedStatus } from "../harness/judge.ts";
import {
  CITATION_REQUEST,
  type CommandRun,
  INIT_REPLY_RUBRIC,
  PAGE_RUBRIC,
  type PageCheck,
  pageMaterial,
  replyMaterial,
  SCOPE_RUBRIC,
  scopeMaterial,
  WRITE_REPLY_RUBRIC,
} from "../harness/rubric.ts";
import { settleAll } from "../harness/settle.ts";
import { exportTargetRepo, readPinned } from "../harness/target-repo.ts";

const goldEn = readFileSync(new URL("./citation.en.md", import.meta.url), "utf8");
const goldZh = readFileSync(new URL("./citation.zh.md", import.meta.url), "utf8");

const TOPIC_HEADINGS = [
  "## Parsing walkthrough",
  "### Routing",
  "### Splitting",
  "### Repo key and path",
  "### Line ranges",
  "### Result",
  "## Variants",
  "## Web links",
  "## Formatting",
];

const DEFINITIONS = [
  " The pages live in a *doc root*, a directory\nwhose settings file is `explain.json`.",
  " (a name that\n`explain.json` gives to a checked-out repo)",
  "\n(spans of 1-based line numbers, both ends included)",
  ",\nthe parsed value `{ repo, path, ranges }`,",
  " (the code that turns a page's Markdown into structured blocks)",
  ", an error message with the link's line and column",
];

const CHINESE_TERMS: Record<string, string> = {
  "reserved key": "保留键",
  "repo key": "仓库键",
  "line range": "行范围",
  "line number": "行号",
  "page parser": "页面解析器",
  "page link": "页面链接",
  "settings file": "配置文件",
  "syntax check": "语法检查",
  citation: "引用",
  repo: "仓库",
  path: "路径",
  line: "行",
  range: "范围",
  page: "页面",
  link: "链接",
  file: "文件",
  string: "字符串",
  error: "错误",
  message: "消息",
  diagnostic: "诊断",
  directory: "目录",
  value: "值",
  helper: "辅助函数",
  separator: "分隔符",
  segment: "片段",
  scheme: "协议",
  prefix: "前缀",
  syntax: "语法",
  disk: "磁盘",
  code: "代码",
  field: "字段",
  excerpt: "摘录",
  anchor: "锚点",
  target: "目标",
  block: "块",
  list: "列表",
  column: "列",
  paragraph: "段落",
};

function mutate(page: string, pattern: string | RegExp, replacement: string): string {
  const hit = typeof pattern === "string" ? page.includes(pattern) : page.search(pattern) >= 0;
  if (!hit) throw new Error(`mutation found no ${pattern} in the gold page`);
  return page.replace(pattern, replacement);
}

function withHeadings(page: string, headings: string[]): string {
  let next = 0;
  const result = page.replace(/^#{2,4} .*$/gm, (heading) => headings[next++] ?? heading);
  if (next !== headings.length) throw new Error(`gold page has ${next} section headings`);
  return result;
}

const terms = Object.keys(CHINESE_TERMS).sort((a, b) => b.length - a.length);
const TRANSLATABLE = new RegExp(
  `(\`\`\`[\\s\\S]*?\`\`\`|\`[^\`]*\`|\\[[^\\]]*\\]\\([^)]*\\))|\\b(${terms.join("|")})\\b`,
  "g",
);

const translated = goldZh.replace(
  TRANSLATABLE,
  (match, kept: string | undefined, term: string) => kept ?? CHINESE_TERMS[term] ?? match,
);

const traceSection = /^## One link target[\s\S]*?(?=^## )/m.exec(goldEn)?.[0];
if (traceSection === undefined) throw new Error("gold page has no trace section");
const uncitedTrace = traceSection
  .replace(/```ts file=explain:.*\n```\n\n/g, "")
  .replace(/\s?\(\[[^\]]*\]\(explain:[^)]*\)\)/g, "")
  .replace(/(?<!`)\[([^\]]*)\]\(explain:[^)]*\)/g, "$1");

const root = mkdtempSync(join(tmpdir(), "ws-"));
await exportTargetRepo(join(root, "acme-docs"));
const repos = { explain: join(root, "explain-this") };

const PAGE_PASSES: Record<PageCheck, JudgedStatus> = {
  "bottom-line-up-front": "pass",
  "headings-are-claims": "pass",
  "trace-one-case": "pass",
  "curse-of-knowledge": "pass",
  "terms-stay-in-english": "pass",
  "near-miss": "pass",
};

const page = (markdown: string, expected: Partial<Record<PageCheck, JudgedStatus>>) => ({
  material: pageMaterial(markdown, repos),
  criteria: PAGE_RUBRIC,
  expected,
});

const reply = (text: string, status: JudgedStatus) => ({
  material: text,
  criteria: INIT_REPLY_RUBRIC,
  expected: { "tells-user-to-init": status },
});

const WRITTEN = ["en/citation-parsing.md", "zh/citation-parsing.md"];

const REAL_WRITE_REPLY =
  "Wrote:\n- `en/citation-parsing.md`\n- `zh/citation-parsing.md`\n\nCovers parsing, file resolution, pane highlighting, excerpts, and direct source navigation. Registered the repo and pages in `explain.json`.\n\nFinal validation output:\n```text\n2 pages valid\n```\n\nFreshness synced for both pages, tracking 20 source files each.\n\nView with:\n```sh\nexplain dev\n```\n";

const VALIDATE_COMMAND = "explain validate en/citation-parsing.md zh/citation-parsing.md";

const VALID_RUN: CommandRun = { command: VALIDATE_COMMAND, output: "2 pages valid\n" };

const DIAGNOSTIC =
  "zh/citation-parsing.md:41:7 explain:packages/contract/src/citations.ts does not exist";

const DIAGNOSTIC_RUN: CommandRun = {
  command: VALIDATE_COMMAND,
  output: `${DIAGNOSTIC}\n\n\nCommand exited with code 2`,
};

const writeReply = (text: string, status: JudgedStatus, validate = VALID_RUN) => ({
  material: replyMaterial(text, WRITTEN, validate),
  criteria: WRITE_REPLY_RUBRIC,
  expected: { "reports-pages": status },
});

const scope = (pages: { file: string; markdown: string }[], status: JudgedStatus) => ({
  material: scopeMaterial(CITATION_REQUEST, pages),
  criteria: SCOPE_RUBRIC,
  expected: { "covers-requested-scope": status },
});

const pinnedPages = (files: string[]) =>
  settleAll(files.map(async (file) => ({ file, markdown: await readPinned(`docs/${file}`) })));

const GOLD_PAGES = [
  { file: "en/citation.md", markdown: goldEn },
  { file: "zh/citation.md", markdown: goldZh },
];

const viewerPages = await pinnedPages(["en/resolve-source.md", "en/source-pane.md"]);
const freshnessPages = await pinnedPages(["en/freshness.md", "zh/freshness.md"]);

const cases: Record<string, CalibrationCase> = {
  "gold-en": page(goldEn, { ...PAGE_PASSES, "terms-stay-in-english": "n/a" }),
  "gold-zh": page(goldZh, PAGE_PASSES),
  "topic-headings-en": page(withHeadings(goldEn, TOPIC_HEADINGS), {
    "headings-are-claims": "fail",
  }),
  "no-first-paragraph-en": page(mutate(goldEn, /(?<=^# .*\n\n)[\s\S]*?\n\n/, ""), {
    "bottom-line-up-front": "fail",
  }),
  "no-near-miss-en": page(mutate(goldEn, /^## A `mailto:`[\s\S]*?(?=^## )/m, ""), {
    "near-miss": "fail",
  }),
  "undefined-terms-en": page(
    DEFINITIONS.reduce((markdown, definition) => mutate(markdown, definition, ""), goldEn),
    { "curse-of-knowledge": "fail" },
  ),
  "uncited-trace-en": page(mutate(goldEn, traceSection, uncitedTrace), {
    "trace-one-case": "fail",
  }),
  "translated-terms-zh": page(translated, { "terms-stay-in-english": "fail" }),
  "verb-cite-zh": page(
    mutate(
      mutate(goldZh, "cited code 是否真的存在", "被引用的 code 是否真的存在"),
      "列出改动过的 cited file",
      "列出改动过的、被 page 引用的 file",
    ),
    { "terms-stay-in-english": "pass" },
  ),
  "real-reply": reply(
    "`explain.json` is missing from the doc root. Run:\n\n```sh\nexplain init --locales=<a,b>\n```\n\nReplace `<a,b>` with the locales you want, such as `en`.",
    "pass",
  ),
  "skip-init-reply": reply(
    "`explain.json` is missing from the doc root. Don't run `explain init`; it isn't needed here. Create `explain.json` by hand with your locales and repos, then ask me again.",
    "fail",
  ),
  "already-ran-reply": reply(
    "`explain.json` was missing from the doc root, so I already ran `explain init --locales=en` for you. The doc root is ready; which parts of the repo should the page cover?",
    "fail",
  ),
  "no-init-reply": reply(
    "`explain.json` is missing from this directory, so I stopped before writing anything.",
    "fail",
  ),
  "real-write-reply": writeReply(REAL_WRITE_REPLY, "pass"),
  "no-dev-write-reply": writeReply(
    mutate(REAL_WRITE_REPLY, "\n\nView with:\n```sh\nexplain dev\n```", ""),
    "fail",
  ),
  "summarized-validate-write-reply": writeReply(
    mutate(
      REAL_WRITE_REPLY,
      "Final validation output:\n```text\n2 pages valid\n```",
      "Validation passed.",
    ),
    "fail",
  ),
  "missing-page-write-reply": writeReply(
    mutate(REAL_WRITE_REPLY, "\n- `zh/citation-parsing.md`", ""),
    "fail",
  ),
  "fabricated-validate-write-reply": writeReply(REAL_WRITE_REPLY, "fail", DIAGNOSTIC_RUN),
  "faithful-diagnostics-write-reply": writeReply(
    mutate(REAL_WRITE_REPLY, "2 pages valid", DIAGNOSTIC),
    "pass",
    DIAGNOSTIC_RUN,
  ),
  "full-path-scope": scope([...GOLD_PAGES, ...viewerPages], "pass"),
  "parsing-only-scope": scope(GOLD_PAGES, "fail"),
  "off-topic-scope": scope(freshnessPages, "fail"),
};

rmSync(root, { recursive: true, force: true });

defineCalibration("judge-calibration", cases);
