import { plainText } from "@explain/contract/page";
import type { PageResponse, SiteResponse } from "@explain/viewer/api";
import type { DocPage, DocRoot } from "../doc-root/types.ts";

const pageTitle = (page: DocPage): string =>
  (page.status === "parsed" ? plainText(page.page.title).trim() : "") || page.id;

export const siteResponse = (docRoot: DocRoot): SiteResponse => {
  const { config } = docRoot;
  const pages = new Map(docRoot.pages.map((page) => [page.id, page]));
  return {
    status: "ok",
    title: config.title ?? "Document",
    errors: docRoot.errors,
    nav: config.nav.map((group) => ({
      title: group.title,
      pages: group.pages.map((id) => {
        const page = pages.get(id);
        return { id, title: page === undefined ? id : pageTitle(page) };
      }),
    })),
  };
};

export const pageResponse = (page: DocPage): PageResponse => {
  const address = { id: page.id, file: page.file };
  switch (page.status) {
    case "missing":
      return { ...address, status: "missing" };
    case "invalid":
      return { ...address, status: "invalid", diagnostics: page.diagnostics };
    case "parsed":
      return { ...address, status: "parsed", page: page.page, diagnostics: page.diagnostics };
  }
};
