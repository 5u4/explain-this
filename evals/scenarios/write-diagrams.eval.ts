import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { readDocDirs } from "../harness/doc-dir.ts";
import { defineEval } from "../harness/eval.ts";
import { judge } from "../harness/judge.ts";
import { DIAGRAM_RUBRIC, pageMaterial } from "../harness/rubric.ts";
import { settleAll } from "../harness/settle.ts";
import { REPO_ROOT } from "../harness/target-repo.ts";
import type { Grade, Verdict } from "../harness/types.ts";

const SEVERITY: Record<Verdict["status"], number> = { "n/a": 0, pass: 1, fail: 2, invalid: 3 };

type Page = { file: string; material: string };

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
  const written: Verdict =
    judged.length > 0
      ? { status: "pass", evidence: judged.map(({ file }) => file).join(", ") }
      : { status: "fail", evidence: "no page under ~/.explain" };
  return Object.fromEntries([
    ["wrote-pages", written],
    ...Object.keys(DIAGRAM_RUBRIC).map((check): [string, Verdict] => {
      const verdicts = judged.map(({ file, grade }) => ({
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
      return [check, { status, evidence }];
    }),
  ]);
}

function defineDiagramEval(component: string, request: string): void {
  defineEval<Page[]>(`write-diagrams-${component}`, {
    timeoutMs: 600_000,
    turns: [request],
    async inspect({ home }) {
      const dump = dumpDir(component);
      return readDocDirs(home).flatMap(({ dir, name, pages }) =>
        pages.map(({ file, markdown }) => {
          const material = pageMaterial(markdown, request, join(dir, "code"));
          const out = join(dump, name, file);
          mkdirSync(dirname(out), { recursive: true });
          writeFileSync(out, markdown);
          writeFileSync(out.replace(/\.md$/, ".material.txt"), material);
          return { file: `~/.explain/${name}/${file}`, material };
        }),
      );
    },
    grade: (_run, pages) => gradePages(pages),
  });
}

defineDiagramEval(
  "parse-page",
  "/skill:explain-this I'd like a page on how the explain-this repo, which is the current directory, parses a page: how `parsePage` in packages/contract/src/parse-page turns a page's markdown into the `Page` tree and its diagnostics.",
);

defineDiagramEval(
  "dev",
  "/skill:explain-this I'd like a page on how `explain dev` in the explain-this repo, which is the current directory, live-reloads the browser when a page or a cited file changes. The code is in packages/cli/src/site/dev.ts.",
);
