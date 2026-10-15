import type { Block, Inline, ListItem } from "@explain/contract/page";
import type { ReactNode } from "react";
import { useViewer } from "../context.ts";
import { alertIcons } from "../icons.tsx";
import { AnnotatedSourceView } from "./annotated-source.tsx";
import { BeforeAfterView } from "./before-after.tsx";
import { CodeBlock, Excerpt } from "./code.tsx";
import { Diff } from "./diff.tsx";
import { Inlines } from "./inlines.tsx";
import { Mermaid } from "./mermaid.tsx";
import { TabsView } from "./tabs.tsx";
import { TreeView } from "./tree.tsx";
import { WidgetFrame } from "./widget.tsx";

export type BlockOf<Type extends Block["type"]> = Extract<Block, { readonly type: Type }>;

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

export function BlockView({
  block,
  lede,
}: {
  readonly block: Block;
  readonly lede: boolean;
}): ReactNode {
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
    case "diff":
      return <Diff change={block.change} />;
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

export const trimStart = (inlines: ReadonlyArray<Inline>): ReadonlyArray<Inline> => {
  const [first, ...rest] = inlines;
  if (first?.type !== "text") return inlines;
  const value = first.value.replace(/^\s*(?:·\s*)?/, "");
  return value === "" ? rest : [{ type: "text", value }, ...rest];
};
