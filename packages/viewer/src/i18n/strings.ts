import type { AlertKind } from "@explain/contract/page";

export interface Strings {
  readonly skip: string;
  readonly loading: string;
  readonly openNav: string;
  readonly navLabel: string;
  readonly tocLabel: string;
  readonly pageOf: (index: number, total: number) => string;
  readonly prev: string;
  readonly next: string;
  readonly pagerLabel: string;
  readonly copy: string;
  readonly copied: string;
  readonly copyFallback: string;
  readonly copyCode: string;
  readonly copyCited: string;
  readonly copiedStatus: string;
  readonly copyFailedStatus: string;
  readonly codeLanguages: Readonly<Record<string, string>>;
  readonly table: string;
  readonly taskDone: string;
  readonly taskTodo: string;
  readonly headingAnchor: string;
  readonly alerts: Readonly<Record<AlertKind, string>>;
  readonly wholeFile: string;
  readonly lines: (from: number, to: number) => string;
  readonly noteCount: (count: number) => string;
  readonly noteLabel: (index: number, range: string) => string;
  readonly itemCount: (count: number) => string;
  readonly itemsRemoved: (count: number, removed: number) => string;
  readonly removedItem: string;
  readonly diffAdded: string;
  readonly diffDeleted: string;
  readonly diffStat: (removed: number, added: number) => string;
  readonly diffRemovedLine: string;
  readonly diffAddedLine: string;
  readonly diffFold: (count: number) => string;
  readonly diagramFailed: string;
  readonly diagramSource: string;
  readonly fileGone: (path: string) => string;
  readonly fileGoneDetail: string;
  readonly fileUnreadable: (ref: string) => string;
  readonly pane: string;
  readonly paneLabel: (path: string, range: string) => string;
  readonly paneEmpty: string;
  readonly paneSource: (path: string) => string;
  readonly paneGone: string;
  readonly modes: { readonly follow: string; readonly pinned: string; readonly preview: string };
  readonly resumeFollow: string;
  readonly citeCount: (index: number, total: number) => string;
  readonly citeTotal: (total: number) => string;
  readonly prevCite: string;
  readonly nextCite: string;
  readonly openSheet: string;
  readonly closeSheet: string;
  readonly backHome: string;
  readonly noPages: string;
  readonly pageErrors: (count: number) => string;
  readonly siteErrors: (count: number) => string;
  readonly unparsedPage: string;
  readonly notFound: string;
  readonly notFoundBody: (path: string) => string;
  readonly loadFailed: (message: string) => string;
}

export const strings: Strings = {
  skip: "Skip to content",
  loading: "Typesetting…",
  openNav: "Open navigation",
  navLabel: "Site navigation",
  tocLabel: "On this page",
  pageOf: (index, total) => `Page ${index} of ${total}`,
  prev: "Previous",
  next: "Next",
  pagerLabel: "Pages",
  copy: "Copy",
  copied: "Copied",
  copyFallback: "Press ⌘C",
  copyCode: "Copy code",
  copyCited: "Copy the cited code",
  copiedStatus: "Copied to the clipboard",
  copyFailedStatus: "Could not write to the clipboard; select the text and copy it",
  codeLanguages: { sh: "Terminal", bash: "Terminal", text: "Output" },
  table: "Table",
  taskDone: "Done",
  taskTodo: "Not done",
  headingAnchor: "Link to this section",
  alerts: {
    note: "Note",
    tip: "Tip",
    important: "Invariant",
    warning: "Warning",
    caution: "Caution",
  },
  wholeFile: "Whole file",
  lines: (from, to) => (from === to ? `L${from}` : `L${from}–${to}`),
  noteCount: (count) => `${count} ${count === 1 ? "note" : "notes"}`,
  noteLabel: (index, range) => `Note ${index}: ${range}`,
  itemCount: (count) => `${count} ${count === 1 ? "item" : "items"}`,
  itemsRemoved: (count, removed) =>
    `${count} ${count === 1 ? "item" : "items"} · ${removed} removed`,
  removedItem: "(removed)",
  diffAdded: "Added file",
  diffDeleted: "Deleted file",
  diffStat: (removed, added) => `${removed} removed, ${added} added`,
  diffRemovedLine: "removed:",
  diffAddedLine: "added:",
  diffFold: (count) => `Show ${count} unchanged ${count === 1 ? "line" : "lines"}`,
  diagramFailed: "This diagram could not be rendered",
  diagramSource: "Show the source",
  fileGone: (path) => `${path} was not found`,
  fileGoneDetail: "The page cites a file that could not be found.",
  fileUnreadable: (ref) => `Could not load ${ref}`,
  pane: "Source",
  paneLabel: (path, range) => `Source: ${path} ${range}`,
  paneEmpty: "Scroll the text; the cited code appears here.",
  paneSource: (path) => `${path} source`,
  paneGone: "Not found",
  modes: { follow: "Following", pinned: "Pinned", preview: "Preview" },
  resumeFollow: "Resume following",
  citeCount: (index, total) => `Citation ${index} / ${total}`,
  citeTotal: (total) => `${total} ${total === 1 ? "citation" : "citations"}`,
  prevCite: "Previous citation ([)",
  nextCite: "Next citation (])",
  openSheet: "Open the source panel",
  closeSheet: "Close the source panel",
  backHome: "Back to the first page",
  noPages: "No pages yet",
  pageErrors: (count) => `${count} ${count === 1 ? "error" : "errors"} on this page`,
  siteErrors: (count) => `${count} ${count === 1 ? "error" : "errors"} in the doc root`,
  unparsedPage: "This page could not be parsed. Fix the errors below; the viewer reloads on save.",
  notFound: "Not found",
  notFoundBody: (path) => `Nothing lives at ${path}.`,
  loadFailed: (message) => `Failed to load: ${message}`,
};
