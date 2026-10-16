import {
  compareSourceKeys,
  type Freshness,
  formatSourcesFile,
  type SourceFile,
  type StaleReason,
} from "@explain/contract/sources";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { sourceKey } from "./resolve-source.ts";
import type { ParsedDocPage, Resolved } from "./types.ts";

const blobHeaderEncoder = new TextEncoder();

export const makeBlobId = Effect.gen(function* () {
  const crypto = yield* Crypto.Crypto;
  const hashCache = new Map<string, string>();
  return Effect.fnUntraced(function* (key: string, bytes: Uint8Array) {
    const cached = hashCache.get(key);
    if (cached !== undefined) return cached;
    const header = blobHeaderEncoder.encode(`blob ${bytes.length}\u0000`);
    const blob = new Uint8Array(header.length + bytes.length);
    blob.set(header);
    blob.set(bytes, header.length);
    const digest = yield* crypto.digest("SHA-1", blob);
    const hex = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
    hashCache.set(key, hex);
    return hex;
  });
});

export const compareSources = Effect.fnUntraced(function* <E, R>(
  cited: ReadonlyMap<string, { repo: string; path: string }>,
  recorded: ReadonlyArray<SourceFile> | undefined,
  current: ReadonlyArray<SourceFile>,
  resolve: (repo: string, path: string) => Effect.Effect<Resolved, E, R>,
) {
  if (recorded === undefined) {
    return { status: "stale", reasons: [{ kind: "sources-missing" }] } satisfies Freshness;
  }
  const currentHashes = new Map(
    current.map((file) => [sourceKey(file.repo, file.path), file.hash]),
  );
  const recordedKeys = new Set(recorded.map((file) => sourceKey(file.repo, file.path)));
  const reasons: Array<Extract<StaleReason, { readonly repo: string }>> = [];
  for (const [key, source] of cited) {
    if (!recordedKeys.has(key)) reasons.push({ kind: "not-recorded", ...source });
  }
  for (const file of recorded) {
    const source = { repo: file.repo, path: file.path };
    const key = sourceKey(file.repo, file.path);
    if (!cited.has(key)) {
      reasons.push({ kind: "not-cited", ...source });
      continue;
    }
    const hash = currentHashes.get(key);
    if (hash === undefined) {
      const resolved = yield* resolve(file.repo, file.path);
      if (resolved.status !== "file") reasons.push({ kind: "missing", ...source });
      continue;
    }
    if (hash !== file.hash) reasons.push({ kind: "changed", ...source });
  }
  reasons.sort(compareSourceKeys);
  return reasons.length === 0
    ? ({ status: "fresh" } satisfies Freshness)
    : ({ status: "stale", reasons } satisfies Freshness);
});

export const writeSources = Effect.fnUntraced(function* (root: string, page: ParsedDocPage) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  yield* fs.writeFileString(path.join(root, page.sourcesFile), formatSourcesFile(page.sources));
});
