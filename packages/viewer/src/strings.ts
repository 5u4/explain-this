import type { AlertKind } from "@explain/contract/page";
import type { SourceState } from "./api.ts";

export interface Strings {
  readonly skip: string;
  readonly loading: string;
  readonly brandMark: string;
  readonly openNav: string;
  readonly navLabel: string;
  readonly tocLabel: string;
  readonly language: string;
  readonly search: string;
  readonly searchSite: string;
  readonly searchPlaceholder: string;
  readonly searchIndexing: string;
  readonly searchEmpty: (query: string) => string;
  readonly pageOf: (index: number, total: number) => string;
  readonly fresh: string;
  readonly stale: string;
  readonly freshTitle: (count: number) => string;
  readonly staleTitle: (paths: string) => string;
  readonly freshNote: (count: number) => string;
  readonly staleNote: string;
  readonly staleMixedNote: string;
  readonly unhashedNote: string;
  readonly listSeparator: string;
  readonly sources: string;
  readonly sourcesIntro: (repos: string, count: number) => string;
  readonly sourceColumns: {
    readonly file: string;
    readonly hash: string;
    readonly state: string;
  };
  readonly sourceStates: Readonly<Record<SourceState, string>>;
  readonly currentHash: (hash: string) => string;
  readonly refProblems: string;
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
  readonly widgetSources: string;
  readonly widgetFailed: (name: string) => string;
  readonly fileGone: (path: string) => string;
  readonly fileGoneDetail: string;
  readonly fileUnreadable: (ref: string) => string;
  readonly pane: string;
  readonly paneLabel: (path: string, range: string) => string;
  readonly paneEmpty: string;
  readonly paneSource: (path: string) => string;
  readonly paneChanged: string;
  readonly paneGone: string;
  readonly recordedHash: string;
  readonly modes: { readonly follow: string; readonly pinned: string; readonly preview: string };
  readonly resumeFollow: string;
  readonly citeCount: (index: number, total: number) => string;
  readonly citeTotal: (total: number) => string;
  readonly prevCite: string;
  readonly nextCite: string;
  readonly openSheet: string;
  readonly closeSheet: string;
  readonly missingPage: (locale: string) => string;
  readonly missingPageBody: (file: string) => string;
  readonly backHome: string;
  readonly noPages: string;
  readonly pageErrors: (count: number) => string;
  readonly siteErrors: (count: number) => string;
  readonly unparsedPage: string;
  readonly notFound: string;
  readonly notFoundBody: (path: string) => string;
  readonly sourceKicker: string;
  readonly sourceLines: (count: number) => string;
  readonly citedBy: string;
  readonly citedByNone: string;
  readonly loadFailed: (message: string) => string;
}

