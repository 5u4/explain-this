import type { Ref } from "@explain/contract/citation";
import {
  memo,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { CopyButton, MissingFile, useSourceLines } from "./code.tsx";
import { useViewer } from "./context.ts";
import { loadSourceLines } from "./data.ts";
import { icons } from "./icons.tsx";
import type { NoteMarker, PaneController } from "./pane.ts";
import { splitQuery } from "./pane.ts";
import { citedLines, fileKey, formatRef, rangeLabel } from "./ref.ts";

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

interface Peek {
  readonly key: string;
  readonly line: number;
  readonly text: string;
}

export function SourcePane({ controller }: { readonly controller: PaneController }): ReactNode {
  const { site, strings, sources } = useViewer();
  const state = useSyncExternalStore(controller.subscribe, controller.getState);
  const pane = useRef<HTMLElement>(null);
  const leader = useRef<SVGSVGElement>(null);
  const [files, setFiles] = useState<ReadonlyArray<{ repo: string; path: string }>>([]);
  const [peek, setPeek] = useState<Peek | null>(null);
  const shown = state.shown;
  const shownKey = shown === null ? null : fileKey(shown.ref);
  if (shown !== null && !files.some((file) => fileKey(file) === shownKey)) {
    setFiles([...files, { repo: shown.ref.repo, path: shown.ref.path }]);
  }

  useEffect(() => {
    if (pane.current === null || leader.current === null) return;
    return controller.attach(pane.current, leader.current);
  }, [controller]);

  useEffect(() => {
    if (shown === null) return;
    const { repo, path } = shown.ref;
    const line = shown.ref.ranges[0]?.from ?? 1;
    let live = true;
    loadSourceLines(repo, path).then(
      (lines) => {
        if (!live) return;
        setPeek({
          key: shown.key,
          line,
          text: lines.status === "file" ? lines.raw[line - 1]?.trim() || "…" : strings.paneGone,
        });
      },
      () => live && setPeek({ key: shown.key, line, text: shown.key }),
    );
    return () => {
      live = false;
    };
  }, [shown, strings]);

  const entry =
    shown === null
      ? undefined
      : sources.find((source) => source.repo === shown.ref.repo && source.path === shown.ref.path);
  const flag =
    entry?.state === "missing"
      ? strings.paneGone
      : entry?.state === "changed"
        ? strings.paneChanged
        : null;
  const path = shown?.ref.path ?? "";
  const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : "";
  const range = shown === null ? "" : rangeLabel(shown.ref, strings);
  const repo = shown?.ref.repo ?? "";
  const commit = site.repos[repo]?.commit ?? null;
  const toggleSheet = () => controller.setSheet(!state.sheetOpen);
  const narrow = () => !matchMedia(splitQuery).matches;
  const view = state.preview ? "preview" : state.mode.kind;

  return (
    <>
      <aside
        className="pane"
        ref={pane}
        data-mode={view}
        aria-label={shown === null ? strings.pane : strings.paneLabel(path, range)}
      >
        <div className="pane-head">
          <button
            type="button"
            className="sheet-handle"
            aria-expanded={state.sheetOpen}
            aria-label={strings.openSheet}
            onClick={toggleSheet}
          >
            <span />
          </button>
          <div className="pane-title" aria-live="off" onClick={() => narrow() && toggleSheet()}>
            {shown !== null && (
              <span
                className="pane-repo"
                title={commit === null ? undefined : strings.pinnedCommit(commit)}
              >
                {repo}
                {commit !== null && <span className="pane-commit">@{commit.slice(0, 7)}</span>}
              </span>
            )}
            <span className="pane-path">
              <span className="pane-dir">{dir}</span>
              <span className="pane-base">
                {shown === null ? strings.pane : path.slice(dir.length)}
              </span>
            </span>
          </div>
          <div className="pane-meta">
            <span className="pane-range">{range}</span>
            <span className="pane-hash" title={strings.recordedHash}>
              {entry?.recorded?.hash.slice(0, 7) ?? ""}
            </span>
            {flag !== null && <span className="pane-flag">{flag}</span>}
          </div>
          <div className="pane-mode">
            <span className="pane-state" role="status" tabIndex={-1}>
              <span className="mode-dot" aria-hidden="true" />
              {strings.modes[view]}
            </span>
            {state.mode.kind === "pinned" && (
              <button type="button" className="pane-resume" onClick={() => controller.resume()}>
                {strings.resumeFollow}
              </button>
            )}
          </div>
          <div className="pane-actions">
            {shown !== null && (
              <CopyButton
                label={strings.copyCited}
                text={() =>
                  loadSourceLines(shown.ref.repo, shown.ref.path).then((lines) =>
                    lines.status === "file" ? citedLines(shown.ref, lines.raw) : "",
                  )
                }
              />
            )}
          </div>
          <button
            type="button"
            className="icon-btn sheet-close"
            aria-label={strings.closeSheet}
            onClick={() => controller.setSheet(false)}
          >
            {icons.close}
          </button>
        </div>
        <div className="pane-peek" onClick={() => controller.setSheet(true)}>
          <code className={peek !== null && peek.key === shown?.key ? "peek-line in" : "peek-line"}>
            {peek !== null && (
              <>
                <span className="peek-n">{peek.line}</span>
                {peek.text}
              </>
            )}
          </code>
        </div>
        <div className="pane-body">
          {files.length === 0 && <div className="pane-empty">{strings.paneEmpty}</div>}
          {files.map((file) => {
            const key = fileKey(file);
            const active = key === shownKey;
            return (
              <SourceView
                key={key}
                controller={controller}
                repo={file.repo}
                path={file.path}
                focus={active && shown !== null ? shown.ref : null}
                notes={active ? state.notes : noNotes}
                activeNote={active && shown?.kind === "note" ? shown.key : null}
                sheetOpen={state.sheetOpen}
              />
            );
          })}
        </div>
        <div className="pane-foot">
          <span className="pane-count">
            {state.position >= 0
              ? strings.citeCount(state.position + 1, state.total)
              : strings.citeTotal(state.total)}
          </span>
          <span className="pane-nav">
            <button
              type="button"
              className="icon-btn"
              aria-label={strings.prevCite}
              onClick={() => controller.step(-1)}
            >
              {icons.up}
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label={strings.nextCite}
              onClick={() => controller.step(1)}
            >
              {icons.down}
            </button>
          </span>
        </div>
      </aside>
      <div className="sheet-scrim" aria-hidden="true" onClick={() => controller.setSheet(false)} />
      <svg className="leader" aria-hidden="true" ref={leader}>
        <path className="leader-path" />
        <circle className="leader-a" r="3" />
        <circle className="leader-b" r="3" />
      </svg>
    </>
  );
}

const noNotes: ReadonlyArray<NoteMarker> = [];

const SourceView = memo(function SourceView({
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
