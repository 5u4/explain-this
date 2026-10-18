import {
  copyFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import type { Run, Scenario, SessionEntry, ToolCall, Turn } from "./types.ts";

const SKILL_NAME = "explain-this";

const TRIAL_TIMEOUT_MS = 280_000;
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
  const root = mkdtempSync(join(tmpdir(), "ws-"));
  const profile = `ws-${crypto.randomUUID().slice(0, 8)}`;
  const profileDir = join(homedir(), ".omp", "profiles", profile);
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
        profile,
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
      agent.stdin.end();
      await agent.exited;
    } finally {
      agent.kill();
    }

    const state = scenario.inspect ? await scenario.inspect(workdir, setupState) : setupState;
    return { run: { turns }, state };
  } finally {
    rmSync(profileDir, { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
  }
}
