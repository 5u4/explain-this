import type { Ref } from "@explain/contract/citation";
import { type ReactNode, Suspense, use, useRef, useState } from "react";
import { useViewer } from "../context.ts";
import { loadSourceLines } from "../data.ts";
import { highlightLines, languageOf, plainLines } from "../highlight.ts";
import { icons } from "../icons.tsx";
import { citedLines, formatRef, rangeLabel } from "../ref.ts";

export function CopyButton({
  text,
  label,
}: {
  readonly text: () => string | Promise<string>;
  readonly label: string;
}): ReactNode {
  const { strings, status } = useViewer();
  const [result, setResult] = useState<"idle" | "done" | "failed">("idle");
  const timer = useRef<number | undefined>(undefined);
  const copy = async () => {
    const ok = await Promise.resolve(text())
      .then((value) => navigator.clipboard.writeText(value))
      .then(
        () => true,
        () => false,
      );
    setResult(ok ? "done" : "failed");
    status(ok ? strings.copiedStatus : strings.copyFailedStatus);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setResult("idle"), 1600);
  };
  return (
    <button
      type="button"
      className={result === "idle" ? "copy" : `copy ${result}`}
      aria-label={label}
      onClick={copy}
    >
      <span className="copy-icons">
        {icons.copy}
        {icons.check}
      </span>
      <span className="copy-text">
        {result === "done"
          ? strings.copied
          : result === "failed"
            ? strings.copyFallback
            : strings.copy}
      </span>
    </button>
  );
}

const highlighted = new Map<string, Promise<string>>();

const highlightCode = (lang: string | null, value: string): Promise<string> => {
  const key = `${lang ?? ""}\n${value}`;
  const cached = highlighted.get(key);
  if (cached !== undefined) return cached;
  const lines = value.split("\n");
  const loading = highlightLines(lines, languageOf(lang)).then(
    (html) => html.join("\n"),
    () => plainLines(lines).join("\n"),
  );
  highlighted.set(key, loading);
  return loading;
};

export function CodeBlock({
  lang,
  value,
}: {
  readonly lang: string | null;
  readonly value: string;
}): ReactNode {
  const { strings } = useViewer();
  return (
    <figure className="codeblock" data-lang={lang ?? "text"}>
      <div className="code-head">
        <span className="code-lang">{strings.codeLanguages[lang ?? "text"] ?? lang ?? ""}</span>
        <CopyButton text={() => value} label={strings.copyCode} />
      </div>
      <pre>
        <Suspense
          fallback={
            <code dangerouslySetInnerHTML={{ __html: plainLines(value.split("\n")).join("\n") }} />
          }
        >
          <HighlightedCode lang={lang} value={value} />
        </Suspense>
      </pre>
    </figure>
  );
}

function HighlightedCode({
  lang,
  value,
}: {
  readonly lang: string | null;
  readonly value: string;
}): ReactNode {
  return <code dangerouslySetInnerHTML={{ __html: use(highlightCode(lang, value)) }} />;
}

export function LinedRows({
  html,
  from,
  to,
}: {
  readonly html: ReadonlyArray<string>;
  readonly from: number;
  readonly to: number;
}): ReactNode {
  const rows: Array<ReactNode> = [];
  for (let line = from; line <= to; line++) {
    rows.push(
      <div className="ln" data-n={line} key={line}>
        <span className="n">{line}</span>
        <span className="t" dangerouslySetInnerHTML={{ __html: html[line - 1] || " " }} />
      </div>,
    );
  }
  return rows;
}

export function MissingFile({ path }: { readonly path: string }): ReactNode {
  const { strings } = useViewer();
  return (
    <div className="file-gone" role="note">
      {icons.file}
      <div>
        <strong>{strings.fileGone(path)}</strong>
        <span>{strings.fileGoneDetail}</span>
      </div>
    </div>
  );
}

export function Excerpt({ refValue }: { readonly refValue: Ref }): ReactNode {
  const { strings } = useViewer();
  const key = formatRef(refValue);
  return (
    <figure className="excerpt" data-ref={key} data-kind="excerpt">
      <div className="code-head">
        <a className="cite excerpt-path" href="#" data-ref={key} data-kind="cite" data-follow="0">
          {refValue.path}
          <span className="excerpt-range">{rangeLabel(refValue, strings)}</span>
        </a>
        <Suspense fallback={null}>
          <ExcerptCopy refValue={refValue} />
        </Suspense>
      </div>
      <Suspense fallback={<div className="code-skel" aria-hidden="true" />}>
        <ExcerptBody refValue={refValue} />
      </Suspense>
    </figure>
  );
}

function ExcerptCopy({ refValue }: { readonly refValue: Ref }): ReactNode {
  const { strings } = useViewer();
  const lines = use(loadSourceLines(refValue.repo, refValue.path));
  return lines.status === "file" ? (
    <CopyButton text={() => citedLines(refValue, lines.raw)} label={strings.copyCode} />
  ) : null;
}

function ExcerptBody({ refValue }: { readonly refValue: Ref }): ReactNode {
  const { strings } = useViewer();
  const lines = use(loadSourceLines(refValue.repo, refValue.path));
  if (lines.status === "missing") return <MissingFile path={refValue.path} />;
  if (lines.status === "error")
    return (
      <p className="err">
        {strings.fileUnreadable(formatRef(refValue))}: {lines.message}
      </p>
    );
  const ranges =
    refValue.ranges.length === 0
      ? [{ from: 1, to: lines.raw.length }]
      : refValue.ranges
          .filter((range) => range.from <= lines.raw.length)
          .map((range) => ({ from: range.from, to: Math.min(range.to, lines.raw.length) }));
  return (
    <pre className="lined">
      {ranges.map((range, index) => (
        <div key={range.from} className="lined-range">
          {index > 0 && (
            <div className="ln gap" aria-hidden="true">
              <span className="n">⋮</span>
              <span className="t" />
            </div>
          )}
          <LinedRows html={lines.html} from={range.from} to={range.to} />
        </div>
      ))}
    </pre>
  );
}
