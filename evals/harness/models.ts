const DEFAULT_MODEL = "github-copilot/gpt-6.1-sol:low";

export const candidateModel = (env = process.env): string =>
  env.EXPLAIN_EVAL_MODEL ?? DEFAULT_MODEL;

export const judgeModel = (env = process.env): string =>
  env.EXPLAIN_EVAL_JUDGE_MODEL ?? candidateModel(env);
