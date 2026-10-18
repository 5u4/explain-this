import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { runTrial } from "./run-agent.ts";
import { REPO_ROOT } from "./target-repo.ts";
import type { Grade, Run, Scenario } from "./types.ts";

type EvalConfig = { model: string; trials: number; skillDir: string };

function evalConfig(env = process.env): EvalConfig {
  const trials = Number(env.EXPLAIN_EVAL_TRIALS ?? "3");
  if (!Number.isInteger(trials) || trials < 1)
    throw new Error("EXPLAIN_EVAL_TRIALS must be a positive integer");
  const skillDir = resolve(env.EXPLAIN_EVAL_SKILL ?? join(REPO_ROOT, "skills", "explain-this"));
  if (!existsSync(join(skillDir, "SKILL.md")))
    throw new Error(`EXPLAIN_EVAL_SKILL has no SKILL.md: ${skillDir}`);
  return { model: env.EXPLAIN_EVAL_MODEL ?? "github-copilot/gpt-6.1-sol:low", trials, skillDir };
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

function gradeRun<S>(scenario: Scenario<S>, run: Run, state: S): Grade {
  const grade = scenario.grade(run, state);
  const evidence = unexpandedSkill(run);
  if (evidence === undefined) return grade;
  return Object.fromEntries(
    Object.keys(grade).map((check) => [check, { status: "invalid", evidence }]),
  );
}

function summarize(scenario: string, grades: Grade[], errored: number): string[] {
  const checks = [...new Set(grades.flatMap((grade) => Object.keys(grade)))];
  return [
    `${scenario}: ${grades.length} graded, ${errored} errored`,
    ...checks.map((check) => {
      const verdicts = grades.flatMap((grade) => grade[check] ?? []);
      const valid = verdicts.filter((verdict) => verdict.status !== "invalid");
      const passed = valid.filter((verdict) => verdict.status === "pass").length;
      const invalid = verdicts.length - valid.length;
      return `${scenario} / ${check}: pass ${passed}/${valid.length}, invalid ${invalid}`;
    }),
  ];
}

export function defineEval<S>(name: string, scenario: Scenario<S>): void {
  const config = evalConfig();
  const stamp = new Date().toISOString().replaceAll(":", "-");
  const resultsDir = join(REPO_ROOT, "evals", "results");
  const resultsFile = join(resultsDir, `${stamp}-${name}.jsonl`);
  const grades: Grade[] = [];
  let errored = 0;
  const record = (fields: { trial: number; grade: Grade } | { trial: number; error: string }) => {
    mkdirSync(resultsDir, { recursive: true });
    appendFileSync(
      resultsFile,
      `${JSON.stringify({ model: config.model, skill: config.skillDir, scenario: name, ...fields })}\n`,
    );
  };

  afterAll(() => {
    process.stdout.write(
      `${[
        `model ${config.model}, skill ${config.skillDir}`,
        ...summarize(name, grades, errored),
        `results: ${resultsFile}`,
      ].join("\n")}\n`,
    );
  });

  describe(name, () => {
    for (let trial = 1; trial <= config.trials; trial++) {
      test.concurrent(`trial ${trial}`, async () => {
        let grade: Grade;
        try {
          const { run, state } = await runTrial(scenario, config);
          grade = gradeRun(scenario, run, state);
        } catch (error) {
          errored++;
          record({ trial, error: String(error) });
          throw error;
        }
        grades.push(grade);
        record({ trial, grade });
        const allPass = Object.fromEntries(
          Object.keys(grade).map((check) => [check, expect.objectContaining({ status: "pass" })]),
        );
        expect(grade).toEqual(allPass);
      });
    }
  });
}
