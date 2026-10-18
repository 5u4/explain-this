import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { parsePage } from "../../packages/contract/src/parse-page/parse-page.ts";
import { type CliResult, explain } from "../harness/cli.ts";
import { defineEval } from "../harness/eval.ts";
import { judge } from "../harness/judge.ts";
import { PAGE_RUBRIC, pageMaterial, replyMaterial, WRITE_REPLY_RUBRIC } from "../harness/rubric.ts";
import { exportTargetRepo } from "../harness/target-repo.ts";
import type { Grade, Run, ToolCall, Verdict } from "../harness/types.ts";

const LOCALES = ["zh", "en"];

type Config = {
  title?: unknown;
  repos?: Record<string, unknown>;
  nav?: { pages?: unknown[] }[];
};

type Page = { file: string; material: string; cites: string[]; hasSources: boolean };

type Inspection = {
  workdir: string;
  scratchRoots: string[];
  target: string;
  config: Config | string;
  repos: Record<string, string>;
  ids: string[];
  pages: Page[];
  validate: CliResult;
  freshness: CliResult;
};

type State = { before: string[]; inspection?: Inspection };

const verdict = (pass: boolean, evidence: string): Verdict => ({
  status: pass ? "pass" : "fail",
  evidence,
});

function readConfig(workdir: string): Config | string {
  try {
    return JSON.parse(readFileSync(join(workdir, "explain.json"), "utf8")) as Config;
  } catch (error) {
    return `explain.json does not parse: ${error}`;
  }
}

const real = (path: string): string => (existsSync(path) ? realpathSync(path) : path);

function resolveRepos(workdir: string, config: Config | string): Record<string, string> {
  if (typeof config === "string") return {};
  return Object.fromEntries(
    Object.entries(config.repos ?? {}).flatMap(([key, path]) =>
      typeof path === "string" ? [[key, real(resolve(workdir, path))]] : [],
    ),
  );
}

function newPageFiles(workdir: string, before: string[]): string[] {
  return LOCALES.flatMap((locale) => {
    const dir = join(workdir, locale);
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((name) => name.endsWith(".md"))
      .map((name) => `${locale}/${name}`)
      .filter((file) => !before.includes(file));
  });
}

function scratchRelative(path: string, roots: string[]): string | undefined {
  for (const root of roots) {
    const rel = relative(root, path);
    if (!rel.startsWith("..")) return rel;
  }
  return undefined;
}

const withoutSelector = (path: string): string => path.replace(/:[^/]*$/, "");

