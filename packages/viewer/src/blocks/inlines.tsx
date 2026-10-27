import type { Inline } from "@explain/contract/page";
import type { ReactNode } from "react";
import { formatRef } from "../ref.ts";
import { pageHref } from "../router.ts";

export function Inlines({ inlines }: { readonly inlines: ReadonlyArray<Inline> }): ReactNode {
  return inlines.map((inline, index) => <InlineView key={index} inline={inline} />);
}

function InlineView({ inline }: { readonly inline: Inline }): ReactNode {
  switch (inline.type) {
    case "text":
      return inline.value;
    case "strong":
      return (
        <strong>
          <Inlines inlines={inline.children} />
        </strong>
      );
    case "emphasis":
      return (
        <em>
          <Inlines inlines={inline.children} />
        </em>
      );
    case "delete":
      return (
        <del>
          <Inlines inlines={inline.children} />
        </del>
      );
    case "inlineCode":
      return <code>{inline.value}</code>;
    case "break":
      return <br />;
    case "link":
      return (
        <a className="ext" href={inline.href} target="_blank" rel="noopener noreferrer">
          <Inlines inlines={inline.children} />
        </a>
      );
    case "citation":
      return (
        <a
          className="cite"
          href="#"
          data-ref={formatRef(inline.ref)}
          data-kind={inline.ref.ranges.length === 0 ? "file" : "cite"}
        >
          <Inlines inlines={inline.children} />
        </a>
      );
    case "pageLink":
      return (
        <a href={pageHref(inline.page, inline.anchor)}>
          <Inlines inlines={inline.children} />
        </a>
      );
    default:
      return inline satisfies never;
  }
}

export const inlineText = (inlines: ReadonlyArray<Inline>): string =>
  inlines
    .map((inline) =>
      inline.type === "text" || inline.type === "inlineCode"
        ? inline.value
        : inline.type === "break"
          ? " "
          : inlineText(inline.children),
    )
    .join("");
