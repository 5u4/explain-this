import { judgeModel } from "./models.ts";
import { shutDown, withScratch } from "./scratch.ts";
import type { Grade, Verdict } from "./types.ts";

export type Criteria = Record<string, string>;

export type JudgedStatus = Exclude<Verdict["status"], "invalid">;

export const JUDGE_TIMEOUT_MS = 180_000;

const JUDGED: Record<string, JudgedStatus> = { pass: "pass", fail: "fail", "n/a": "n/a" };

const INSTRUCTIONS = `You are a strict, literal grader. You receive a list of criteria, each with an id, and one piece of material. Grade the material against every criterion independently, using only the material and the criterion text.

For each criterion choose one status:
- "pass": the criterion applies and the material meets every part of it.
- "fail": the criterion applies and the material misses any part of it.
- "n/a": the criterion itself names a condition under which it does not apply, and that condition holds.

Read the whole material before deciding. Do not give credit for what the author probably meant; grade what is written.

Evidence: for "pass" or "fail", a short verbatim quote (at most about 25 words) copied from the material that decides the verdict; when a "fail" is about something missing, quote the passage where it should have been. For "n/a", one sentence saying why the criterion does not apply.

Reply with one JSON object and nothing else. Its keys are the criterion ids exactly as given; each value is {"status": "pass" | "fail" | "n/a", "evidence": "..."}.`;

function prompt(material: string, criteria: Criteria): string {
  const listed = Object.entries(criteria)
    .map(([id, text]) => `<criterion id="${id}">\n${text}\n</criterion>`)
    .join("\n");
  return `<criteria>\n${listed}\n</criteria>\n\n<material>\n${material}\n</material>\n`;
}

function verdictOf(value: unknown): Verdict | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const { status, evidence } = value as Record<string, unknown>;
  if (typeof status !== "string" || typeof evidence !== "string") return undefined;
  const judged = Object.hasOwn(JUDGED, status) ? JUDGED[status] : undefined;
  return judged === undefined ? undefined : { status: judged, evidence };
}

function parseVerdicts(output: string, criteria: Criteria): Grade {
  const trimmed = output.trim();
  const body = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed)?.[1] ?? trimmed;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    parsed = undefined;
  }
  const verdicts =
    typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  return Object.fromEntries(
    Object.keys(criteria).map((id) => [
      id,
      verdictOf(Object.hasOwn(verdicts, id) ? verdicts[id] : undefined) ?? {
        status: "invalid",
        evidence: output,
      },
    ]),
  );
}

export async function judge(material: string, criteria: Criteria): Promise<Grade> {
  return withScratch({}, async ({ name, root, home }) => {
    const omp = Bun.spawn(
      [
        "omp",
        "--print",
        "--profile",
        name,
        "--no-tools",
        "--no-skills",
        "--no-rules",
        "--no-extensions",
        "--no-session",
        "--no-title",
        "--system-prompt",
        INSTRUCTIONS,
        "--model",
        judgeModel(),
      ],
      {
        cwd: root,
        env: { ...process.env, HOME: home },
        stdin: new TextEncoder().encode(prompt(material, criteria)),
        stdout: "pipe",
        stderr: "pipe",
        timeout: JUDGE_TIMEOUT_MS,
      },
    );
    try {
      const [output, errors, code] = await Promise.all([
        new Response(omp.stdout).text(),
        new Response(omp.stderr).text(),
        omp.exited,
      ]);
      if (code !== 0)
        throw new Error(`judge omp exited (code ${code}, signal ${omp.signalCode}): ${errors}`);
      return parseVerdicts(output, criteria);
    } finally {
      await shutDown(omp, () => omp.kill());
    }
  });
}
