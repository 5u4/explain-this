import { plainText } from "@explain/contract/page";
import type { PageResponse, SiteResponse } from "@explain/viewer/api";
import type { DocDir, DocPage } from "../doc-dir/types.ts";

const pageTitle = (page: DocPage): string =>
  (page.status === "parsed" ? plainText(page.page.title).trim() : "") || page.id;

export const siteResponse = (docDir: DocDir): SiteResponse => {
  const nav = docDir.pages.map((page) => ({ id: page.id, title: pageTitle(page) }));
  return { status: "ok", title: nav[0]?.title ?? "Document", errors: docDir.errors, nav };
};

export const pageResponse = (page: DocPage): PageResponse => {
  const address = { id: page.id, file: page.file };
  switch (page.status) {
    case "invalid":
      return { ...address, status: "invalid", diagnostics: page.diagnostics };
    case "parsed":
      return { ...address, status: "parsed", page: page.page, diagnostics: page.diagnostics };
  }
};
