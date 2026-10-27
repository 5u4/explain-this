import type { Diagnostic as Located, Page } from "@explain/contract/page";

export type ApiPath =
  | "/@explain/api/site.json"
  | `/@explain/api/page/${string}.json`
  | `/@explain/api/source/${string}/${string}.json`;

const segment = encodeURIComponent;

export const siteApiPath: ApiPath = "/@explain/api/site.json";

export const pageApiPath = (id: string): ApiPath => `/@explain/api/page/${segment(id)}.json`;

export const sourceApiPath = (repo: string, path: string): ApiPath =>
  `/@explain/api/source/${segment(repo)}/${path.split("/").map(segment).join("/")}.json`;

export type Diagnostic = Located & { readonly file: string };

export type PageDiagnosticTag =
  | "MissingPage"
  | "Parse"
  | "CitationRepo"
  | "CitationFile"
  | "PageLink";

export type PageDiagnostic = {
  readonly [Tag in PageDiagnosticTag]: Diagnostic & { readonly _tag: Tag };
}[PageDiagnosticTag];

export interface NavPage {
  readonly id: string;
  readonly title: string;
}

export interface NavGroup {
  readonly title: string;
  readonly pages: ReadonlyArray<NavPage>;
}

export type SiteResponse =
  | {
      readonly status: "ok";
      readonly title: string;
      readonly errors: ReadonlyArray<Diagnostic>;
      readonly nav: ReadonlyArray<NavGroup>;
    }
  | { readonly status: "invalid"; readonly errors: ReadonlyArray<Diagnostic> };

interface PageAddress {
  readonly id: string;
  readonly file: string;
}

export type PageResponse =
  | (PageAddress & { readonly status: "missing" })
  | (PageAddress & {
      readonly status: "invalid";
      readonly diagnostics: ReadonlyArray<PageDiagnostic>;
    })
  | (PageAddress & {
      readonly status: "parsed";
      readonly page: Page;
      readonly diagnostics: ReadonlyArray<PageDiagnostic>;
    });

export type SourceResponse =
  | {
      readonly status: "file";
      readonly repo: string;
      readonly path: string;
      readonly text: string;
      readonly lines: number;
    }
  | {
      readonly status: "missing";
      readonly repo: string;
      readonly path: string;
    };
