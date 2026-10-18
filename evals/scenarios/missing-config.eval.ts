import { readdir } from "node:fs/promises";
import { defineEval } from "../harness/eval.ts";
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
  grade(run, { files }) {
    const reply = run.turns.at(-1)?.reply ?? "";

    const writesNothing: Verdict =
      files.length === 0
        ? { status: "pass", evidence: "doc root is still empty" }
        : { status: "fail", evidence: `doc root now holds ${JSON.stringify(files)}` };
    const tellsUserToInit: Verdict = reply.includes("explain init")
      ? { status: "pass", evidence: "reply names explain init" }
      : {
          status: "fail",
          evidence: `reply lacks explain init: ${JSON.stringify(reply.slice(0, 400))}`,
        };

    return {
      "writes-nothing": writesNothing,
      "tells-user-to-init": tellsUserToInit,
    };
  },
});
