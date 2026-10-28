export type Verdict = { status: "pass" | "fail" | "n/a" | "invalid"; evidence: string };

export type Grade = Record<string, Verdict>;

export type ToolCall = {
  name: string;
  arguments: Record<string, unknown>;
  output: string | undefined;
};

export type SessionEntry =
  | { type: "skill-prompt"; skill: string }
  | { type: "assistant"; text: string; toolCalls: ToolCall[] };

export type Turn = { prompt: string; reply: string; entries: SessionEntry[] };

export type Run = { turns: Turn[]; startedAt: Date; endedAt: Date; openCalls: string[] };

export type Workspace = { home: string; cwd: string };

export type Scenario<S> = {
  turns: string[];
  timeoutMs?: number;
  inspect(workspace: Workspace): Promise<S>;
  grade(run: Run, state: S): Grade | Promise<Grade>;
};
