import type { Ref } from "@explain/contract/citation";
import type { DiffChange } from "@explain/contract/page";
import { type ReactNode, Suspense, use, useMemo, useState } from "react";
import { useViewer } from "../context.ts";
import { loadSourceLines, type SourceLines } from "../data.ts";
import { formatRef, rangeLabel, sourceHref } from "../ref.ts";
import { MissingFile } from "./code.tsx";
import { type DiffRow, foldContext, lineDiff } from "./line-diff.ts";

type ChangeOf<Kind extends DiffChange["kind"]> = Extract<DiffChange, { readonly kind: Kind }>;

interface Side {
  readonly ref: Ref | null;
  readonly from: number;
  readonly raw: ReadonlyArray<string>;
  readonly html: ReadonlyArray<string>;
}

const emptyFile: SourceLines = { status: "file", raw: [], html: [] };

export function Diff({ change }: { readonly change: DiffChange }): ReactNode {
  return (
    <Suspense
      fallback={
        <figure className="excerpt diff">
          <DiffHead change={change} stat={null} />
          <div className="code-skel" aria-hidden="true" />
        </figure>
      }
    >
      {change.kind === "modified" ? (
        <ModifiedDiff change={change} />
      ) : (
        <OneSidedDiff change={change} />
      )}
    </Suspense>
  );
}

function ModifiedDiff({ change }: { readonly change: ChangeOf<"modified"> }): ReactNode {
  const before = loadSourceLines(change.before.repo, change.before.path);
  const after = loadSourceLines(change.after.repo, change.after.path);
  return <DiffFigure change={change} before={use(before)} after={use(after)} />;
}

function OneSidedDiff({ change }: { readonly change: ChangeOf<"added" | "deleted"> }): ReactNode {
  const ref = change.kind === "added" ? change.after : change.before;
  const lines = use(loadSourceLines(ref.repo, ref.path));
  return change.kind === "added" ? (
    <DiffFigure change={change} before={emptyFile} after={lines} />
  ) : (
    <DiffFigure change={change} before={lines} after={emptyFile} />
  );
}

const sideOf = (ref: Ref | null, lines: Extract<SourceLines, { status: "file" }>): Side => {
  const range = ref?.ranges[0];
  const from = range?.from ?? 1;
  const to = Math.min(range?.to ?? lines.raw.length, lines.raw.length);
  return {
    ref,
    from,
    raw: lines.raw.slice(from - 1, to),
    html: lines.html.slice(from - 1, to),
  };
};

