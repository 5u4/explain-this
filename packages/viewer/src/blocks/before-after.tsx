import type { Block, Inline, ListItem } from "@explain/contract/page";
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import { useViewer } from "../context.ts";
import { type BlockOf, BlockView, trimStart } from "./blocks.tsx";
import { Inlines, inlineText } from "./inlines.tsx";

const itemInlines = (item: ListItem): ReadonlyArray<Inline> => {
  const first = item.children[0];
  return first?.type === "paragraph" ? first.children : [];
};

const sideItems = (blocks: ReadonlyArray<Block>): ReadonlyArray<ListItem> =>
  blocks.flatMap((block) => (block.type === "list" ? block.items : []));
export function BeforeAfterView({ block }: { readonly block: BlockOf<"beforeAfter"> }): ReactNode {
  const { strings } = useViewer();
  const root = useRef<HTMLDivElement>(null);
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    if (root.current === null) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setDrawn(true);
        observer.disconnect();
      },
      { rootMargin: "0px 0px -30% 0px" },
    );
    observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  const normalize = (item: ListItem) => inlineText(itemInlines(item)).replace(/\s+/g, " ").trim();
  const remaining: Record<string, number> = {};
  for (const item of sideItems(block.after.children)) {
    const key = normalize(item);
    remaining[key] = (remaining[key] ?? 0) + 1;
  }
  const struck = new Set<ListItem>();
  for (const item of sideItems(block.before.children)) {
    const key = normalize(item);
    const left = remaining[key] ?? 0;
    if (left > 0) remaining[key] = left - 1;
    else struck.add(item);
  }
  const side = (name: "before" | "after", count: string | null) => {
    let order = 0;
    const labeled = block[name];
    return (
      <section className={`ba-side ba-${name}`}>
        <header className="ba-head">
          <span className="ba-label">{labeled.label}</span>
          {count === null ? null : <span className="ba-count">{count}</span>}
        </header>
        <div className="ba-body">
          {labeled.children.map((child, index) =>
            child.type === "list" ? (
              <ol key={index}>
                {child.items.map((item, itemIndex) => {
                  const removed = struck.has(item);
                  const [head, ...rest] = itemInlines(item);
                  const role = head?.type === "inlineCode" ? head.value : null;
                  return (
                    <li
                      key={itemIndex}
                      className={removed ? "msg struck" : "msg"}
                      style={removed ? ({ "--i": order++ } as CSSProperties) : undefined}
                    >
                      {role !== null && <span className={`role role-${role}`}>{role}</span>}
                      <span className="msg-text">
                        <Inlines inlines={role === null ? itemInlines(item) : trimStart(rest)} />
                      </span>
                      {removed && <span className="sr">{strings.removedItem}</span>}
                    </li>
                  );
                })}
              </ol>
            ) : (
              <BlockView key={index} block={child} lede={false} />
            ),
          )}
        </div>
      </section>
    );
  };
  const beforeCount = sideItems(block.before.children).length;
  const afterCount = sideItems(block.after.children).length;
  const counted = beforeCount + afterCount > 0;
  return (
    <div className={drawn ? "ba drawn" : "ba"} ref={root}>
      {side("before", counted ? strings.itemCount(beforeCount) : null)}
      {side("after", counted ? strings.itemsRemoved(afterCount, struck.size) : null)}
    </div>
  );
}
