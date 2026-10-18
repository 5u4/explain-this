import { readdir } from "node:fs/promises";
import { defineEval } from "../harness/eval.ts";
import { judge } from "../harness/judge.ts";
import { INIT_REPLY_RUBRIC } from "../harness/rubric.ts";
import { exportTargetRepo } from "../harness/target-repo.ts";
import type { Verdict } from "../harness/types.ts";

defineEval<{ files: string[] }>("missing-config", {
  async setup(workdir) {
    await exportTargetRepo(workdir);
    return { files: (await readdir(workdir, { recursive: true })).sort() };
  },
  turns: [
    "/skill:explain-this I'd like a page on how citations get parsed in the explain-this repo (checked out at ../explain-this). Mostly the path from a `repo:path:ranges` string to what the viewer ends up showing.",
  ],
  async inspect(workdir) {
    return { files: (await readdir(workdir, { recursive: true })).sort() };
  },
  async grade(run, { files }) {
    const writesNothing: Verdict =
      files.length === 0
        ? { status: "pass", evidence: "doc root is still empty" }
        : { status: "fail", evidence: `doc root now holds ${JSON.stringify(files)}` };

    return {
      "writes-nothing": writesNothing,
      ...(await judge(run.turns.at(-1)?.reply ?? "", INIT_REPLY_RUBRIC)),
    };
  },
});