function DiffFigure({
  change,
  before,
  after,
}: {
  readonly change: DiffChange;
  readonly before: SourceLines;
  readonly after: SourceLines;
}): ReactNode {
  const { locale, strings } = useViewer();
  const [opened, setOpened] = useState<ReadonlySet<number>>(new Set());
  const beforeRef = change.kind === "added" ? null : change.before;
  const afterRef = change.kind === "deleted" ? null : change.after;
  const diff = useMemo(() => {
    if (before.status !== "file" || after.status !== "file") return null;
    const sides = { before: sideOf(beforeRef, before), after: sideOf(afterRef, after) };
    const rows = lineDiff(sides.before.raw, sides.after.raw);
    return { sides, rows, pieces: foldContext(rows) };
  }, [before, after, beforeRef, afterRef]);

  const gutter = (side: Side, index: number | undefined) => {
    if (side.ref === null || index === undefined) return <span className="n" />;
    const line = side.from + index;
    const lineRef: Ref = { ...side.ref, ranges: [{ from: line, to: line }] };
    return (
      <a
        className="n"
        href={sourceHref(locale, lineRef)}
        data-ref={formatRef(lineRef)}
        data-kind="cite"
        data-follow="0"
      >
        {line}
      </a>
    );
  };

  const rowView = (sides: { readonly before: Side; readonly after: Side }, row: DiffRow) => {
    const beforeIndex = row.kind === "added" ? undefined : row.before;
    const afterIndex = row.kind === "removed" ? undefined : row.after;
    return (
      <div className={`ln diff-${row.kind}`} key={`${beforeIndex ?? ""}:${afterIndex ?? ""}`}>
        {gutter(sides.before, beforeIndex)}
        {gutter(sides.after, afterIndex)}
        <span className="sign">
          {row.kind === "removed" && (
            <>
              <span aria-hidden="true">−</span>
              <span className="sr">{strings.diffRemovedLine}</span>
            </>
          )}
          {row.kind === "added" && (
            <>
              <span aria-hidden="true">+</span>
              <span className="sr">{strings.diffAddedLine}</span>
            </>
          )}
        </span>
        <span
          className="t"
          dangerouslySetInnerHTML={{
            __html:
              (row.kind === "removed"
                ? sides.before.html[row.before]
                : sides.after.html[row.after]) || " ",
          }}
        />
      </div>
    );
  };

  const problem = (name: "before" | "after", ref: Ref | null, lines: SourceLines) =>
    lines.status === "missing" ? (
      <MissingFile key={name} path={ref?.path ?? ""} />
    ) : lines.status === "error" ? (
      <p className="err" key={name}>
        {strings.fileUnreadable(ref === null ? "" : formatRef(ref))}: {lines.message}
      </p>
    ) : null;

  const removed = diff?.rows.filter((row) => row.kind === "removed").length ?? 0;
  const added = diff?.rows.filter((row) => row.kind === "added").length ?? 0;

  return (
    <figure className="excerpt diff">
      <DiffHead change={change} stat={diff === null ? null : { removed, added }} />
      {problem("before", beforeRef, before)}
      {problem("after", afterRef, after)}
      {diff !== null && (
        <pre className="lined">
          {diff.pieces.flatMap((piece, index) =>
            piece.kind === "shown" || opened.has(index)
              ? piece.rows.map((row) => rowView(diff.sides, row))
              : [
                  <button
                    type="button"
                    className="ln diff-fold"
                    key={`fold-${index}`}
                    onClick={() => setOpened(new Set(opened).add(index))}
                  >
                    <span className="n" aria-hidden="true">
                      ⋯
                    </span>
                    <span className="t">{strings.diffFold(piece.rows.length)}</span>
                  </button>,
                ],
          )}
        </pre>
      )}
    </figure>
  );
}

function DiffHead({
  change,
  stat,
}: {
  readonly change: DiffChange;
  readonly stat: { readonly removed: number; readonly added: number } | null;
}): ReactNode {
  const { locale, strings } = useViewer();
  const beforeRef = change.kind === "added" ? null : change.before;
  const afterRef = change.kind === "deleted" ? null : change.after;
  const citation = (ref: Ref) => (
    <a className="cite excerpt-path" href={sourceHref(locale, ref)} data-ref={formatRef(ref)}>
      <span className="diff-repo">{ref.repo}</span>:{ref.path}
      <span className="excerpt-range">{rangeLabel(ref, strings)}</span>
    </a>
  );
  return (
    <div className="code-head diff-head">
      <span className="diff-files">
        {beforeRef !== null && citation(beforeRef)}
        {change.kind === "modified" && (
          <span className="diff-arrow" aria-hidden="true">
            →
          </span>
        )}
        {afterRef !== null && citation(afterRef)}
      </span>
      <span className="diff-stat">
        {change.kind === "added" && <span className="diff-kind">{strings.diffAdded}</span>}
        {change.kind === "deleted" && <span className="diff-kind">{strings.diffDeleted}</span>}
        {stat !== null && (
          <span className="diff-counts" title={strings.diffStat(stat.removed, stat.added)}>
            <span className="diff-count-removed">−{stat.removed}</span>
            <span className="diff-count-added">+{stat.added}</span>
          </span>
        )}
      </span>
    </div>
  );
}
