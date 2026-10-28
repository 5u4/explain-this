import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./target-repo.ts";

const MAIN = join(REPO_ROOT, "packages", "cli", "src", "main.ts");

export type CliResult = { code: number; output: string };

export function installExplain(root: string): { binDir: string; openLog: string } {
  const binDir = join(root, "bin");
  const openLog = join(root, "open.log");
  mkdirSync(binDir);
  const shim = join(binDir, "explain");
  writeFileSync(
    shim,
    `#!/bin/sh
if [ "$1" = open ]; then
  printf '%s\\n' "$*" >> '${openLog}'
  echo http://127.0.0.1:4321/
  exit 0
fi
exec bun '${MAIN}' "$@"
`,
  );
  chmodSync(shim, 0o755);
  return { binDir, openLog };
}

export async function explain(cwd: string, args: string[]): Promise<CliResult> {
  const proc = Bun.spawn(["bun", MAIN, ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, output: `${stdout}${stderr}` };
}
