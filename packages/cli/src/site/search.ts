import { type Block, plainText, type TreeItem } from "@explain/contract/page";
import type { SearchEntry } from "@explain/viewer/api";
import type { ParsedDocPage } from "../doc-root/types.ts";
import { pageTitle } from "./api-bodies.ts";

const treeTexts = (items: ReadonlyArray<TreeItem>): ReadonlyArray<string> =>
  items.flatMap((item) => [plainText(item.label), ...treeTexts(item.children)]);

const blockText = (block: Block): ReadonlyArray<string> => {
  switch (block.type) {
    case "heading":
    case "paragraph":
      return [plainText(block.children)];
    case "list":
      return block.items.flatMap((item) => item.children.flatMap(blockText));
    case "table":
      return [...block.head, ...block.rows.flat()].map(plainText);
    case "alert":
    case "quote":
      return block.children.flatMap(blockText);
    case "details":
      return [plainText(block.summary), ...block.children.flatMap(blockText)];
    case "tree":
      return treeTexts(block.items);
    case "tabs":
      return block.tabs.flatMap((tab) => [tab.label, ...tab.children.flatMap(blockText)]);
    case "beforeAfter":
      return [block.before, block.after].flatMap((side) => [
        side.label,
        ...side.children.flatMap(blockText),
      ]);
    case "annotatedSource":
      return block.notes.map((note) => plainText(note.children));
    case "widget":
      return [block.title, plainText(block.children)];
    case "code":
    case "excerpt":
    case "mermaid":
    case "diff":
    case "thematicBreak":
      return [];
  }
};

export const searchEntries = (page: ParsedDocPage): ReadonlyArray<SearchEntry> => {
  const title = pageTitle(page);
  const sections: Array<{ heading: string; anchor: string | null; blocks: Array<Block> }> = [];
  for (const block of page.page.blocks) {
    if (block.type === "heading") {
      sections.push({ heading: plainText(block.children).trim(), anchor: block.id, blocks: [] });
    } else if (sections.length === 0) {
      sections.push({ heading: title, anchor: null, blocks: [block] });
    } else {
      sections.at(-1)?.blocks.push(block);
    }
  }
  return sections.map((section) => ({
    page: page.id,
    pageTitle: title,
    heading: section.heading,
    anchor: section.anchor,
    text: section.blocks
      .flatMap(blockText)
      .map((text) => text.trim())
      .filter((text) => text !== "")
      .join(" "),
  }));
};
