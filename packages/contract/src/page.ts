import type { Ref } from "./citation.ts";

export interface Position {
  readonly line: number;
  readonly column: number;
}

export interface Diagnostic extends Position {
  readonly message: string;
}

export type Inline =
  | { readonly type: "text"; readonly value: string }
  | { readonly type: "strong"; readonly children: ReadonlyArray<Inline> }
  | { readonly type: "emphasis"; readonly children: ReadonlyArray<Inline> }
  | { readonly type: "delete"; readonly children: ReadonlyArray<Inline> }
  | { readonly type: "inlineCode"; readonly value: string }
  | { readonly type: "break" }
  | { readonly type: "link"; readonly href: string; readonly children: ReadonlyArray<Inline> }
  | { readonly type: "citation"; readonly ref: Ref; readonly children: ReadonlyArray<Inline> }
  | {
      readonly type: "pageLink";
      readonly page: string;
      readonly anchor: string | null;
      readonly children: ReadonlyArray<Inline>;
    };

export type AlertKind = "note" | "tip" | "important" | "warning" | "caution";

export type HeadingDepth = 2 | 3 | 4;

export type TableAlign = "left" | "right" | "center" | null;

export interface ListItem {
  readonly checked: boolean | null;
  readonly children: ReadonlyArray<Block>;
}

export interface TreeItem {
  readonly label: ReadonlyArray<Inline>;
  readonly children: ReadonlyArray<TreeItem>;
}

export interface LabeledBlocks {
  readonly label: string;
  readonly children: ReadonlyArray<Block>;
}

export interface SourceNote {
  readonly from: number;
  readonly to: number;
  readonly children: ReadonlyArray<Inline>;
}

export type DiffChange =
  | { readonly kind: "modified"; readonly before: Ref; readonly after: Ref }
  | { readonly kind: "added"; readonly after: Ref }
  | { readonly kind: "deleted"; readonly before: Ref };

export type Block =
  | {
      readonly type: "heading";
      readonly depth: HeadingDepth;
      readonly id: string;
      readonly children: ReadonlyArray<Inline>;
    }
  | { readonly type: "paragraph"; readonly children: ReadonlyArray<Inline> }
  | {
      readonly type: "list";
      readonly ordered: boolean;
      readonly start: number | null;
      readonly items: ReadonlyArray<ListItem>;
    }
  | {
      readonly type: "table";
      readonly align: ReadonlyArray<TableAlign>;
      readonly head: ReadonlyArray<ReadonlyArray<Inline>>;
      readonly rows: ReadonlyArray<ReadonlyArray<ReadonlyArray<Inline>>>;
    }
  | { readonly type: "alert"; readonly kind: AlertKind; readonly children: ReadonlyArray<Block> }
  | { readonly type: "quote"; readonly children: ReadonlyArray<Block> }
  | { readonly type: "code"; readonly lang: string | null; readonly value: string }
  | { readonly type: "excerpt"; readonly lang: string | null; readonly ref: Ref }
  | { readonly type: "mermaid"; readonly value: string }
  | { readonly type: "thematicBreak" }
  | {
      readonly type: "details";
      readonly summary: ReadonlyArray<Inline>;
      readonly children: ReadonlyArray<Block>;
    }
  | { readonly type: "tree"; readonly open: number | null; readonly items: ReadonlyArray<TreeItem> }
  | { readonly type: "tabs"; readonly tabs: ReadonlyArray<LabeledBlocks> }
  | { readonly type: "beforeAfter"; readonly before: LabeledBlocks; readonly after: LabeledBlocks }
  | {
      readonly type: "annotatedSource";
      readonly ref: Ref;
      readonly notes: ReadonlyArray<SourceNote>;
    }
  | { readonly type: "diff"; readonly change: DiffChange }
  | {
      readonly type: "widget";
      readonly name: string;
      readonly title: string;
      readonly sources: ReadonlyArray<Ref>;
      readonly props: Readonly<Record<string, string>>;
      readonly children: ReadonlyArray<Inline>;
    };

export interface TocEntry {
  readonly depth: HeadingDepth;
  readonly id: string;
  readonly text: string;
}

export interface Page {
  readonly title: ReadonlyArray<Inline>;
  readonly blocks: ReadonlyArray<Block>;
  readonly toc: ReadonlyArray<TocEntry>;
  readonly refs: ReadonlyArray<{ readonly ref: Ref; readonly at: Position }>;
  readonly pageLinks: ReadonlyArray<{
    readonly page: string;
    readonly anchor: string | null;
    readonly at: Position;
  }>;
  readonly widgets: ReadonlyArray<{ readonly name: string; readonly at: Position }>;
}

export const plainText = (inlines: ReadonlyArray<Inline>): string =>
  inlines
    .map((inline) => {
      switch (inline.type) {
        case "text":
        case "inlineCode":
          return inline.value;
        case "break":
          return " ";
        default:
          return plainText(inline.children);
      }
    })
    .join("");
