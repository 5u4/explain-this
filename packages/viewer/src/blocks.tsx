import type { Block, Inline, ListItem, TreeItem } from "@explain/contract/page";
import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { CodeBlock, Excerpt } from "./code.tsx";
import { useViewer } from "./context.ts";
import { alertIcons, icons } from "./icons.tsx";
import { Inlines, inlineText } from "./inlines.tsx";
import { Mermaid } from "./mermaid.tsx";
import { formatRef, rangeLabel } from "./ref.ts";
import { WidgetFrame } from "./widget.tsx";

type BlockOf<Type extends Block["type"]> = Extract<Block, { readonly type: Type }>;

export function Blocks({
  blocks,
  lede = false,
}: {
  readonly blocks: ReadonlyArray<Block>;
  readonly lede?: boolean;
}): ReactNode {
  const ledeIndex = lede ? blocks.findIndex((block) => block.type === "paragraph") : -1;
  return blocks.map((block, index) => (
    <BlockView key={index} block={block} lede={index === ledeIndex} />
  ));
}

function BlockView({ block, lede }: { readonly block: Block; readonly lede: boolean }): ReactNode {
  const { strings } = useViewer();
  switch (block.type) {
    case "heading": {
      const Heading = `h${block.depth}` as const;
      return (
        <Heading id={block.id}>
          <Inlines inlines={block.children} />
          <a className="h-anchor" href={`#${block.id}`} aria-label={strings.headingAnchor}>
            #
          </a>
        </Heading>
      );
    }
    case "paragraph":
      return (
        <p className={lede ? "lede" : undefined}>
          <Inlines inlines={block.children} />
        </p>
      );
    case "list": {
      const tasks = block.items.some((item) => item.checked !== null);
      const items = block.items.map((item, index) =>
        tasks ? (
          <li key={index} className={item.checked === true ? "task is-done" : "task is-todo"}>
            <input
              type="checkbox"
              defaultChecked={item.checked === true}
              disabled
              aria-label={item.checked === true ? strings.taskDone : strings.taskTodo}
            />
            <span className="task-text">
              <ItemBody item={item} />
            </span>
          </li>
        ) : (
          <li key={index}>
            <ItemBody item={item} />
          </li>
        ),
      );
      return block.ordered ? (
        <ol className={tasks ? "tasks" : undefined} start={block.start ?? undefined}>
          {items}
        </ol>
      ) : (
        <ul className={tasks ? "tasks" : undefined}>{items}</ul>
      );
    }
    case "table":
      return (
        <div className="table-wrap" tabIndex={0} role="region" aria-label={strings.table}>
          <table>
            <thead>
              <tr>
                {block.head.map((cell, index) => (
                  <th key={index} style={{ textAlign: block.align[index] ?? undefined }}>
                    <Inlines inlines={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, index) => (
                    <td key={index} style={{ textAlign: block.align[index] ?? undefined }}>
                      <Inlines inlines={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "alert":
      return (
        <aside className={`alert alert-${block.kind}`} aria-label={strings.alerts[block.kind]}>
          <div className="alert-label">
            {alertIcons[block.kind]}
            {strings.alerts[block.kind]}
          </div>
          <Blocks blocks={block.children} />
        </aside>
      );
    case "quote":
      return (
        <blockquote>
          <Blocks blocks={block.children} />
        </blockquote>
      );
    case "code":
      return <CodeBlock lang={block.lang} value={block.value} />;
    case "excerpt":
      return <Excerpt refValue={block.ref} />;
    case "mermaid":
      return <Mermaid source={block.value} />;
    case "thematicBreak":
      return <hr />;
    case "details":
      return (
        <details>
          <summary>
            <Inlines inlines={block.summary} />
          </summary>
          <Blocks blocks={block.children} />
        </details>
      );
    case "tree":
      return <TreeView block={block} />;
    case "tabs":
      return <TabsView block={block} />;
    case "beforeAfter":
      return <BeforeAfterView block={block} />;
    case "annotatedSource":
      return <AnnotatedSourceView block={block} />;
    case "widget":
      return <WidgetFrame block={block} />;
    default:
      return block satisfies never;
  }
}

function ItemBody({ item }: { readonly item: ListItem }): ReactNode {
  const [first, ...rest] = item.children;
  const tight = first?.type === "paragraph" && rest.every((block) => block.type !== "paragraph");
  return tight ? (
    <>
      <Inlines inlines={first.children} />
      <Blocks blocks={rest} />
    </>
  ) : (
    <Blocks blocks={item.children} />
  );
}

const trimStart = (inlines: ReadonlyArray<Inline>): ReadonlyArray<Inline> => {
  const [first, ...rest] = inlines;
  if (first?.type !== "text") return inlines;
  const value = first.value.replace(/^\s*(?:·\s*)?/, "");
  return value === "" ? rest : [{ type: "text", value }, ...rest];
};

function TreeView({ block }: { readonly block: BlockOf<"tree"> }): ReactNode {
  return (
    <div className="tree">
      <ul role="list">
        {block.items.map((item, index) => (
          <TreeNode key={index} item={item} depth={0} open={block.open ?? 1} />
        ))}
      </ul>
    </div>
  );
}

function TreeNode({
  item,
  depth,
  open,
}: {
  readonly item: TreeItem;
  readonly depth: number;
  readonly open: number;
}): ReactNode {
  const [head, ...rest] = item.label;
  const named = head !== undefined && head.type !== "text";
  const description = trimStart(named ? rest : item.label);
  const label = (
    <span className="tree-label">
      {named && (
        <span className="tree-name">
          <Inlines inlines={[head]} />
        </span>
      )}
      {description.length > 0 && (
        <span className="tree-desc">
          <Inlines inlines={description} />
        </span>
      )}
    </span>
  );
  if (item.children.length === 0) return <li className="tree-leaf">{label}</li>;
  return (
    <li>
      <details className="tree-branch" open={depth < open}>
        <summary>
          {icons.chevron}
          {label}
        </summary>
        <ul>
          {item.children.map((child, index) => (
            <TreeNode key={index} item={child} depth={depth + 1} open={open} />
          ))}
        </ul>
      </details>
    </li>
  );
}

function TabsView({ block }: { readonly block: BlockOf<"tabs"> }): ReactNode {
  const id = useId();
  const [selected, setSelected] = useState(0);
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const ink = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const button = buttons.current[selected];
    if (button === null || button === undefined || ink.current === null) return;
    ink.current.style.transform = `translateX(${button.offsetLeft}px)`;
    ink.current.style.width = `${button.offsetWidth}px`;
  }, [selected]);
  const onKeyDown = (event: KeyboardEvent) => {
    const count = block.tabs.length;
    const active = document.activeElement;
    const current = active instanceof HTMLButtonElement ? buttons.current.indexOf(active) : -1;
    const next =
      event.key === "ArrowRight"
        ? current + 1
        : event.key === "ArrowLeft"
          ? current - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? count - 1
              : undefined;
    if (next === undefined) return;
    event.preventDefault();
    const index = (next + count) % count;
    setSelected(index);
    buttons.current[index]?.focus();
  };
  return (
    <div className="tabs">
      <div className="tab-bar" role="tablist" onKeyDown={onKeyDown}>
        {block.tabs.map((tab, index) => (
          <button
            key={index}
            ref={(button) => {
              buttons.current[index] = button;
            }}
            type="button"
            role="tab"
            id={`${id}-tab-${index}`}
            aria-controls={`${id}-panel-${index}`}
            aria-selected={index === selected}
            tabIndex={index === selected ? 0 : -1}
            onClick={() => setSelected(index)}
          >
            {tab.label}
          </button>
        ))}
        <span className="tab-ink" ref={ink} aria-hidden="true" />
      </div>
      {block.tabs.map((tab, index) => (
        <section
          key={index}
          className="tab-panel"
          role="tabpanel"
          id={`${id}-panel-${index}`}
          aria-labelledby={`${id}-tab-${index}`}
          tabIndex={0}
          hidden={index !== selected}
        >
          <Blocks blocks={tab.children} />
        </section>
      ))}
    </div>
  );
}

const itemInlines = (item: ListItem): ReadonlyArray<Inline> => {
  const first = item.children[0];
  return first?.type === "paragraph" ? first.children : [];
};

const sideItems = (blocks: ReadonlyArray<Block>): ReadonlyArray<ListItem> =>
  blocks.flatMap((block) => (block.type === "list" ? block.items : []));

function BeforeAfterView({ block }: { readonly block: BlockOf<"beforeAfter"> }): ReactNode {
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
  const side = (name: "before" | "after", count: string) => {
    let order = 0;
    const labeled = block[name];
    return (
      <section className={`ba-side ba-${name}`}>
        <header className="ba-head">
          <span className="ba-label">{labeled.label}</span>
          <span className="ba-count">{count}</span>
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
  const afterCount = sideItems(block.after.children).length;
  return (
    <div className={drawn ? "ba drawn" : "ba"} ref={root}>
      {side("before", strings.itemCount(sideItems(block.before.children).length))}
      {side("after", strings.itemsRemoved(afterCount, struck.size))}
    </div>
  );
}

function AnnotatedSourceView({ block }: { readonly block: BlockOf<"annotatedSource"> }): ReactNode {
  const { strings } = useViewer();
  return (
    <div className="annotated">
      <header className="annotated-head">
        <span className="annotated-file">{block.ref.path}</span>
        <span className="annotated-range">{rangeLabel(block.ref, strings)}</span>
        <span className="annotated-count">{strings.noteCount(block.notes.length)}</span>
      </header>
      <ol className="notes">
        {block.notes.map((note, index) => (
          <li key={index}>
            <button
              type="button"
              className="note"
              data-ref={formatRef({ ...block.ref, ranges: [{ from: note.from, to: note.to }] })}
              data-kind="note"
              data-index={index + 1}
            >
              <span className="note-num">{index + 1}</span>
              <span className="note-lines">{strings.lines(note.from, note.to)}</span>
              <span className="note-text">
                <Inlines inlines={note.children} />
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
