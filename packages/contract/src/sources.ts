import * as Schema from "effect/Schema";

const BlobId = Schema.String.check(
  Schema.isPattern(/^[0-9a-f]{40}$/, { message: "expected a 40-character lowercase SHA-1" }),
);

export const SourceFile = Schema.Struct({
  repo: Schema.String,
  path: Schema.String,
  hash: BlobId,
});

export type SourceFile = typeof SourceFile.Type;

export const SourcesFile = Schema.Struct({
  files: Schema.Array(SourceFile),
});

export type SourcesFile = typeof SourcesFile.Type;

export const SourcesFileFromJson = Schema.fromJsonString(SourcesFile);

export type StaleReason =
  | { readonly kind: "sources-missing" }
  | { readonly kind: "sources-malformed" }
  | { readonly kind: "not-recorded"; readonly repo: string; readonly path: string }
  | { readonly kind: "not-cited"; readonly repo: string; readonly path: string }
  | { readonly kind: "missing"; readonly repo: string; readonly path: string }
  | { readonly kind: "changed"; readonly repo: string; readonly path: string };

export type Freshness =
  | { readonly status: "fresh" }
  | { readonly status: "stale"; readonly reasons: ReadonlyArray<StaleReason> };

export const compareSourceKeys = (
  a: { readonly repo: string; readonly path: string },
  b: { readonly repo: string; readonly path: string },
): number =>
  a.repo < b.repo ? -1 : a.repo > b.repo ? 1 : a.path < b.path ? -1 : a.path > b.path ? 1 : 0;

export const formatSourcesFile = (files: ReadonlyArray<SourceFile>): string => {
  const ordered = [...files]
    .sort(compareSourceKeys)
    .map((file) => ({ repo: file.repo, path: file.path, hash: file.hash }));
  return `${JSON.stringify({ files: ordered }, null, 2)}\n`;
};
