import type { TreeItem } from "@explain/contract/page";
import type { ReactNode } from "react";
import { icons } from "../icons.tsx";
import { type BlockOf, trimStart } from "./blocks.tsx";
import { Inlines } from "./inlines.tsx";

export function TreeView({ block }: { readonly block: BlockOf<"tree"> }): ReactNode {
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
