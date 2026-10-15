import type { ExplainConfig } from "@explain/contract/config";
import type { Page } from "@explain/contract/page";
import type { Freshness, SourceFile } from "@explain/contract/sources";
import type * as Crypto from "effect/Crypto";
import type * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";
import type * as PlatformError from "effect/PlatformError";

export interface Diagnostic {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly message: string;
}

interface PageAddress {
  readonly locale: string;
  readonly id: string;
  readonly file: string;
  readonly sourcesFile: string;
}

export type ParsedDocPage = PageAddress & {
  readonly status: "parsed";
  readonly page: Page;
  readonly errors: ReadonlyArray<Diagnostic>;
  readonly refProblems: ReadonlyArray<Diagnostic>;
  readonly sources: ReadonlyArray<SourceFile>;
  readonly recorded: ReadonlyArray<SourceFile> | undefined;
  readonly freshness: Freshness;
};

export type DocPage =
  | (PageAddress & { readonly status: "missing"; readonly errors: ReadonlyArray<Diagnostic> })
  | (PageAddress & { readonly status: "invalid"; readonly errors: ReadonlyArray<Diagnostic> })
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
  readonly pages: ReadonlyArray<DocPage>;
  readonly errors: ReadonlyArray<Diagnostic>;
  readonly widgets: ReadonlyArray<string>;
  readonly widgetCss: string;
  readonly resolveSource: (
    repo: string,
    path: string,
  ) => Effect.Effect<Resolved, PlatformError.PlatformError>;
}

export type DocRootServices = FileSystem.FileSystem | Path.Path | Crypto.Crypto;
