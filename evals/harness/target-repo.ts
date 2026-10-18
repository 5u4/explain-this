import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

const PINNED_COMMIT = "0cb38b7";

export async function exportTargetRepo(workdir: string): Promise<void> {
  const target = join(dirname(workdir), "explain-this");
  mkdirSync(target);
  await Bun.$`git -C ${REPO_ROOT} archive ${PINNED_COMMIT} packages | tar -x -C ${target}`.quiet();
}