const en: Strings = {
  skip: "Skip to content",
  loading: "Typesetting…",
  brandMark: "注",
  openNav: "Open navigation",
  navLabel: "Site navigation",
  tocLabel: "On this page",
  language: "Language",
  search: "Search",
  searchSite: "Search this site",
  searchPlaceholder: "Search pages, functions, files…",
  searchIndexing: "Building the index…",
  searchEmpty: (query) => `Nothing matches “${query}”.`,
  pageOf: (index, total) => `Page ${index} of ${total}`,
  fresh: "Fresh",
  stale: "Stale",
  freshTitle: (count) =>
    `The git hash-object of all ${count} source files matches the recorded hash`,
  staleTitle: (paths) => `${paths} no longer match the hash recorded when this page was written`,
  freshNote: (count) =>
    `Written against ${count} source ${count === 1 ? "file" : "files"}; every hash matches.`,
  staleNote: "changed in the repo; this page was written against an older version.",
  staleMixedNote: "; this page was written against an older version.",
  unhashedNote: "This page has no sources file yet; run explain freshness sync.",
  listSeparator: ", ",
  sources: "Sources",
  sourcesIntro: (repos, count) =>
    `This page cites ${count} ${count === 1 ? "file" : "files"} in ${repos}. Hashes are the git hash-object recorded by explain freshness sync, compared with the files on disk now.`,
  sourceColumns: { file: "File", hash: "Hash", state: "State" },
  sourceStates: {
    fresh: "Matches",
    changed: "Changed",
    missing: "Gone",
    "not-recorded": "Not hashed",
    "not-cited": "No longer cited",
  },
  currentHash: (hash) => `Now ${hash}`,
  refProblems: "Citation problems",
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
  widgetSources: "Sources",
  widgetFailed: (name) => `The widget ${name} failed to load`,
  fileGone: (path) => `${path} no longer exists in the repo`,
  fileGoneDetail:
    "The page was written against a version of the file that has since been deleted or moved.",
  fileUnreadable: (ref) => `Could not load ${ref}`,
  pane: "Source",
  paneLabel: (path, range) => `Source: ${path} ${range}`,
  paneEmpty: "Scroll the text; the cited code appears here.",
  paneSource: (path) => `${path} source`,
  paneChanged: "Changed",
  paneGone: "Gone",
  recordedHash: "git hash-object recorded by explain freshness sync",
  modes: { follow: "Following", pinned: "Pinned", preview: "Preview" },
  resumeFollow: "Resume following",
  citeCount: (index, total) => `Citation ${index} / ${total}`,
  citeTotal: (total) => `${total} ${total === 1 ? "citation" : "citations"}`,
  prevCite: "Previous citation ([)",
  nextCite: "Next citation (])",
  openSheet: "Open the source panel",
  closeSheet: "Close the source panel",
  missingPage: (locale) => `This page is not written in ${locale} yet`,
  missingPageBody: (file) => `The nav lists it, but ${file} does not exist.`,
  backHome: "Back to the first page",
  noPages: "No pages yet",
  pageErrors: (count) => `${count} ${count === 1 ? "error" : "errors"} on this page`,
  siteErrors: (count) => `${count} ${count === 1 ? "error" : "errors"} in the doc root`,
  unparsedPage: "This page could not be parsed. Fix the errors below; the viewer reloads on save.",
  notFound: "Not found",
  notFoundBody: (path) => `Nothing lives at ${path}.`,
  sourceKicker: "Source",
  sourceLines: (count) => `${count} ${count === 1 ? "line" : "lines"}`,
  citedBy: "Cited by",
  citedByNone: "No page cites this file.",
  loadFailed: (message) => `Failed to load: ${message}`,
};

