import type { ExplainConfig } from "@explain/contract/config";
import type { Page } from "@explain/contract/page";
import type { Freshness, SourceFile } from "@explain/contract/sources";
import type * as Crypto from "effect/Crypto";
import type * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";
import type * as PlatformError from "effect/PlatformError";
import type { PageDiagnostic } from "./page-diagnostic.ts";

export interface Diagnostic {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly message: string;
}

interface CheckedPage {
  readonly locale: string;
  readonly id: string;
  readonly file: string;
  readonly sourcesFile: string;
  readonly diagnostics: ReadonlyArray<PageDiagnostic>;
}

export type ParsedDocPage = CheckedPage & {
  readonly status: "parsed";
  readonly page: Page;
  readonly sources: ReadonlyArray<SourceFile>;
  readonly recorded: ReadonlyArray<SourceFile> | undefined;
  readonly freshness: Freshness;
};

export type DocPage =
  | (CheckedPage & { readonly status: "missing" })
  | (CheckedPage & { readonly status: "invalid" })
  | ParsedDocPage;

export type Resolved =
  | { readonly status: "file"; readonly bytes: Uint8Array; readonly lines: number }
  | { readonly status: "unknown-repo" }
  | { readonly status: "missing" }
  | { readonly status: "escapes" }
  | { readonly status: "not-a-file" };

export interface DocRoot {
  readonly root: string;
  readonly config: ExplainConfig;
  readonly repos: ReadonlyMap<string, string>;
  readonly pages: ReadonlyArray<DocPage>;
  readonly errors: ReadonlyArray<Diagnostic>;
  readonly resolveSource: (
    repo: string,
    path: string,
  ) => Effect.Effect<Resolved, PlatformError.PlatformError>;
}

export type DocRootServices = FileSystem.FileSystem | Path.Path | Crypto.Crypto;
