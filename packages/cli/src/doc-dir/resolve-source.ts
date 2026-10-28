import { formatRange, type Ref } from "@explain/contract/citation";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import type * as PlatformError from "effect/PlatformError";
import type { DocDir, Resolved } from "./types.ts";

const countLines = (bytes: Uint8Array): number => {
  let lines = 0;
  for (const byte of bytes) if (byte === 0x0a) lines++;
  return bytes.length > 0 && bytes[bytes.length - 1] !== 0x0a ? lines + 1 : lines;
};

export const missingKeyMessage = (key: string): string => `no code/${key}/ in doc dir`;

export const escapesMessage = (key: string, path: string): string =>
  `${key}:${path} resolves outside code/${key}/`;

export const makeResolveSource = Effect.fnUntraced(function* (root: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const realDoc = yield* fs.realPath(root);
  const cache = new Map<string, Resolved>();

  const resolveUncached = Effect.fnUntraced(function* (
    key: string,
    sourcePath: string,
  ): Effect.fn.Return<Resolved, PlatformError.PlatformError> {
    const base = path.join(realDoc, "code", key);
    const baseInfo = yield* fs.stat(base).pipe(Effect.option);
    if (baseInfo._tag === "None" || baseInfo.value.type !== "Directory") {
      return { status: "missing-key" };
    }
    const real = yield* fs.realPath(path.join(base, sourcePath)).pipe(Effect.option);
    if (real._tag === "None") return { status: "missing" };
    if (!real.value.startsWith(`${base}${path.sep}`)) return { status: "escapes" };
    const info = yield* fs.stat(real.value);
    if (info.type !== "File") return { status: "not-a-file" };
    const bytes = yield* fs.readFile(real.value);
    return { status: "file", bytes, lines: countLines(bytes) };
  });

  const resolve: DocDir["resolveSource"] = Effect.fnUntraced(function* (key, sourcePath) {
    const cacheKey = `${key}\u0000${sourcePath}`;
    const cached = cache.get(cacheKey);
    if (cached !== undefined) return cached;
    const resolved = yield* resolveUncached(key, sourcePath);
    cache.set(cacheKey, resolved);
    return resolved;
  });
  return resolve;
});

export const refProblem = (ref: Ref, resolved: Resolved): string | undefined => {
  const name = `${ref.repo}:${ref.path}`;
  switch (resolved.status) {
    case "missing-key":
      return missingKeyMessage(ref.repo);
    case "missing":
      return `${name} does not exist`;
    case "escapes":
      return escapesMessage(ref.repo, ref.path);
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
