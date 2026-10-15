import type { ReactNode } from "react";
import { useViewer } from "../context.ts";
import { formatRef, rangeLabel } from "../ref.ts";
import type { BlockOf } from "./blocks.tsx";
import { Inlines } from "./inlines.tsx";

export function AnnotatedSourceView({
  block,
}: {
  readonly block: BlockOf<"annotatedSource">;
}): ReactNode {
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
