import type { MdxJsxFlowElement } from "mdast-util-mdx-jsx";
import type { Block } from "../page.ts";
import { type ParseContext, report } from "./context.ts";
import { beforeAfter, details, tabs, tree } from "./layout-components.ts";
import { htmlNotSupported, isHtmlTag, positionOf } from "./markdown.ts";
import { annotatedSource, diff } from "./source-components.ts";

const nestedOnlyTags: Readonly<Record<string, string>> = {
  Tab: "Tabs",
  Before: "BeforeAfter",
  After: "BeforeAfter",
  Note: "AnnotatedSource",
  summary: "details",
};

export const jsxBlock = (ctx: ParseContext, element: MdxJsxFlowElement): Block | undefined => {
  const at = positionOf(element);
  const name = element.name;
  if (name === null) return report(ctx, at, "fragments are not supported");
  switch (name) {
    case "details":
      return details(ctx, element);
    case "Tree":
      return tree(ctx, element);
    case "Tabs":
      return tabs(ctx, element);
    case "BeforeAfter":
      return beforeAfter(ctx, element);
    case "AnnotatedSource":
      return annotatedSource(ctx, element);
    case "Diff":
      return diff(ctx, element);
  }
  if (isHtmlTag(name)) return report(ctx, at, htmlNotSupported);
  const parent = nestedOnlyTags[name];
  return report(
    ctx,
    at,
    parent === undefined ? `unknown tag <${name}>` : `<${name}> is only allowed inside <${parent}>`,
  );
};
