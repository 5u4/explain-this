import * as Result from "effect/Result";
import { slug } from "github-slugger";
import type {
  Blockquote,
  Code,
  Heading,
  List,
  Nodes,
  Paragraph,
  PhrasingContent,
  Root,
  RootContent,
  Table,
} from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import {
  type MdxJsxFlowElement,
  type MdxJsxTextElement,
  mdxJsxFromMarkdown,
} from "mdast-util-mdx-jsx";
import { gfm } from "micromark-extension-gfm";
import { mdxJsx } from "micromark-extension-mdx-jsx";
import { parseRef, type Ref } from "./citation.ts";
import { pageIdPattern } from "./config.ts";
import {
  type AlertKind,
  type Block,
  type Diagnostic,
  type Inline,
  type LabeledBlocks,
  type ListItem,
  type Page,
  type Position,
  plainText,
  type SourceNote,
  type TocEntry,
  type TreeItem,
} from "./page.ts";

export interface ParseResult {
  readonly page: Page | undefined;
  readonly errors: ReadonlyArray<Diagnostic>;
}

type JsxElement = MdxJsxFlowElement | MdxJsxTextElement;

type AttributeSpec = Readonly<Record<string, "required" | "optional">>;

const idPattern = /^[a-z0-9][a-z0-9-]*$/;
const explicitIdPattern = /[ \t]*\{#([^}]*)\}[ \t]*$/;
const alertMarkerPattern = /^\[!([A-Za-z]+)\]/;
const alertKinds: Readonly<Record<string, AlertKind>> = {
  NOTE: "note",
  TIP: "tip",
  IMPORTANT: "important",
  WARNING: "warning",
  CAUTION: "caution",
};
const pageLinkPattern = /^\.\/([^/#]+)\.md(?:#(.*))?$/;
const schemePattern = /^([a-zA-Z][a-zA-Z0-9+.-]*):/;
const externalSchemes: Readonly<Record<string, true>> = { http: true, https: true, mailto: true };
const notePattern = /^([1-9][0-9]*)(?:-([1-9][0-9]*))?$/;
const widgetNamePattern = /^[a-z0-9][a-z0-9-]*$/;
const blankLinePattern = /\n[ \t>]*\n/;
const nestedOnlyTags: Readonly<Record<string, string>> = {
  Tab: "Tabs",
  Before: "BeforeAfter",
  After: "BeforeAfter",
  Note: "AnnotatedSource",
  summary: "details",
};

const parseMarkdown = (source: string): Root =>
  fromMarkdown(source, {
    extensions: [
      gfm(),
      mdxJsx(),
      { disable: { null: ["htmlFlow", "htmlText", "autolink", "codeIndented"] } },
    ],
    mdastExtensions: [gfmFromMarkdown(), mdxJsxFromMarkdown()],
  });

const positionOf = (node: Pick<Nodes, "position">): Position => ({
  line: node.position?.start.line ?? 1,
  column: node.position?.start.column ?? 1,
});

const isWhitespaceText = (node: PhrasingContent): boolean =>
  node.type === "text" && node.value.trim() === "";

const describeNode = (node: Nodes): string =>
  node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement"
    ? `<${node.name ?? ""}>`
    : node.type;

export const parsePage = (source: string, pageId: string): ParseResult => {
  const errors: Array<Diagnostic> = [];
  const report = (at: Position, message: string): undefined => {
    errors.push({ line: at.line, column: at.column, message });
    return undefined;
  };

  if (/^---\r?\n/.test(source)) {
    return {
      page: undefined,
      errors: [{ line: 1, column: 1, message: "frontmatter is not allowed" }],
    };
  }

  let root: Root;
  try {
    root = parseMarkdown(source);
  } catch (error) {
    const place = error as { line?: number | null; column?: number | null; reason?: string };
    return {
      page: undefined,
      errors: [
        {
          line: place.line ?? 1,
          column: place.column ?? 1,
          message: place.reason ?? String(error),
        },
      ],
    };
  }

  const toc: Array<TocEntry> = [];
  const usedIds = new Set<string>();
  const refs: Array<{ ref: Ref; at: Position }> = [];
  const pageLinks: Array<{ page: string; anchor: string | null; at: Position }> = [];
  const widgets: Array<{ name: string; at: Position }> = [];

  const citation = (text: string, at: Position): Ref | undefined => {
    const parsed = parseRef(text);
    if (Result.isFailure(parsed)) return report(at, parsed.failure);
    refs.push({ ref: parsed.success, at });
    return parsed.success;
  };

  const requireBlankLines = (
    element: MdxJsxFlowElement,
    children: ReadonlyArray<Nodes>,
    after: Nodes = element,
  ): void => {
    const start = after === element ? after.position?.start.offset : after.position?.end.offset;
    const end = element.position?.end.offset;
    const firstStart = children[0]?.position?.start.offset;
    const lastEnd = children.at(-1)?.position?.end.offset;
    if (start === undefined || end === undefined) return;
    if (firstStart === undefined || lastEnd === undefined) return;
    if (
      !blankLinePattern.test(source.slice(start, firstStart)) ||
      !blankLinePattern.test(source.slice(lastEnd, end))
    ) {
      report(
        positionOf(element),
        `<${element.name}> needs a blank line between the tag and its Markdown children`,
      );
    }
  };

  const attributes = (
    element: JsxElement,
    spec: AttributeSpec,
    rest: boolean,
  ): Record<string, string> | undefined => {
    const at = positionOf(element);
    const values: Record<string, string> = {};
    const errorCount = errors.length;
    for (const attribute of element.attributes) {
      if (attribute.type === "mdxJsxExpressionAttribute") {
        report(at, `<${element.name}> attributes must be string literals`);
        continue;
      }
      const attributeAt = attribute.position === undefined ? at : positionOf(attribute);
      if (typeof attribute.value !== "string") {
        report(attributeAt, `attribute "${attribute.name}" must be a string literal`);
        continue;
      }
      if (!rest && !Object.hasOwn(spec, attribute.name)) {
        report(attributeAt, `<${element.name}> has no attribute "${attribute.name}"`);
        continue;
      }
      if (Object.hasOwn(values, attribute.name)) {
        report(attributeAt, `attribute "${attribute.name}" is repeated`);
        continue;
      }
      values[attribute.name] = attribute.value;
    }
    for (const [name, presence] of Object.entries(spec)) {
      if (presence === "required" && !Object.hasOwn(values, name)) {
        report(at, `<${element.name}> requires attribute "${name}"`);
      }
    }
    return errors.length === errorCount ? values : undefined;
  };

  const link = (url: string, children: ReadonlyArray<Inline>, at: Position): Inline | undefined => {
    if (url.startsWith("#")) {
      const anchor = url.slice(1);
      if (anchor === "") return report(at, "link anchor is empty");
      pageLinks.push({ page: pageId, anchor, at });
      return { type: "pageLink", page: pageId, anchor, children };
    }
    if (url.startsWith("./")) {
      const match = pageLinkPattern.exec(url);
      const page = match?.[1];
      if (match === null || page === undefined || !pageIdPattern.test(page)) {
        return report(at, `page link "${url}" must be ./<page>.md or ./<page>.md#<anchor>`);
      }
      const anchor = match[2] ?? null;
      if (anchor === "") return report(at, `page link "${url}" has an empty anchor`);
      pageLinks.push({ page, anchor, at });
      return { type: "pageLink", page, anchor, children };
    }
    const scheme = schemePattern.exec(url)?.[1];
    if (scheme === undefined) {
      return report(
        at,
        `link target "${url}" must be a citation, ./<page>.md, #<anchor>, or an http, https, or mailto URL`,
      );
    }
    if (Object.hasOwn(externalSchemes, scheme)) return { type: "link", href: url, children };
    const ref = citation(url, at);
    return ref === undefined ? undefined : { type: "citation", ref, children };
  };

  const inlines = (nodes: ReadonlyArray<PhrasingContent>): Array<Inline> =>
    nodes.flatMap((node) => {
      const converted = inline(node);
      return converted === undefined ? [] : [converted];
    });

  const inline = (node: PhrasingContent): Inline | undefined => {
    const at = positionOf(node);
    switch (node.type) {
      case "text":
        return { type: "text", value: node.value };
      case "strong":
      case "emphasis":
      case "delete":
        return { type: node.type, children: inlines(node.children) };
      case "inlineCode":
        return { type: "inlineCode", value: node.value };
      case "break":
        return { type: "break" };
      case "link":
        return link(node.url, inlines(node.children), at);
      case "mdxJsxTextElement":
        return report(at, `<${node.name ?? ""}> must stand on its own lines, not inside text`);
      default:
        return report(at, `${describeNode(node)} is not supported`);
    }
  };

  const heading = (node: Heading): Block | undefined => {
    const at = positionOf(node);
    if (node.depth === 1) return report(at, "a page has exactly one # heading, its first line");
    const depth = node.depth;
    if (depth !== 2 && depth !== 3 && depth !== 4) {
      return report(at, "headings deeper than #### are not supported");
    }
    const children = [...node.children];
    const last = children.at(-1);
    let explicitId: string | undefined;
    if (last?.type === "text") {
      const match = explicitIdPattern.exec(last.value);
      if (match !== null) {
        explicitId = match[1] ?? "";
        const value = last.value.slice(0, match.index);
        if (value === "") children.pop();
        else children[children.length - 1] = { ...last, value };
      }
    }
    const content = inlines(children);
    const text = plainText(content).trim();
    if (text === "") return report(at, "heading has no text");
    let id: string;
    if (explicitId !== undefined) {
      if (!idPattern.test(explicitId)) {
        return report(at, `heading id "${explicitId}" must match ${idPattern.source}`);
      }
      if (usedIds.has(explicitId)) return report(at, `heading id "${explicitId}" is used twice`);
      id = explicitId;
    } else {
      const base = slug(text);
      if (base === "") return report(at, "heading text yields an empty id; add {#id}");
      id = base;
      for (let suffix = 1; usedIds.has(id); suffix++) id = `${base}-${suffix}`;
    }
    usedIds.add(id);
    toc.push({ depth, id, text });
    return { type: "heading", depth, id, children: content };
  };

  const list = (node: List): Block => ({
    type: "list",
    ordered: node.ordered === true,
    start: node.ordered === true ? (node.start ?? 1) : null,
    items: node.children.map(
      (item): ListItem => ({ checked: item.checked ?? null, children: blocks(item.children) }),
    ),
  });

  const table = (node: Table): Block => {
    const rows = node.children.map((row) => row.children.map((cell) => inlines(cell.children)));
    return {
      type: "table",
      align: (node.align ?? []).map((align) => align ?? null),
      head: rows[0] ?? [],
      rows: rows.slice(1),
    };
  };

  const blockquote = (node: Blockquote): Block | undefined => {
    const [first, ...rest] = node.children;
    const marker = first?.type === "paragraph" ? first.children[0] : undefined;
    const match = marker?.type === "text" ? alertMarkerPattern.exec(marker.value) : null;
    if (first?.type !== "paragraph" || marker?.type !== "text" || match === null) {
      return { type: "quote", children: blocks(node.children) };
    }
    const at = positionOf(first);
    const kind = alertKinds[match[1] ?? ""];
    if (kind === undefined) {
      return report(
        at,
        `unknown alert "${match[0]}"; use NOTE, TIP, IMPORTANT, WARNING, or CAUTION`,
      );
    }
    const remainder = marker.value.slice(match[0].length);
    if (remainder !== "" && !remainder.startsWith("\n")) {
      return report(at, `alert marker ${match[0]} must stand alone on its line`);
    }
    const tail = remainder.slice(1);
    const paragraphChildren: Array<PhrasingContent> = [
      ...(tail === "" ? [] : [{ ...marker, value: tail }]),
      ...first.children.slice(1),
    ];
    const lead: Array<RootContent> =
      paragraphChildren.length === 0 ? [] : [{ ...first, children: paragraphChildren }];
    return { type: "alert", kind, children: blocks([...lead, ...rest]) };
  };

  const mermaidProblems = (node: Code): void => {
    const lines = node.value.split("\n");
    const header = lines.find((line) => line.trim() !== "" && !line.trim().startsWith("%%"));
    const diagram = header?.trim().split(/\s+/)[0] ?? "";
    const at = positionOf(node);
    if (diagram === "gantt" || diagram === "architecture-beta") {
      report(at, `mermaid ${diagram} diagrams are not supported`);
    }
    lines.forEach((line, index) => {
      const lineAt = { line: at.line + index + 1, column: 1 };
      if (/^\s*click\s/.test(line)) report(lineAt, "mermaid click is not supported");
      if (line.includes("@{")) report(lineAt, "mermaid @{} shapes are not supported");
      if (diagram.startsWith("stateDiagram") && /^\s*note\s/.test(line)) {
        report(lineAt, "mermaid state diagram notes are not supported");
      }
    });
  };

  const code = (node: Code): Block | undefined => {
    const at = positionOf(node);
    const info = [node.lang, node.meta].filter((part) => part != null && part !== "").join(" ");
    const words = info === "" ? [] : info.split(/\s+/);
    const fileWord = words.find((word) => word.startsWith("file="));
    const lang = words[0] === undefined || words[0] === fileWord ? null : words[0];
    const extra = words.filter((word) => word !== fileWord && word !== lang);
    if (extra.length > 0) return report(at, `unsupported code fence info "${extra.join(" ")}"`);
    if (fileWord === undefined) {
      if (lang === "mermaid") {
        mermaidProblems(node);
        return { type: "mermaid", value: node.value };
      }
      return { type: "code", lang, value: node.value };
    }
    if (lang === "mermaid") return report(at, "a mermaid fence cannot be an excerpt");
    if (node.value !== "") return report(at, "an excerpt fence (file=...) must have an empty body");
    const ref = citation(fileWord.slice("file=".length), at);
    return ref === undefined ? undefined : { type: "excerpt", lang, ref };
  };

  const onlyTextElements = (
    paragraph: Paragraph,
    name: string,
  ): Array<MdxJsxTextElement> | undefined => {
    const elements: Array<MdxJsxTextElement> = [];
    for (const child of paragraph.children) {
      if (child.type === "mdxJsxTextElement" && child.name === name) elements.push(child);
      else if (!isWhitespaceText(child)) return undefined;
    }
    return elements;
  };

  const inlineChildren = (element: JsxElement): Array<Inline> | undefined => {
    if (element.type === "mdxJsxTextElement") return inlines(element.children);
    const [only, ...rest] = element.children;
    if (only?.type !== "paragraph" || rest.length > 0) {
      return report(positionOf(element), `<${element.name}> holds one paragraph of text`);
    }
    requireBlankLines(element, [only]);
    return inlines(only.children);
  };

  const tagChildren = (parent: MdxJsxFlowElement, name: string): Array<JsxElement> => {
    const found: Array<JsxElement> = [];
    for (const child of parent.children) {
      if (child.type === "mdxJsxFlowElement" && child.name === name) {
        found.push(child);
        continue;
      }
      const elements = child.type === "paragraph" ? onlyTextElements(child, name) : undefined;
      if (elements === undefined || elements.length === 0) {
        report(
          positionOf(child),
          `<${parent.name}> may only contain <${name}>, not ${describeNode(child)}`,
        );
        continue;
      }
      found.push(...elements);
    }
    return found;
  };

  const labeledBlocks = (element: JsxElement): LabeledBlocks | undefined => {
    const values = attributes(element, { label: "required" }, false);
    if (values === undefined || element.type !== "mdxJsxFlowElement") {
      if (element.type === "mdxJsxTextElement") {
        report(positionOf(element), `<${element.name}> must stand on its own lines`);
      }
      return undefined;
    }
    requireBlankLines(element, element.children);
    return { label: values.label ?? "", children: blocks(element.children) };
  };

  const treeItems = (node: List): Array<TreeItem> =>
    node.children.flatMap((item) => {
      const [label, nested, ...rest] = item.children;
      if (
        item.checked != null ||
        label?.type !== "paragraph" ||
        (nested !== undefined && nested.type !== "list") ||
        rest.length > 0
      ) {
        report(positionOf(item), "a tree item holds one line of text and an optional nested list");
        return [];
      }
      return [
        {
          label: inlines(label.children),
          children: nested?.type === "list" ? treeItems(nested) : [],
        },
      ];
    });

  const tree = (element: MdxJsxFlowElement): Block | undefined => {
    const at = positionOf(element);
    const values = attributes(element, { open: "optional" }, false);
    requireBlankLines(element, element.children);
    const [only, ...rest] = element.children;
    if (only?.type !== "list" || rest.length > 0)
      return report(at, "<Tree> holds exactly one list");
    if (values === undefined) return undefined;
    const open = values.open;
    if (open !== undefined && !/^[0-9]+$/.test(open)) {
      return report(at, `<Tree open="${open}"> must be a whole number`);
    }
    return { type: "tree", open: open === undefined ? null : Number(open), items: treeItems(only) };
  };

  const tabs = (element: MdxJsxFlowElement): Block | undefined => {
    attributes(element, {}, false);
    const found = tagChildren(element, "Tab").flatMap((tab) => labeledBlocks(tab) ?? []);
    if (found.length === 0) return report(positionOf(element), "<Tabs> needs at least one <Tab>");
    return { type: "tabs", tabs: found };
  };

  const beforeAfter = (element: MdxJsxFlowElement): Block | undefined => {
    attributes(element, {}, false);
    const [before, after, ...rest] = element.children;
    if (
      before?.type !== "mdxJsxFlowElement" ||
      before.name !== "Before" ||
      after?.type !== "mdxJsxFlowElement" ||
      after.name !== "After" ||
      rest.length > 0
    ) {
      return report(positionOf(element), "<BeforeAfter> holds one <Before> then one <After>");
    }
    const beforeBlocks = labeledBlocks(before);
    const afterBlocks = labeledBlocks(after);
    if (beforeBlocks === undefined || afterBlocks === undefined) return undefined;
    return { type: "beforeAfter", before: beforeBlocks, after: afterBlocks };
  };

  const annotatedSource = (element: MdxJsxFlowElement): Block | undefined => {
    const at = positionOf(element);
    const values = attributes(element, { file: "required" }, false);
    const noteElements = tagChildren(element, "Note");
    if (values?.file === undefined) return undefined;
    const ref = citation(values.file, at);
    if (ref === undefined) return undefined;
    const [range, ...extraRanges] = ref.ranges;
    if (range === undefined || extraRanges.length > 0) {
      return report(at, `<AnnotatedSource file="${values.file}"> needs exactly one line range`);
    }
    const notes = noteElements.flatMap((note): Array<SourceNote> => {
      const noteAt = positionOf(note);
      const lines = attributes(note, { lines: "required" }, false)?.lines;
      const children = inlineChildren(note);
      if (lines === undefined || children === undefined) return [];
      const match = notePattern.exec(lines);
      if (match === null) {
        report(noteAt, `<Note lines="${lines}"> must be N or N-M`);
        return [];
      }
      const from = Number(match[1]);
      const to = match[2] === undefined ? from : Number(match[2]);
      if (from > to || from < range.from || to > range.to) {
        report(noteAt, `<Note lines="${lines}"> lies outside ${range.from}-${range.to}`);
        return [];
      }
      return [{ from, to, children }];
    });
    return { type: "annotatedSource", ref, notes };
  };

  const diff = (element: MdxJsxFlowElement): Block | undefined => {
    const at = positionOf(element);
    const values = attributes(element, { before: "optional", after: "optional" }, false);
    if (element.children.length > 0) {
      return report(at, '<Diff> takes no children; write <Diff before="…" after="…" />');
    }
    if (values === undefined) return undefined;
    const side = (name: "before" | "after"): Ref | null | undefined => {
      const text = values[name];
      if (text === undefined) return null;
      const ref = citation(text, at);
      if (ref === undefined || ref.ranges.length <= 1) return ref;
      return report(at, `<Diff ${name}="${text}"> takes at most one line range`);
    };
    const before = side("before");
    const after = side("after");
    if (before === undefined || after === undefined) return undefined;
    if (before === null) {
      return after === null
        ? report(at, "<Diff> needs before, after, or both")
        : { type: "diff", change: { kind: "added", after } };
    }
    return {
      type: "diff",
      change: after === null ? { kind: "deleted", before } : { kind: "modified", before, after },
    };
  };

  const widget = (element: MdxJsxFlowElement): Block | undefined => {
    const at = positionOf(element);
    const values = attributes(
      element,
      { name: "required", title: "required", source: "required" },
      true,
    );
    const children = inlineChildren(element);
    if (values === undefined || children === undefined) return undefined;
    const { name = "", title = "", source: sourceList = "", ...props } = values;
    if (!widgetNamePattern.test(name)) {
      return report(at, `widget name "${name}" must match ${widgetNamePattern.source}`);
    }
    const citations = sourceList.trim() === "" ? [] : sourceList.trim().split(/\s+/);
    if (citations.length === 0) return report(at, "<Widget source> lists no citations");
    const sources = citations.flatMap((text) => citation(text, at) ?? []);
    if (sources.length !== citations.length) return undefined;
    widgets.push({ name, at });
    return { type: "widget", name, title, sources, props, children };
  };

  const details = (element: MdxJsxFlowElement): Block | undefined => {
    attributes(element, {}, false);
    const [first, ...rest] = element.children;
    const summaries =
      first?.type === "mdxJsxFlowElement" && first.name === "summary"
        ? [first]
        : first?.type === "paragraph"
          ? onlyTextElements(first, "summary")
          : undefined;
    const [summary, ...extraSummaries] = summaries ?? [];
    if (summary === undefined || extraSummaries.length > 0) {
      return report(positionOf(element), "<details> starts with one <summary>");
    }
    attributes(summary, {}, false);
    const summaryInlines = inlineChildren(summary);
    if (summaryInlines === undefined) return undefined;
    if (first !== undefined) requireBlankLines(element, rest, first);
    return { type: "details", summary: summaryInlines, children: blocks(rest) };
  };

  const jsxBlock = (element: MdxJsxFlowElement): Block | undefined => {
    const at = positionOf(element);
    const name = element.name;
    if (name === null) return report(at, "fragments are not supported");
    switch (name) {
      case "details":
        return details(element);
      case "Tree":
        return tree(element);
      case "Tabs":
        return tabs(element);
      case "BeforeAfter":
        return beforeAfter(element);
      case "AnnotatedSource":
        return annotatedSource(element);
      case "Diff":
        return diff(element);
      case "Widget":
        return widget(element);
    }
    const parent = nestedOnlyTags[name];
    return report(
      at,
      parent === undefined
        ? `unknown tag <${name}>`
        : `<${name}> is only allowed inside <${parent}>`,
    );
  };

  const block = (node: RootContent): Block | undefined => {
    switch (node.type) {
      case "heading":
        return heading(node);
      case "paragraph":
        return { type: "paragraph", children: inlines(node.children) };
      case "list":
        return list(node);
      case "table":
        return table(node);
      case "blockquote":
        return blockquote(node);
      case "code":
        return code(node);
      case "thematicBreak":
        return { type: "thematicBreak" };
      case "mdxJsxFlowElement":
        return jsxBlock(node);
      default:
        return report(positionOf(node), `${describeNode(node)} is not supported`);
    }
  };

  const blocks = (nodes: ReadonlyArray<RootContent>): Array<Block> =>
    nodes.flatMap((node) => block(node) ?? []);

  const [first, ...rest] = root.children;
  if (first?.type !== "heading" || first.depth !== 1) {
    report(
      first === undefined ? { line: 1, column: 1 } : positionOf(first),
      "a page starts with one # title",
    );
  }
  const title = first?.type === "heading" && first.depth === 1 ? inlines(first.children) : [];
  const body = first?.type === "heading" && first.depth === 1 ? rest : root.children;
  const page: Page = { title, blocks: blocks(body), toc, refs, pageLinks, widgets };
  return { page, errors };
};