function touchedFiles(call: ToolCall): string[] {
  const { path, input } = call.arguments;
  if (call.name === "write" && typeof path === "string") return [path];
  if (call.name === "edit" && typeof input === "string")
    return [...input.matchAll(/^\[([^\]]+?)#[0-9A-F]+\]$/gm)].flatMap((match) => match[1] ?? []);
  return [];
}

function readsGuideFirst(
  calls: ToolCall[],
  guide: string,
  isPage: (path: string) => boolean,
): Verdict {
  const read = calls.findIndex(
    (call) =>
      call.name === "read" &&
      typeof call.arguments.path === "string" &&
      new RegExp(`(^skill://|/)explain-this/${guide}$`).test(withoutSelector(call.arguments.path)),
  );
  const firstWrite = calls.findIndex((call) => touchedFiles(call).some(isPage));
  if (read < 0) return verdict(false, `no read of ${guide}`);
  if (firstWrite >= 0 && firstWrite < read)
    return verdict(false, `tool call ${firstWrite + 1} writes a page before ${guide} is read`);
  return verdict(
    true,
    `tool call ${read + 1} reads ${guide}, ${firstWrite < 0 ? "no page write" : `first page write at ${firstWrite + 1}`}`,
  );
}

const SEVERITY: Record<Verdict["status"], number> = { "n/a": 0, pass: 1, fail: 2, invalid: 3 };

async function judgePages(pages: Page[]): Promise<Grade> {
  const judged = await Promise.all(
    pages.map(async (page) => ({
      file: page.file,
      grade: await judge(page.material, PAGE_RUBRIC),
    })),
  );
  return Object.fromEntries(
    LOCALES.flatMap((locale) => {
      const inLocale = judged.filter(({ file }) => file.startsWith(`${locale}/`));
      if (inLocale.length === 0) return [];
      return Object.keys(PAGE_RUBRIC).map((check) => {
        const verdicts = inLocale.map(({ file, grade }) => ({
          file,
          verdict: grade[check] ?? { status: "invalid" as const, evidence: "no verdict" },
        }));
        const status = verdicts
          .map(({ verdict }) => verdict.status)
          .reduce((worst, next) => (SEVERITY[next] > SEVERITY[worst] ? next : worst));
        const evidence = verdicts
          .map(({ file, verdict }) => `${file} ${verdict.status}: ${verdict.evidence}`)
          .join("\n");
        return [`${locale} / ${check}`, { status, evidence }];
      });
    }),
  );
}

async function grade(run: Run, inspection: Inspection): Promise<Grade> {
  const { workdir, scratchRoots, target, config, repos, ids, pages, validate, freshness } =
    inspection;
  const calls = run.turns.flatMap((turn) =>
    turn.entries.flatMap((entry) => (entry.type === "assistant" ? entry.toolCalls : [])),
  );
  const relativeToScratch = (path: string) =>
    scratchRelative(resolve(workdir, withoutSelector(path)), scratchRoots);
  const pageFiles = new Set(pages.map((page) => join(basename(workdir), page.file)));
  const isPage = (path: string) => pageFiles.has(relativeToScratch(path) ?? "");

  const surveyed = Object.entries(repos).filter(([, dir]) => dir === target);
  const survey = verdict(
    surveyed.length > 0,
    `repos ${JSON.stringify(typeof config === "string" ? config : config.repos)}`,
  );

  const missing = ids.flatMap((id) =>
    LOCALES.filter((locale) => !pages.some((page) => page.file === `${locale}/${id}.md`)).map(
      (locale) => `${locale}/${id}.md`,
    ),
  );
  const pagesVerdict =
    ids.length === 0
      ? verdict(false, "no new page under zh/ or en/")
      : verdict(
          missing.length === 0,
          `new pages ${JSON.stringify(pages.map((page) => page.file))}, missing ${JSON.stringify(missing)}`,
        );

  const navIds =
    typeof config === "string" ? [] : (config.nav ?? []).flatMap((group) => group.pages ?? []);
  const title = typeof config === "string" ? undefined : config.title;
  const outOfNav = ids.filter((id) => !navIds.includes(id));
  const nav = verdict(
    typeof title === "string" && title !== "" && outOfNav.length === 0 && ids.length > 0,
    `title ${JSON.stringify(title)}, nav ${JSON.stringify(navIds)}, new ids not in nav ${JSON.stringify(outOfNav)}`,
  );

  const unsynced = pages.filter((page) => !page.hasSources).map((page) => page.file);
  const stale = pages
    .map((page) => page.file)
    .filter((file) =>
      freshness.output
        .split("\n")
        .some((line) => line.startsWith(`stale ${file}`) || line.startsWith(`not checked ${file}`)),
    );
  const validated = verdict(
    pages.length > 0 && validate.code === 0 && unsynced.length === 0 && stale.length === 0,
    `validate exit ${validate.code}: ${validate.output.trim()}; no sources file ${JSON.stringify(unsynced)}; freshness check: ${freshness.output.trim()}`,
  );

  const opened = new Set(
    calls.flatMap((call) =>
      call.name === "read" && typeof call.arguments.path === "string"
        ? (relativeToScratch(call.arguments.path) ?? [])
        : [],
    ),
  );
  const cited = [...new Set(pages.flatMap((page) => page.cites))];
  const unread = cited.filter((file) => !opened.has(file));
  const readsCited = verdict(
    cited.length > 0 && unread.length === 0,
    `${cited.length} cited files, never read ${JSON.stringify(unread)}`,
  );

  const [pageGrade, replyGrade] = await Promise.all([
    judgePages(pages),
    judge(
      replyMaterial(
        run.turns.at(-1)?.reply ?? "",
        pages.map((page) => page.file),
      ),
      WRITE_REPLY_RUBRIC,
    ),
  ]);
  return {
    survey,
    pages: pagesVerdict,
    nav,
    validate: validated,
    "reads-format-first": readsGuideFirst(calls, "format.md", isPage),
    "reads-writing-first": readsGuideFirst(calls, "writing.md", isPage),
    "reads-cited-files": readsCited,
    ...pageGrade,
    ...replyGrade,
  };
}

defineEval<State>("write-citation", {
  timeoutMs: 600_000,
  async setup(workdir) {
    await exportTargetRepo(workdir);
    const init = await explain(workdir, ["init", "--locales=zh,en"]);
    if (init.code !== 0) throw new Error(`explain init failed: ${init.output}`);
    return { before: (await readdir(workdir, { recursive: true })).sort() };
  },
  turns: [
    "/skill:explain-this I'd like a page on how citations get parsed in the explain-this repo (checked out at ../explain-this). Mostly the path from a `repo:path:ranges` string to what the viewer ends up showing.",
  ],
  async inspect(workdir, { before }) {
    const config = readConfig(workdir);
    const repos = resolveRepos(workdir, config);
    const scratch = dirname(workdir);
    const files = newPageFiles(workdir, before);
    const pages = files.map((file) => {
      const markdown = readFileSync(join(workdir, file), "utf8");
      const refs = parsePage(markdown, "page").page?.refs ?? [];
      const cites = refs.flatMap(({ ref }) => {
        const root = Object.hasOwn(repos, ref.repo) ? repos[ref.repo] : undefined;
        return root === undefined
          ? []
          : (scratchRelative(join(root, ref.path), [real(scratch)]) ?? []);
      });
      return {
        file,
        material: pageMaterial(markdown, repos),
        cites,
        hasSources: existsSync(join(workdir, file.replace(/\.md$/, ".sources.json"))),
      };
    });
    return {
      before,
      inspection: {
        workdir,
        scratchRoots: [scratch, real(scratch)],
        target: real(join(scratch, "explain-this")),
        config,
        repos,
        ids: [...new Set(files.map((file) => basename(file, ".md")))],
        pages,
        validate: await explain(workdir, ["validate", ...files]),
        freshness: await explain(workdir, ["freshness", "check"]),
      },
    };
  },
  grade(run, { inspection }) {
    if (inspection === undefined) throw new Error("inspect did not run");
    return grade(run, inspection);
  },
});
