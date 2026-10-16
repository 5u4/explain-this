import {
  type ReactNode,
  Suspense,
  use,
  useCallback,
  useDeferredValue,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { CopyButton } from "../blocks/code.tsx";
import { useViewer } from "../context.ts";
import { loadSourceLines } from "../data.ts";
import { icons } from "../icons.tsx";
import { citedLines, fileKey, rangeLabel } from "../ref.ts";
import type { PaneController } from "./controller.ts";
import { splitQuery } from "./geometry.ts";
import type { Anchor, NoteMarker } from "./model.ts";
import { SourceView } from "./source-view.tsx";

export function SourcePane({ controller }: { readonly controller: PaneController }): ReactNode {
  const { strings, sources } = useViewer();
  const state = useSyncExternalStore(controller.subscribe, controller.getState);
  const pane = useRef<HTMLElement>(null);
  const [files, setFiles] = useState<ReadonlyArray<{ repo: string; path: string }>>([]);
  const shown = state.shown;
  const [lastShown, setLastShown] = useState(shown);
  if (shown !== null && shown !== lastShown) setLastShown(shown);
  const peek = useDeferredValue(lastShown);
  const shownKey = shown === null ? null : fileKey(shown.ref);
  if (shown !== null && !files.some((file) => fileKey(file) === shownKey)) {
    setFiles([...files, { repo: shown.ref.repo, path: shown.ref.path }]);
  }

  const attach = useCallback(
    (leader: SVGSVGElement | null) => {
      if (leader === null || pane.current === null) return;
      return controller.attach(pane.current, leader);
    },
    [controller],
  );

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
            {shown !== null && <span className="pane-repo">{repo}</span>}
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
                  loadSourceLines(shown.ref.repo, shown.ref.path).then((lines) => {
                    if (lines.status === "error") throw new Error(lines.message);
                    return lines.status === "file" ? citedLines(shown.ref, lines.raw) : "";
                  })
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
            <Suspense fallback={null}>{peek !== null && <PeekLine anchor={peek} />}</Suspense>
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
      <svg className="leader" aria-hidden="true" ref={attach}>
        <path className="leader-path" />
        <circle className="leader-a" r="3" />
        <circle className="leader-b" r="3" />
      </svg>
    </>
  );
}

function PeekLine({ anchor }: { readonly anchor: Anchor }): ReactNode {
  const { strings } = useViewer();
  const lines = use(loadSourceLines(anchor.ref.repo, anchor.ref.path));
  const line = anchor.ref.ranges[0]?.from ?? 1;
  return (
    <>
      <span className="peek-n">{line}</span>
      {lines.status === "file"
        ? lines.raw[line - 1]?.trim() || "…"
        : lines.status === "missing"
          ? strings.paneGone
          : anchor.key}
    </>
  );
}

const noNotes: ReadonlyArray<NoteMarker> = [];
