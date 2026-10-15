import type { Block, Inline, Diagnostic as Located, Page } from "@explain/contract/page";
import type { Freshness, SourceFile } from "@explain/contract/sources";

export type ApiPath =
  | "/@explain/api/site.json"
  | `/@explain/api/page/${string}/${string}.json`
  | `/@explain/api/source/${string}/${string}.json`
  | `/@explain/api/search/${string}.json`;

export type WidgetPath = `/@explain/widgets/${string}.js` | "/@explain/widgets.css";

const segment = encodeURIComponent;

export const siteApiPath: ApiPath = "/@explain/api/site.json";

export const pageApiPath = (locale: string, id: string): ApiPath =>
  `/@explain/api/page/${segment(locale)}/${segment(id)}.json`;

export const sourceApiPath = (repo: string, path: string): ApiPath =>
  `/@explain/api/source/${segment(repo)}/${path.split("/").map(segment).join("/")}.json`;

export const searchApiPath = (locale: string): ApiPath =>
  `/@explain/api/search/${segment(locale)}.json`;

export type Diagnostic = Located & { readonly file: string };

export type PageStatus = "fresh" | "stale" | "invalid" | "missing";

export interface NavPage {
  readonly id: string;
  readonly title: string;
  readonly status: PageStatus;
}

export interface NavGroup {
  readonly title: string;
  readonly pages: ReadonlyArray<NavPage>;
}

export interface GlossaryTerm {
  readonly id: string;
  readonly label: ReadonlyArray<Inline>;
  readonly blocks: ReadonlyArray<Block>;
}

export interface LocaleSite {
  readonly title: string;
  readonly nav: ReadonlyArray<NavGroup>;
  readonly glossary: NavPage;
  readonly terms: ReadonlyArray<GlossaryTerm>;
}

export type SiteResponse =
  | {
      readonly status: "ok";
      readonly locales: ReadonlyArray<string>;
      readonly defaultLocale: string;
      readonly repos: Readonly<Record<string, { readonly commit: string | null }>>;
      readonly widgets: ReadonlyArray<string>;
      readonly errors: ReadonlyArray<Diagnostic>;
      readonly byLocale: Readonly<Record<string, LocaleSite>>;
    }
  | { readonly status: "invalid"; readonly errors: ReadonlyArray<Diagnostic> };

export type SourceState = "fresh" | "changed" | "missing" | "not-recorded" | "not-cited";

export interface SourceEntry {
  readonly repo: string;
  readonly path: string;
  readonly state: SourceState;
  readonly recorded: SourceFile | null;
  readonly current: SourceFile | null;
}

interface PageAddress {
  readonly locale: string;
  readonly id: string;
  readonly file: string;
}

export type PageResponse =
  | (PageAddress & { readonly status: "missing" })
  | (PageAddress & { readonly status: "invalid"; readonly errors: ReadonlyArray<Diagnostic> })
  | (PageAddress & {
      readonly status: "parsed";
      readonly page: Page;
      readonly errors: ReadonlyArray<Diagnostic>;
      readonly refProblems: ReadonlyArray<Diagnostic>;
      readonly freshness: Freshness;
      readonly sources: ReadonlyArray<SourceEntry>;
    });

export interface Citer {
  readonly locale: string;
  readonly id: string;
  readonly title: string;
}

export type SourceResponse =
  | {
      readonly status: "file";
      readonly repo: string;
      readonly path: string;
      readonly text: string;
      readonly lines: number;
      readonly citedBy: ReadonlyArray<Citer>;
    }
  | {
      readonly status: "missing";
      readonly repo: string;
      readonly path: string;
      readonly citedBy: ReadonlyArray<Citer>;
    };

export interface SearchEntry {
  readonly page: string;
  readonly pageTitle: string;
  readonly heading: string;
  readonly anchor: string | null;
  readonly text: string;
}

export type SearchIndex = ReadonlyArray<SearchEntry>;