const zhCN: Strings = {
  skip: "跳到正文",
  loading: "正在排版…",
  brandMark: "注",
  openNav: "打开目录",
  navLabel: "站点导航",
  tocLabel: "本页目录",
  language: "语言",
  search: "搜索",
  searchSite: "搜索本维基",
  searchPlaceholder: "搜索页面、函数、文件…",
  searchIndexing: "正在建立索引…",
  searchEmpty: (query) => `没有找到“${query}”。`,
  pageOf: (index, total) => `第 ${index} 页，共 ${total} 页`,
  fresh: "最新",
  stale: "已过期",
  freshTitle: (count) => `${count} 个源文件的 git hash-object 都与生成时记录的一致`,
  staleTitle: (paths) => `${paths} 的 git hash-object 与生成时记录的不一致`,
  freshNote: (count) => `依据 ${count} 个源文件，哈希逐一核对一致。`,
  staleNote: "在仓库中已改动，本页依据的是旧版本。",
  staleMixedNote: "；本页依据的是旧版本。",
  unhashedNote: "本页还没有来源文件，请运行 explain freshness sync。",
  listSeparator: "、",
  sources: "来源",
  sourcesIntro: (repos, count) =>
    `本页引用了仓库 ${repos} 中的 ${count} 个文件。哈希为 explain freshness sync 记录的 git hash-object，与磁盘上的当前文件逐一比对。`,
  sourceColumns: { file: "文件", hash: "哈希", state: "状态" },
  sourceStates: {
    fresh: "一致",
    changed: "已改动",
    missing: "已删除",
    "not-recorded": "未哈希",
    "not-cited": "不再引用",
  },
  currentHash: (hash) => `当前 ${hash}`,
  refProblems: "引用问题",
  prev: "上一页",
  next: "下一页",
  pagerLabel: "翻页",
  copy: "复制",
  copied: "已复制",
  copyFallback: "按 ⌘C",
  copyCode: "复制代码",
  copyCited: "复制引用的代码",
  copiedStatus: "已复制到剪贴板",
  copyFailedStatus: "无法写入剪贴板，请手动选中复制",
  codeLanguages: { sh: "终端", bash: "终端", text: "输出" },
  table: "表格",
  taskDone: "已完成",
  taskTodo: "未完成",
  headingAnchor: "链接到本节",
  alerts: { note: "说明", tip: "提示", important: "不变量", warning: "注意", caution: "警告" },
  wholeFile: "全文",
  lines: (from, to) => (from === to ? `L${from}` : `L${from}–${to}`),
  noteCount: (count) => `${count} 条注释`,
  noteLabel: (index, range) => `注释 ${index}：${range}`,
  itemCount: (count) => `${count} 条`,
  itemsRemoved: (count, removed) => `${count} 条 · 少了 ${removed} 条`,
  removedItem: "（已移除）",
  diffAdded: "新增文件",
  diffDeleted: "删除文件",
  diffStat: (removed, added) => `删除 ${removed} 行，新增 ${added} 行`,
  diffRemovedLine: "删除：",
  diffAddedLine: "新增：",
  diffFold: (count) => `展开 ${count} 行未改动的代码`,
  diagramFailed: "这张图无法渲染",
  diagramSource: "查看源码",
  widgetSources: "来源",
  widgetFailed: (name) => `组件 ${name} 无法加载`,
  fileGone: (path) => `${path} 已不在仓库中`,
  fileGoneDetail: "本页依据的版本之后，这个文件被删除或移动了。",
  fileUnreadable: (ref) => `无法载入 ${ref}`,
  pane: "源码",
  paneLabel: (path, range) => `源码对读：${path} ${range}`,
  paneEmpty: "滚动正文，引用的代码会出现在这里。",
  paneSource: (path) => `${path} 源码`,
  paneChanged: "已改动",
  paneGone: "已删除",
  recordedHash: "explain freshness sync 记录的 git hash-object",
  modes: { follow: "跟随中", pinned: "已固定", preview: "预览" },
  resumeFollow: "恢复跟随",
  citeCount: (index, total) => `引用 ${index} / ${total}`,
  citeTotal: (total) => `${total} 处引用`,
  prevCite: "上一处引用（[）",
  nextCite: "下一处引用（]）",
  openSheet: "展开源码面板",
  closeSheet: "收起源码面板",
  missingPage: (locale) => `这一页还没有 ${locale} 版本`,
  missingPageBody: (file) => `导航列出了这一页，但 ${file} 不存在。`,
  backHome: "回到首页",
  noPages: "还没有页面",
  pageErrors: (count) => `本页有 ${count} 处错误`,
  siteErrors: (count) => `文档根有 ${count} 处错误`,
  unparsedPage: "本页无法解析。修正下列错误后保存，页面会自动刷新。",
  notFound: "找不到这一页",
  notFoundBody: (path) => `${path} 下没有内容。`,
  sourceKicker: "源码",
  sourceLines: (count) => `${count} 行`,
  citedBy: "引用它的页面",
  citedByNone: "没有页面引用这个文件。",
  loadFailed: (message) => `载入失败：${message}`,
};

const byLanguage: Readonly<Record<string, Strings>> = { en, zh: zhCN };

export const stringsFor = (locale: string): Strings =>
  byLanguage[locale.split("-")[0]?.toLowerCase() ?? ""] ?? en;
