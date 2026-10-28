import type { Page } from "@explain/contract/page";
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
  readonly id: string;
  readonly file: string;
  readonly diagnostics: ReadonlyArray<PageDiagnostic>;
}

export type DocPage =
  | (CheckedPage & { readonly status: "invalid" })
  | (CheckedPage & { readonly status: "parsed"; readonly page: Page });

export type Resolved =
  | { readonly status: "file"; readonly bytes: Uint8Array; readonly lines: number }
  | { readonly status: "missing-key" }
  | { readonly status: "missing" }
  | { readonly status: "escapes" }
  | { readonly status: "not-a-file" };

export interface DocDir {
  readonly root: string;
  readonly pages: ReadonlyArray<DocPage>;
  readonly errors: ReadonlyArray<Diagnostic>;
  readonly resolveSource: (
    repo: string,
    path: string,
  ) => Effect.Effect<Resolved, PlatformError.PlatformError>;
}

export type DocDirServices = FileSystem.FileSystem | Path.Path;
