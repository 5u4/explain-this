import { plainText } from "@explain/contract/page";
import { compareSourceKeys, type SourceFile } from "@explain/contract/sources";
import type {
  LocaleSite,
  NavPage,
  PageResponse,
  SiteResponse,
  SourceEntry,
  SourceState,
} from "@explain/viewer/api";
import { sourceKey } from "../doc-root/resolve-source.ts";
import type { DocPage, DocRoot, ParsedDocPage } from "../doc-root/types.ts";

export const pageTitle = (page: DocPage): string =>
  (page.status === "parsed" ? plainText(page.page.title).trim() : "") || page.id;

const navPage = (page: DocPage): NavPage => ({
  id: page.id,
  title: pageTitle(page),
  status:
    page.status === "missing"
      ? "missing"
      : page.status === "invalid" || page.errors.length > 0
        ? "invalid"
        : page.freshness.status,
});

export const siteResponse = (docRoot: DocRoot): SiteResponse => {
  const { config } = docRoot;
  const pages = new Map(docRoot.pages.map((page) => [`${page.locale}/${page.id}`, page]));
  const navEntry = (locale: string, id: string): NavPage => {
    const page = pages.get(`${locale}/${id}`);
    return page === undefined ? { id, title: id, status: "missing" } : navPage(page);
  };
  const byLocale: Record<string, LocaleSite> = {};
  for (const locale of config.locales) {
    byLocale[locale] = {
      nav: config.nav.map((group) => ({
        title: group.title,
        pages: group.pages.map((id) => navEntry(locale, id)),
      })),
    };
  }
  return {
    status: "ok",
    title: config.title ?? "Document",
    locales: config.locales,
    defaultLocale: config.defaultLocale,
    widgets: docRoot.widgets,
    errors: docRoot.errors,
    byLocale,
  };
};

const sourceEntries = (page: ParsedDocPage): ReadonlyArray<SourceEntry> => {
  const recorded = new Map(
    (page.recorded ?? []).map((file) => [sourceKey(file.repo, file.path), file]),
  );
  const current = new Map(page.sources.map((file) => [sourceKey(file.repo, file.path), file]));
  const keys = new Map<string, { readonly repo: string; readonly path: string }>();
  for (const { ref } of page.page.refs) {
    keys.set(sourceKey(ref.repo, ref.path), { repo: ref.repo, path: ref.path });
  }
  for (const file of recorded.values()) {
    keys.set(sourceKey(file.repo, file.path), { repo: file.repo, path: file.path });
  }
  const reasons = page.freshness.status === "stale" ? page.freshness.reasons : [];
  const sourcesMissing = reasons.some((reason) => reason.kind === "sources-missing");
  const states = new Map<string, SourceState>();
  for (const reason of reasons) {
    if (reason.kind !== "sources-missing") {
      states.set(sourceKey(reason.repo, reason.path), reason.kind);
    }
  }
  return [...keys.entries()]
    .sort(([, a], [, b]) => compareSourceKeys(a, b))
    .map(([key, source]) => ({
      ...source,
      state: sourcesMissing ? "not-recorded" : (states.get(key) ?? "fresh"),
      recorded: recorded.get(key) ?? null,
      current: current.get(key) ?? (null satisfies SourceFile | null),
    }));
};

export const pageResponse = (page: DocPage): PageResponse => {
  const address = { locale: page.locale, id: page.id, file: page.file };
  switch (page.status) {
    case "missing":
      return { ...address, status: "missing" };
    case "invalid":
      return { ...address, status: "invalid", errors: page.errors };
    case "parsed":
      return {
        ...address,
        status: "parsed",
        page: page.page,
        errors: page.errors,
        refProblems: page.refProblems,
        freshness: page.freshness,
        sources: sourceEntries(page),
      };
  }
};
