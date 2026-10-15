import type { Ref } from "@explain/contract/citation";
import { memo, type ReactNode, useLayoutEffect, useRef } from "react";
import { MissingFile, useSourceLines } from "../blocks/code.tsx";
import { useViewer } from "../context.ts";
import { formatRef, rangeLabel } from "../ref.ts";
import type { PaneController } from "./controller.ts";
import { reducedMotion } from "./geometry.ts";
import type { NoteMarker } from "./model.ts";

export const SourceView = memo(function SourceView({
  controller,
  repo,
  path,
  focus,
  notes,
  activeNote,
  sheetOpen,
}: {
  readonly controller: PaneController;
  readonly repo: string;
  readonly path: string;
  readonly focus: Ref | null;
  readonly notes: ReadonlyArray<NoteMarker>;
  readonly activeNote: string | null;
  readonly sheetOpen: boolean;
}): ReactNode {
  const { strings } = useViewer();
  const lines = useSourceLines(repo, path);
  const scroller = useRef<HTMLDivElement>(null);
  const code = useRef<HTMLDivElement>(null);
  const focusKey = focus === null ? null : formatRef(focus);
  const ranges = focus?.ranges ?? [];

  useLayoutEffect(() => {
    const box = code.current;
    const scroll = scroller.current;
    if (focusKey === null || lines.status !== "file" || box === null || scroll === null) return;
    const behavior: ScrollBehavior = reducedMotion.matches ? "auto" : "smooth";
    const target = placeBands(box, ranges)[0];
    if (target === undefined) scroll.scrollTo({ top: 0, behavior });
    else {
      const viewport = scroll.clientHeight;
      const top =
        target.height > viewport - 64
          ? target.top - 32
          : target.top - (viewport - target.height) * 0.42;
      scroll.scrollTo({ top: Math.max(0, top), behavior });
    }
    controller.schedule();
    const reflow = new ResizeObserver(() => {
      placeBands(box, ranges);
      controller.schedule();
    });
    reflow.observe(box);
    return () => reflow.disconnect();
  }, [controller, focusKey, lines.status, sheetOpen, notes]);

  const focused = ranges.length > 0;
  return (
    <div className={focus === null ? "view" : "view on"} data-path={path}>
      <div
        className="view-scroll"
        tabIndex={0}
        aria-label={strings.paneSource(path)}
        ref={scroller}
        onScroll={controller.schedule}
      >
        <div className={focused ? "code focused" : "code"} ref={code}>
          {lines.status === "loading" && (
            <div className="skel">
              {Array.from({ length: 14 }, (_, index) => (
                <i key={index} />
              ))}
            </div>
          )}
          {lines.status === "missing" && (
            <div className="pane-error">
              <MissingFile path={path} />
            </div>
          )}
          {lines.status === "error" && (
            <div className="pane-error">
              <strong>{strings.fileUnreadable(`${repo}:${path}`)}</strong>
              <span>{lines.message}</span>
            </div>
          )}
          {lines.status === "file" && (
            <>
              {Array.from({ length: Math.max(1, ranges.length) }, (_, index) => (
                <div key={index} className={focused ? "band on" : "band"} aria-hidden="true" />
              ))}
              <div className="markers">
                {notes.map((note) => (
                  <button
                    key={note.key}
                    type="button"
                    className={note.key === activeNote ? "marker on" : "marker"}
                    data-key={note.key}
                    data-line={note.ref.ranges[0]?.from ?? 1}
                    aria-label={strings.noteLabel(note.index, rangeLabel(note.ref, strings))}
                    onClick={() => controller.activateNote(note.key)}
                  >
                    {note.index}
                  </button>
                ))}
              </div>
              {lines.html.map((html, index) => {
                const line = index + 1;
                const hit = ranges.some((range) => line >= range.from && line <= range.to);
                return (
                  <div key={line} className={hit ? "ln hit" : "ln"} data-n={line}>
                    <span className="n">{line}</span>
                    <span className="t" dangerouslySetInnerHTML={{ __html: html || " " }} />
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
});

function placeBands(
  box: HTMLElement,
  ranges: ReadonlyArray<{ readonly from: number; readonly to: number }>,
): ReadonlyArray<{ readonly top: number; readonly height: number }> {
  const rows = box.querySelectorAll<HTMLElement>(":scope > .ln");
  const bands = box.querySelectorAll<HTMLElement>(":scope > .band");
  const spans = ranges.flatMap((range) => {
    const first = rows[range.from - 1];
    const last = rows[Math.min(range.to, rows.length) - 1];
    return first === undefined || last === undefined
      ? []
      : [{ top: first.offsetTop, height: last.offsetTop + last.offsetHeight - first.offsetTop }];
  });
  spans.forEach((span, index) => {
    const band = bands[index];
    if (band === undefined) return;
    band.style.transform = `translateY(${span.top}px)`;
    band.style.height = `${span.height}px`;
  });
  for (const marker of box.querySelectorAll<HTMLElement>(".marker")) {
    const row = rows[Number(marker.dataset.line) - 1];
    if (row !== undefined) marker.style.top = `${row.offsetTop}px`;
  }
  return spans;
}
