import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { parsePage } from "../../packages/contract/src/parse-page/parse-page.ts";
import { type CliResult, explain } from "../harness/cli.ts";
import { defineEval } from "../harness/eval.ts";
import { judge } from "../harness/judge.ts";
import {
  CITATION_REQUEST,
  type CommandRun,
  PAGE_RUBRIC,
  pageMaterial,
  replyMaterial,
  SCOPE_RUBRIC,
  scopeMaterial,
  WRITE_REPLY_RUBRIC,
} from "../harness/rubric.ts";
import { settleAll } from "../harness/settle.ts";
import { exportTargetRepo } from "../harness/target-repo.ts";
import type { Grade, Run, ToolCall, Verdict } from "../harness/types.ts";

const LOCALES = ["zh", "en"];

const Config = Schema.Struct({
  title: Schema.optionalKey(Schema.String),
  locales: Schema.Array(Schema.String),
  repos: Schema.Record(Schema.String, Schema.Unknown),
  nav: Schema.Array(Schema.Struct({ title: Schema.String, pages: Schema.Array(Schema.String) })),
});

type Config = typeof Config.Type;

const decodeConfig = Schema.decodeUnknownResult(Schema.fromJsonString(Config));

type Page = {
  file: string;
  markdown: string;
  material: string;
  cites: string[];
  hasSources: boolean;
};

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
  const file = join(workdir, "explain.json");
  if (!existsSync(file)) return "explain.json is missing";
  const decoded = decodeConfig(readFileSync(file, "utf8"));
  return Result.isSuccess(decoded)
    ? decoded.success
    : `explain.json does not decode: ${decoded.failure.message}`;
}

const real = (path: string): string => (existsSync(path) ? realpathSync(path) : path);

function resolveRepos(workdir: string, config: Config | string): Record<string, string> {
  if (typeof config === "string") return {};
  return Object.fromEntries(
    Object.entries(config.repos).flatMap(([key, path]) =>
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
  const judged = await settleAll(
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

function lastValidateRun(calls: ToolCall[]): CommandRun | string {
  const call = calls.findLast(
    ({ name, arguments: args }) =>
      name === "bash" &&
      typeof args.command === "string" &&
      /\bexplain\s+validate\b/.test(args.command),
  );
  const command = call?.arguments.command;
  if (call === undefined || typeof command !== "string") return "no bash call ran explain validate";
  if (call.output === undefined) return `\`${command}\` has no recorded output`;
  return { command, output: call.output };
}

async function judgeReply(reply: string, pages: Page[], calls: ToolCall[]): Promise<Grade> {
  const validateRun = lastValidateRun(calls);
  if (typeof validateRun === "string")
    return Object.fromEntries(
      Object.keys(WRITE_REPLY_RUBRIC).map((check) => [check, verdict(false, validateRun)]),
    );
  return judge(
    replyMaterial(
      reply,
      pages.map((page) => page.file),
      validateRun,
    ),
    WRITE_REPLY_RUBRIC,
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

  const navIds = typeof config === "string" ? [] : config.nav.flatMap((group) => group.pages);
  const title = typeof config === "string" ? undefined : config.title;
  const outOfNav = ids.filter((id) => !navIds.includes(id));
  const nav = verdict(
    typeof title === "string" && title !== "" && outOfNav.length === 0 && ids.length > 0,
    `title ${JSON.stringify(title)}, nav ${JSON.stringify(navIds)}, new ids not in nav ${JSON.stringify(outOfNav)}`,
  );

  const unsynced = pages.filter((page) => !page.hasSources).map((page) => page.file);
  const validated = verdict(
    pages.length > 0 && validate.code === 0 && unsynced.length === 0 && freshness.code === 0,
    `validate exit ${validate.code}: ${validate.output.trim()}; no sources file ${JSON.stringify(unsynced)}; freshness check exit ${freshness.code}: ${freshness.output.trim()}`,
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

  const [pageGrade, replyGrade, scopeGrade] = await settleAll<Grade>([
    judgePages(pages),
    judgeReply(run.turns.at(-1)?.reply ?? "", pages, calls),
    judge(scopeMaterial(run.turns.map((turn) => turn.prompt).join("\n\n"), pages), SCOPE_RUBRIC),
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
    ...scopeGrade,
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
  turns: [CITATION_REQUEST],
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
        markdown,
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
