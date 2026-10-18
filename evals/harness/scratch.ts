import { copyFileSync, cpSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import type { Subprocess } from "bun";

const EXIT_GRACE_MS = 10_000;
const PROFILES_DIR = join(homedir(), ".omp", "profiles");
const OWNED_NAME = /^ws-(\d+)-[0-9a-f]{8}$/;

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function isOrphaned(name: string): boolean {
  const pid = OWNED_NAME.exec(name)?.[1];
  return pid !== undefined && !isAlive(Number(pid));
}

let swept = false;
function sweepOrphans(): void {
  if (swept) return;
  swept = true;
  mkdirSync(PROFILES_DIR, { recursive: true });
  for (const dir of [PROFILES_DIR, tmpdir()])
    for (const name of readdirSync(dir).filter(isOrphaned))
      rmSync(join(dir, name), { recursive: true, force: true });
}

export async function withScratch<T>(
  options: { skill?: { name: string; dir: string } },
  use: (scratch: { name: string; root: string }) => Promise<T>,
): Promise<T> {
  sweepOrphans();
  const name = `ws-${process.pid}-${crypto.randomUUID().slice(0, 8)}`;
  const root = join(tmpdir(), name);
  const profileDir = join(PROFILES_DIR, name);
  mkdirSync(root, { mode: 0o700 });
  try {
    mkdirSync(join(profileDir, "agent"), { recursive: true });
    copyFileSync(
      join(homedir(), ".omp", "agent", "agent.db"),
      join(profileDir, "agent", "agent.db"),
    );
    if (options.skill)
      cpSync(options.skill.dir, join(profileDir, "agent", "skills", options.skill.name), {
        recursive: true,
      });
    return await use({ name, root });
  } finally {
    rmSync(profileDir, { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
  }
}

function descendantsOf(root: number): number[] {
  const children = new Map<number, number[]>();
  for (const row of Bun.spawnSync(["ps", "-axo", "pid=,ppid="]).stdout.toString().split("\n")) {
    const [pid, ppid] = row.trim().split(/\s+/).map(Number);
    if (pid === undefined || ppid === undefined) continue;
    children.set(ppid, [...(children.get(ppid) ?? []), pid]);
  }
  const found: number[] = [];
  const queue = [root];
  for (let next = queue.pop(); next !== undefined; next = queue.pop()) {
    const direct = children.get(next) ?? [];
    found.push(...direct);
    queue.push(...direct);
  }
  return found;
}

export async function shutDown(agent: Subprocess, stop: () => void): Promise<void> {
  const descendants = descendantsOf(agent.pid);
  stop();
  for (const deadline = Date.now() + EXIT_GRACE_MS; Date.now() < deadline; await Bun.sleep(100))
    if ((agent.exitCode !== null || agent.signalCode !== null) && !descendants.some(isAlive))
      return;
  agent.kill("SIGKILL");
  for (const pid of descendants.filter(isAlive)) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {}
  }
  await agent.exited;
  const deadline = Date.now() + EXIT_GRACE_MS;
  while (descendants.some(isAlive) && Date.now() < deadline) await Bun.sleep(100);
}
