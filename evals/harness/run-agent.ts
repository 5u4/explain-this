import { copyFileSync, cpSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import type { Subprocess } from "bun";
import type { Run, Scenario, SessionEntry, ToolCall, Turn } from "./types.ts";

const SKILL_NAME = "explain-this";

const TRIAL_TIMEOUT_MS = 280_000;
const EXIT_GRACE_MS = 10_000;
const PROFILES_DIR = join(homedir(), ".omp", "profiles");
const OWNED_NAME = /^ws-(\d+)-[0-9a-f]{8}$/;
const INTERACTIVE_UI_METHODS: Record<string, true> = {
  select: true,
  confirm: true,
  input: true,
  editor: true,
  ask: true,
};

type Frame = { type: string; id?: string; method?: string; success?: boolean; status?: string };

type ContentBlock = {
  type: string;
  text?: string;
  name?: string;
  arguments?: Record<string, unknown>;
};

type SessionLine = {
  type: string;
  customType?: string;
  content?: string | ContentBlock[];
  message?: { role: string; content: string | ContentBlock[] };
};

function textOf(content: string | ContentBlock[] | undefined): string {
  if (typeof content === "string") return content;
  return (content ?? []).map((block) => (block.type === "text" ? (block.text ?? "") : "")).join("");
}

function parseEntry(line: string): SessionEntry | undefined {
  const raw = JSON.parse(line) as SessionLine;
  if (raw.type === "custom_message" && raw.customType === "skill-prompt") {
    const skill = /User invoked the "([^"]+)" skill/.exec(textOf(raw.content))?.[1] ?? "";
    return { type: "skill-prompt", skill };
  }
  if (raw.type !== "message" || raw.message?.role !== "assistant") return undefined;
  const content = raw.message.content;
  const toolCalls: ToolCall[] = (typeof content === "string" ? [] : content).flatMap((block) =>
    block.type === "toolCall" && block.name !== undefined
      ? [{ name: block.name, arguments: block.arguments ?? {} }]
      : [],
  );
  return { type: "assistant", text: textOf(content), toolCalls };
}

function readSessionEntries(sessionDir: string): SessionEntry[] {
  return readdirSync(sessionDir)
    .filter((name) => name.endsWith(".jsonl"))
    .flatMap((name) => readFileSync(join(sessionDir, name), "utf8").split("\n"))
    .filter((line) => line !== "")
    .flatMap((line) => parseEntry(line) ?? []);
}

function populateProfile(dir: string, skillDir: string): void {
  mkdirSync(join(dir, "agent"), { recursive: true });
  copyFileSync(join(homedir(), ".omp", "agent", "agent.db"), join(dir, "agent", "agent.db"));
  cpSync(skillDir, join(dir, "agent", "skills", SKILL_NAME), { recursive: true });
}

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

async function shutDown(agent: Subprocess, stop: () => void): Promise<void> {
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

async function* readFrames(stream: ReadableStream<Uint8Array>): AsyncGenerator<Frame> {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of stream) {
    buffer += decoder.decode(chunk, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      yield JSON.parse(line) as Frame;
      newline = buffer.indexOf("\n");
    }
  }
}

export async function runTrial<S>(
  scenario: Pick<Scenario<S>, "setup" | "turns" | "inspect">,
  options: { model: string; skillDir: string },
): Promise<{ run: Run; state: S }> {
  sweepOrphans();
  const name = `ws-${process.pid}-${crypto.randomUUID().slice(0, 8)}`;
  const root = join(tmpdir(), name);
  const profileDir = join(PROFILES_DIR, name);
  mkdirSync(root, { mode: 0o700 });
  try {
    populateProfile(profileDir, options.skillDir);
    const workdir = join(root, "acme-docs");
    const sessionDir = join(root, "sessions");
    mkdirSync(workdir);
    mkdirSync(sessionDir);
    const setupState = await scenario.setup(workdir);

    const agent = Bun.spawn(
      [
        "omp",
        "--mode",
        "rpc",
        "--profile",
        name,
        "--session-dir",
        sessionDir,
        "--no-extensions",
        `--skills=${SKILL_NAME}`,
        "--model",
        options.model,
      ],
      { cwd: workdir, stdin: "pipe", stdout: "pipe", stderr: "pipe", timeout: TRIAL_TIMEOUT_MS },
    );
    const stderr = new Response(agent.stderr).text();
    const frames = readFrames(agent.stdout);
    const send = (frame: object) => {
      agent.stdin.write(`${JSON.stringify(frame)}\n`);
      agent.stdin.flush();
    };
    const waitFor = async (what: string, match: (frame: Frame) => boolean): Promise<Frame> => {
      for (;;) {
        const next = await frames.next();
        if (next.done) {
          await agent.exited;
          throw new Error(
            `omp exited (code ${agent.exitCode}, signal ${agent.signalCode}) while waiting for ${what}: ${await stderr}`,
          );
        }
        const frame = next.value;
        if (frame.type === "extension_ui_request" && INTERACTIVE_UI_METHODS[frame.method ?? ""])
          send({ type: "extension_ui_response", id: frame.id, cancelled: true });
        if (match(frame)) return frame;
      }
    };

    const turns: Turn[] = [];
    try {
      await waitFor("ready", (frame) => frame.type === "ready");
      for (const [index, prompt] of scenario.turns.entries()) {
        const id = `turn-${index + 1}`;
        const entriesBefore = readSessionEntries(sessionDir).length;
        send({ id, type: "prompt", message: prompt });
        const result = await waitFor(`${id} prompt_result`, (frame) => {
          if (frame.id !== id) return false;
          return (
            frame.type === "prompt_result" || (frame.type === "response" && frame.success === false)
          );
        });
        if (result.type === "response" || result.status === "error")
          throw new Error(`${id} failed: ${JSON.stringify(result)}`);
        const entries = readSessionEntries(sessionDir).slice(entriesBefore);
        const reply = entries.findLast((entry) => entry.type === "assistant")?.text ?? "";
        turns.push({ prompt, reply, entries });
      }
    } catch (error) {
      await shutDown(agent, () => agent.kill());
      throw error;
    }
    await shutDown(agent, () => agent.stdin.end());

    const state = scenario.inspect ? await scenario.inspect(workdir, setupState) : setupState;
    return { run: { turns }, state };
  } finally {
    rmSync(profileDir, { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
  }
}
