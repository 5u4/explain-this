export type Verdict = { status: "pass" | "fail" | "n/a" | "invalid"; evidence: string };

export type Grade = Record<string, Verdict>;

export type ToolCall = { name: string; arguments: Record<string, unknown> };

export type SessionEntry =
  | { type: "skill-prompt"; skill: string }
  | { type: "assistant"; text: string; toolCalls: ToolCall[] };

export type Turn = { prompt: string; reply: string; entries: SessionEntry[] };

export type Run = { turns: Turn[] };

export type Scenario<S> = {
  setup(workdir: string): Promise<S>;
  turns: string[];
  inspect?(workdir: string, state: S): Promise<S>;
  grade(run: Run, state: S): Grade | Promise<Grade>;
};
