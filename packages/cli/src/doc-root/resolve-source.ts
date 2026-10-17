import { formatRange, type Ref } from "@explain/contract/citation";
import type { ExplainConfig } from "@explain/contract/config";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import type * as PlatformError from "effect/PlatformError";
import { configFileName } from "./config.ts";
import type { Diagnostic, Resolved } from "./types.ts";

export const sourceKey = (repo: string, path: string): string => `${repo}\u0000${path}`;

const countLines = (bytes: Uint8Array): number => {
  let lines = 0;
  for (const byte of bytes) if (byte === 0x0a) lines++;
  return bytes.length > 0 && bytes[bytes.length - 1] !== 0x0a ? lines + 1 : lines;
};

export const resolveRepos = Effect.fnUntraced(function* (root: string, config: ExplainConfig) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const realRoot = yield* fs.realPath(root);
  const errors: Array<Diagnostic> = [];
  const repos = new Map<string, string>();
  for (const [key, repoPath] of Object.entries(config.repos)) {
    const resolved = path.resolve(realRoot, repoPath);
    const real = yield* fs.realPath(resolved).pipe(Effect.orElseSucceed(() => undefined));
    const info = real === undefined ? undefined : yield* fs.stat(real).pipe(Effect.option);
    if (real === undefined || info?._tag !== "Some" || info.value.type !== "Directory") {
      errors.push({
        file: configFileName,
        line: 1,
        column: 1,
        message:
          resolved === repoPath
            ? `repos.${key}: ${repoPath} is not a directory`
            : `repos.${key}: ${repoPath} (${resolved}) is not a directory`,
      });
      continue;
    }
    repos.set(key, real);
  }
  return { repos, errors };
});

export const makeResolveSource = Effect.fnUntraced(function* (
  config: ExplainConfig,
  repos: ReadonlyMap<string, string>,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const resolvedCache = new Map<string, Resolved>();
  const resolve = Effect.fnUntraced(function* (repo: string, sourcePath: string) {
    const key = sourceKey(repo, sourcePath);
    const cached = resolvedCache.get(key);
    if (cached !== undefined) return cached;
    const resolved = yield* resolveUncached(repo, sourcePath);
    resolvedCache.set(key, resolved);
    return resolved;
  });
  const resolveUncached = Effect.fnUntraced(function* (
    repo: string,
    sourcePath: string,
  ): Effect.fn.Return<Resolved, PlatformError.PlatformError> {
    if (!Object.hasOwn(config.repos, repo)) return { status: "unknown-repo" } satisfies Resolved;
    const repoPath = repos.get(repo);
    if (repoPath === undefined) return { status: "missing" } satisfies Resolved;
    const real = yield* fs.realPath(path.join(repoPath, sourcePath)).pipe(Effect.option);
    if (real._tag === "None") return { status: "missing" } satisfies Resolved;
    if (!real.value.startsWith(`${repoPath}${path.sep}`)) {
      return { status: "escapes" } satisfies Resolved;
    }
    const info = yield* fs.stat(real.value);
    if (info.type !== "File") return { status: "not-a-file" } satisfies Resolved;
    const bytes = yield* fs.readFile(real.value);
    return { status: "file", bytes, lines: countLines(bytes) } satisfies Resolved;
  });
  return resolve;
});

export const refProblem = (ref: Ref, resolved: Resolved): string | undefined => {
  const name = `${ref.repo}:${ref.path}`;
  switch (resolved.status) {
    case "unknown-repo":
      return `unknown repo "${ref.repo}"; explain.json repos has no such key`;
    case "missing":
      return `${name} does not exist`;
    case "escapes":
      return `${name} resolves outside the repo`;
    case "not-a-file":
      return `${name} is not a file`;
    case "file": {
      const beyond = ref.ranges.find((range) => range.to > resolved.lines);
      return beyond === undefined
        ? undefined
        : `${name}:${formatRange(beyond)} is beyond the file's ${resolved.lines} lines`;
    }
  }
};
