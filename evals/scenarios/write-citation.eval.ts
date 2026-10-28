import { readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { type CliResult, explain } from "../harness/cli.ts";
import { type DocDir, explainRoot, readDocDirs } from "../harness/doc-dir.ts";
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
  trialDates,
  WRITE_REPLY_RUBRIC,
} from "../harness/rubric.ts";
import { settleAll } from "../harness/settle.ts";
import { readPinned } from "../harness/target-repo.ts";
import type { Grade, Run, ToolCall, Verdict } from "../harness/types.ts";

const DOC_DIR_NAME = /^(\d{8})-[a-z0-9-]+$/;

type Page = { file: string; markdown: string; material: string };

type Inspection = {
  home: string;
  cwd: string;
  explainRoots: string[];
  names: string[];
  docDir: { name: string; pages: Page[]; validate: CliResult; codeVerbatim: Verdict } | undefined;
};

const verdict = (pass: boolean, evidence: string): Verdict => ({
  status: pass ? "pass" : "fail",
  evidence,
});

async function codeVerbatim({ codeFiles }: DocDir): Promise<Verdict> {
  if (codeFiles.length === 0) return verdict(false, "no file under code/");
  for (const { key, path, file } of codeFiles) {
    let pinned: string;
    try {
      pinned = await readPinned(path);
    } catch {
      return verdict(false, `code/${key}/${path}: ${path} does not exist at the pinned commit`);
    }
    if (readFileSync(file, "utf8") !== pinned)
      return verdict(false, `code/${key}/${path} differs from ${path} at the pinned commit`);
  }
  return verdict(true, `${codeFiles.length} files under code/ match the pinned commit`);
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
  if (pages.length === 0)
    return Object.fromEntries(
      Object.keys(PAGE_RUBRIC).map((check) => [check, verdict(false, "no page to judge")]),
    );
  const judged = await settleAll(
    pages.map(async (page) => ({
      file: page.file,
      grade: await judge(page.material, PAGE_RUBRIC),
    })),
  );
  return Object.fromEntries(
    Object.keys(PAGE_RUBRIC).map((check) => {
      const verdicts = judged.map(({ file, grade }) => ({
        file,
        verdict: grade[check] ?? { status: "invalid" as const, evidence: "no verdict" },
      }));
      const status = verdicts
        .map(({ verdict }) => verdict.status)
        .reduce((worst, next) => (SEVERITY[next] > SEVERITY[worst] ? next : worst));
      const evidence = verdicts
        .map(({ file, verdict }) => `${file} ${verdict.status}: ${verdict.evidence}`)
        .join("\n");
      return [check, { status, evidence }];
    }),
  );
}

function lastValidateRun(calls: ToolCall[]): CommandRun | string {
  const call = calls.findLast(
    ({ name, arguments: args }) =>
      name === "bash" &&
      typeof args.command === "string" &&
      /\bexplain\s+validate\s+\S/.test(args.command),
  );
  const command = call?.arguments.command;
  if (call === undefined || typeof command !== "string")
    return "no bash call ran explain validate <dir>";
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
  const { home, cwd, explainRoots, names, docDir } = inspection;
  const calls = run.turns.flatMap((turn) =>
    turn.entries.flatMap((entry) => (entry.type === "assistant" ? entry.toolCalls : [])),
  );
  const inExplain = (path: string): string | undefined => {
    const absolute = path.startsWith("~/") ? join(home, path.slice(2)) : resolve(cwd, path);
    for (const root of explainRoots) {
      const rel = relative(root, absolute);
      if (!rel.startsWith("..") && !isAbsolute(rel)) return rel;
    }
    return undefined;
  };
  const isPage = (path: string) => /^[^/]+\/[^/]+\.md$/.test(inExplain(path) ?? "");

  const dates = [...trialDates(run.startedAt, run.endedAt)];
  const date = docDir === undefined ? undefined : DOC_DIR_NAME.exec(docDir.name)?.[1];
  const docDirVerdict = verdict(
    date !== undefined && dates.includes(date),
    `dirs under ~/.explain ${JSON.stringify(names)}, trial dates ${JSON.stringify(dates)}`,
  );

  const pages = docDir?.pages ?? [];
  const pagesVerdict = verdict(
    pages.length > 0,
    docDir === undefined
      ? `no single doc dir: ${JSON.stringify(names)}`
      : `pages ${JSON.stringify(pages.map((page) => page.file))}`,
  );

  const validated =
    docDir === undefined
      ? verdict(false, "no single doc dir to validate")
      : verdict(
          docDir.validate.code === 0,
          `validate exit ${docDir.validate.code}: ${docDir.validate.output.trim()}`,
        );

  const codeWrites = calls.flatMap((call, index) =>
    touchedFiles(call)
      .filter((path) => /^[^/]+\/code\//.test(inExplain(path) ?? ""))
      .map((path) => `tool call ${index + 1} ${call.name} ${path}`),
  );
  const copiesWithShell = verdict(
    codeWrites.length === 0,
    codeWrites.length === 0 ? "no write or edit under code/" : codeWrites.join("\n"),
  );

  const [pageGrade, replyGrade, scopeGrade] = await settleAll<Grade>([
    judgePages(pages),
    judgeReply(run.turns.at(-1)?.reply ?? "", pages, calls),
    judge(scopeMaterial(run.turns.map((turn) => turn.prompt).join("\n\n"), pages), SCOPE_RUBRIC),
  ]);
  return {
    "doc-dir": docDirVerdict,
    pages: pagesVerdict,
    validate: validated,
    "code-verbatim": docDir?.codeVerbatim ?? verdict(false, "no single doc dir"),
    "copies-with-shell": copiesWithShell,
    "reads-format-first": readsGuideFirst(calls, "format.md", isPage),
    "reads-writing-first": readsGuideFirst(calls, "writing.md", isPage),
    ...pageGrade,
    ...replyGrade,
    ...scopeGrade,
  };
}

defineEval<Inspection>("write-citation", {
  timeoutMs: 600_000,
  turns: [CITATION_REQUEST],
  async inspect({ home, cwd }) {
    const root = explainRoot(home);
    const docDirs = readDocDirs(home);
    const [only] = docDirs.length === 1 ? docDirs : [];
    return {
      home,
      cwd,
      explainRoots: [root, join(realpathSync(home), ".explain")],
      names: docDirs.map(({ name }) => name),
      docDir:
        only === undefined
          ? undefined
          : {
              name: only.name,
              pages: only.pages.map(({ file, markdown }) => ({
                file: `~/.explain/${only.name}/${file}`,
                markdown,
                material: pageMaterial(markdown, CITATION_REQUEST, join(only.dir, "code")),
              })),
              validate: await explain(only.dir, ["validate", only.dir]),
              codeVerbatim: await codeVerbatim(only),
            },
    };
  },
  grade,
});
