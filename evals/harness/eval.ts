import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { type Criteria, JUDGE_TIMEOUT_MS, type JudgedStatus, judge } from "./judge.ts";
import { candidateModel, judgeModel } from "./models.ts";
import { runTrial, TRIAL_TIMEOUT_MS } from "./run-agent.ts";
import { EXIT_GRACE_MS } from "./scratch.ts";
import { settleAll } from "./settle.ts";
import { REPO_ROOT } from "./target-repo.ts";
import type { Grade, Run, Scenario, Verdict } from "./types.ts";

type EvalConfig = { model: string; judgeModel: string; trials: number; skillDir: string };

export type CalibrationCase = {
  material: string;
  criteria: Criteria;
  expected: Record<string, JudgedStatus>;
};

const SETTLED: Record<Verdict["status"], boolean> = {
  pass: true,
  "n/a": true,
  fail: false,
  invalid: false,
};

function evalConfig(env = process.env): EvalConfig {
  const trials = Number(env.EXPLAIN_EVAL_TRIALS ?? "3");
  if (!Number.isInteger(trials) || trials < 1)
    throw new Error("EXPLAIN_EVAL_TRIALS must be a positive integer");
  const skillDir = resolve(env.EXPLAIN_EVAL_SKILL ?? join(REPO_ROOT, "skills", "explain-this"));
  if (!existsSync(join(skillDir, "SKILL.md")))
    throw new Error(`EXPLAIN_EVAL_SKILL has no SKILL.md: ${skillDir}`);
  return { model: candidateModel(env), judgeModel: judgeModel(env), trials, skillDir };
}

function unexpandedSkill(run: Run): string | undefined {
  for (const [index, turn] of run.turns.entries()) {
    const skill = /^\/skill:(\S+)/.exec(turn.prompt)?.[1];
    if (skill === undefined) continue;
    const expanded = turn.entries.some(
      (entry) => entry.type === "skill-prompt" && entry.skill === skill,
    );
    if (!expanded)
      return `turn ${index + 1} sent /skill:${skill} but the session has no skill-prompt for it`;
  }
  return undefined;
}

async function gradeRun<S>(scenario: Scenario<S>, run: Run, state: S): Promise<Grade> {
  const grade = await scenario.grade(run, state);
  const evidence = unexpandedSkill(run);
  if (evidence === undefined) return grade;
  return Object.fromEntries(
    Object.keys(grade).map((check) => [check, { status: "invalid", evidence }]),
  );
}

function summarize(name: string, grades: Grade[], errored: number): string[] {
  const checks = [...new Set(grades.flatMap((grade) => Object.keys(grade)))];
  return [
    `${name}: ${grades.length} graded, ${errored} errored`,
    ...checks.map((check) => {
      const count = (status: Verdict["status"]) =>
        grades.filter((grade) => grade[check]?.status === status).length;
      const passed = count("pass");
      return `${name} / ${check}: pass ${passed}/${passed + count("fail")}, n/a ${count("n/a")}, invalid ${count("invalid")}`;
    }),
  ];
}

function defineTrials(
  name: string,
  trials: number,
  meta: Record<string, string>,
  gradeTrial: () => Promise<Grade>,
  timeout?: number,
): void {
  const stamp = new Date().toISOString().replaceAll(":", "-");
  const resultsDir = join(REPO_ROOT, "evals", "results");
  const resultsFile = join(resultsDir, `${stamp}-${name}.jsonl`);
  const grades: Grade[] = [];
  let errored = 0;
  const record = (fields: { trial: number; grade: Grade } | { trial: number; error: string }) => {
    mkdirSync(resultsDir, { recursive: true });
    appendFileSync(resultsFile, `${JSON.stringify({ ...meta, eval: name, ...fields })}\n`);
  };

  afterAll(() => {
    process.stdout.write(
      `${[
        Object.entries(meta)
          .map(([key, value]) => `${key} ${value}`)
          .join(", "),
        ...summarize(name, grades, errored),
        `results: ${resultsFile}`,
      ].join("\n")}\n`,
    );
  });

  describe(name, () => {
    for (let trial = 1; trial <= trials; trial++) {
      test.concurrent(
        `trial ${trial}`,
        async () => {
          let grade: Grade;
          try {
            grade = await gradeTrial();
          } catch (error) {
            errored++;
            record({ trial, error: String(error) });
            throw error;
          }
          grades.push(grade);
          record({ trial, grade });
          expect(Object.entries(grade).filter(([, verdict]) => !SETTLED[verdict.status])).toEqual(
            [],
          );
        },
        timeout,
      );
    }
  });
}

export function defineEval<S>(name: string, scenario: Scenario<S>): void {
  const config = evalConfig();
  defineTrials(
    name,
    config.trials,
    { model: config.model, judge: config.judgeModel, skill: config.skillDir },
    async () => {
      const { run, state } = await runTrial(scenario, config);
      return gradeRun(scenario, run, state);
    },
    TRIAL_TIMEOUT_MS + JUDGE_TIMEOUT_MS + 2 * EXIT_GRACE_MS,
  );
}

function agreement(caseId: string, { expected }: CalibrationCase, judged: Grade): Grade {
  return Object.fromEntries(
    Object.entries(expected).map(([check, want]) => {
      const got = judged[check] ?? { status: "invalid", evidence: `no criterion ${check}` };
      const status = got.status === "invalid" ? "invalid" : got.status === want ? "pass" : "fail";
      return [
        `${caseId} / ${check}`,
        { status, evidence: `expected ${want}, judged ${got.status}: ${got.evidence}` },
      ];
    }),
  );
}

export function defineCalibration(name: string, cases: Record<string, CalibrationCase>): void {
  const config = evalConfig();
  defineTrials(name, config.trials, { judge: config.judgeModel }, async () => {
    const grades = await settleAll(
      Object.entries(cases).map(async ([caseId, calibrationCase]) =>
        agreement(
          caseId,
          calibrationCase,
          await judge(calibrationCase.material, calibrationCase.criteria),
        ),
      ),
    );
    return Object.assign({}, ...grades);
  });
}
