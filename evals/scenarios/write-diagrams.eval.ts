import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { explain } from "../harness/cli.ts";
import { defineEval } from "../harness/eval.ts";
import { judge } from "../harness/judge.ts";
import { DIAGRAM_RUBRIC, pageMaterial } from "../harness/rubric.ts";
import { settleAll } from "../harness/settle.ts";
import { exportTargetRepo, REPO_ROOT } from "../harness/target-repo.ts";
import type { Grade, Verdict } from "../harness/types.ts";

const LOCALES = ["zh", "en"];

const SEVERITY: Record<Verdict["status"], number> = { "n/a": 0, pass: 1, fail: 2, invalid: 3 };

type Page = { file: string; material: string };

type State = { before: string[]; pages?: Page[] };

const real = (path: string): string => (existsSync(path) ? realpathSync(path) : path);

function readRepos(workdir: string): Record<string, string> {
  const file = join(workdir, "explain.json");
  if (!existsSync(file)) return {};
  const { repos } = JSON.parse(readFileSync(file, "utf8")) as { repos?: Record<string, unknown> };
  return Object.fromEntries(
    Object.entries(repos ?? {}).flatMap(([key, path]) =>
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

function dumpDir(component: string): string {
  return join(
    REPO_ROOT,
    "evals",
    "results",
    "write-diagrams",
    process.env.EXPLAIN_EVAL_ARM ?? "unlabeled",
    component,
    `trial-${crypto.randomUUID()}`,
  );
}

async function gradePages(pages: Page[]): Promise<Grade> {
  const judged = await settleAll(
    pages.map(async (page) => ({
      file: page.file,
      grade: await judge(page.material, DIAGRAM_RUBRIC),
    })),
  );
  return Object.fromEntries(
    LOCALES.flatMap((locale) => {
      const inLocale = judged.filter(({ file }) => file.startsWith(`${locale}/`));
      const written: [string, Verdict] = [
        `${locale} / wrote-pages`,
        inLocale.length > 0
          ? { status: "pass", evidence: inLocale.map(({ file }) => file).join(", ") }
          : { status: "fail", evidence: `no new page under ${locale}/` },
      ];
      return [
        written,
        ...Object.keys(DIAGRAM_RUBRIC).map((check): [string, Verdict] => {
          const verdicts = inLocale.map(({ file, grade }) => ({
            file,
            verdict: grade[check] ?? { status: "invalid" as const, evidence: "no verdict" },
          }));
          const status = verdicts
            .map(({ verdict }) => verdict.status)
            .reduce<Verdict["status"]>(
              (worst, next) => (SEVERITY[next] > SEVERITY[worst] ? next : worst),
              "n/a",
            );
          const evidence = verdicts
            .map(({ file, verdict }) => `${file} ${verdict.status}: ${verdict.evidence}`)
            .join("\n");
          return [`${locale} / ${check}`, { status, evidence }];
        }),
      ];
    }),
  );
}

function defineDiagramEval(component: string, request: string): void {
  defineEval<State>(`write-diagrams-${component}`, {
    timeoutMs: 600_000,
    async setup(workdir) {
      await exportTargetRepo(workdir);
      const init = await explain(workdir, ["init", "--locales=zh,en"]);
      if (init.code !== 0) throw new Error(`explain init failed: ${init.output}`);
      return { before: (await readdir(workdir, { recursive: true })).sort() };
    },
    turns: [request],
    async inspect(workdir, { before }) {
      const repos = readRepos(workdir);
      const dump = dumpDir(component);
      const pages = newPageFiles(workdir, before).map((file) => {
        const markdown = readFileSync(join(workdir, file), "utf8");
        const material = pageMaterial(markdown, repos);
        const out = join(dump, file);
        mkdirSync(dirname(out), { recursive: true });
        writeFileSync(out, markdown);
        writeFileSync(out.replace(/\.md$/, ".material.txt"), material);
        return { file, material };
      });
      return { before, pages };
    },
    grade(_run, { pages }) {
      if (pages === undefined) throw new Error("inspect did not run");
      return gradePages(pages);
    },
  });
}

defineDiagramEval(
  "parse-page",
  "/skill:explain-this I'd like a page on how the explain-this repo (checked out at ../explain-this) parses a page: how `parsePage` in packages/contract/src/parse-page turns a page's markdown into the `Page` tree and its diagnostics.",
);

defineDiagramEval(
  "dev",
  "/skill:explain-this I'd like a page on how `explain dev` in the explain-this repo (checked out at ../explain-this) live-reloads the browser when a page or a cited file changes. The code is in packages/cli/src/site/dev.ts.",
);
