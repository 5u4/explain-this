import * as Result from "effect/Result";

export interface LineRange {
  readonly from: number;
  readonly to: number;
}

export interface Ref {
  readonly repo: string;
  readonly path: string;
  readonly ranges: ReadonlyArray<LineRange>;
}

const repoKeyPattern = /^[a-z][a-z0-9-]*$/;

const reservedRepoKeys: Readonly<Record<string, true>> = {
  http: true,
  https: true,
  mailto: true,
};

const rangePattern = /^([1-9][0-9]*)(?:-([1-9][0-9]*))?$/;

export const repoKeyProblem = (key: string): string | undefined => {
  if (!repoKeyPattern.test(key)) return `repo key "${key}" must match ${repoKeyPattern.source}`;
  if (Object.hasOwn(reservedRepoKeys, key)) return `repo key "${key}" is reserved`;
  return undefined;
};

const pathProblem = (path: string): string | undefined => {
  if (path === "") return "citation path is empty";
  if (path.startsWith("/")) return `citation path "${path}" must be relative to the repo root`;
  if (path.includes("\\")) return `citation path "${path}" must use "/" separators`;
  for (const segment of path.split("/")) {
    if (segment === "") return `citation path "${path}" has an empty segment`;
    if (segment === "." || segment === "..") {
      return `citation path "${path}" must not contain "." or ".." segments`;
    }
  }
  return undefined;
};

const parseRanges = (text: string): Result.Result<ReadonlyArray<LineRange>, string> => {
  const ranges: Array<LineRange> = [];
  for (const part of text.split(",")) {
    const match = rangePattern.exec(part);
    if (match === null) {
      return Result.fail(`line range "${part}" must be N or N-M with 1-based line numbers`);
    }
    const from = Number(match[1]);
    const to = match[2] === undefined ? from : Number(match[2]);
    if (from > to) return Result.fail(`line range "${part}" ends before it starts`);
    const previous = ranges.at(-1);
    if (previous !== undefined && from <= previous.to) {
      return Result.fail(`line ranges "${text}" must be ascending and non-overlapping`);
    }
    ranges.push({ from, to });
  }
  return Result.succeed(ranges);
};

export const parseRef = (text: string): Result.Result<Ref, string> => {
  const parts = text.split(":");
  const [repo, path, ranges] = parts;
  if (parts.length < 2 || parts.length > 3 || repo === undefined || path === undefined) {
    return Result.fail(`citation "${text}" must be <repo>:<path>[:<ranges>]`);
  }
  const problem = repoKeyProblem(repo) ?? pathProblem(path);
  if (problem !== undefined) return Result.fail(problem);
  if (ranges === undefined) return Result.succeed({ repo, path, ranges: [] });
  return Result.map(parseRanges(ranges), (parsed) => ({ repo, path, ranges: parsed }));
};

export const formatRange = (range: LineRange): string =>
  range.from === range.to ? `${range.from}` : `${range.from}-${range.to}`;

export const formatRef = (ref: Ref): string =>
  ref.ranges.length === 0
    ? `${ref.repo}:${ref.path}`
    : `${ref.repo}:${ref.path}:${ref.ranges.map(formatRange).join(",")}`;
