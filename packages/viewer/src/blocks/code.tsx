import type { Ref } from "@explain/contract/citation";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useViewer } from "../context.ts";
import { loadSourceLines, type SourceLines } from "../data.ts";
import { highlightLines, languageOf, plainLines } from "../highlight.ts";
import { icons } from "../icons.tsx";
import { citedLines, fileKey, formatRef, rangeLabel, sourceHref } from "../ref.ts";

export type SourceLinesState =
  | SourceLines
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string };

export const useSourceLines = (repo: string, path: string): SourceLinesState => {
  const key = fileKey({ repo, path });
  const [state, setState] = useState<{ key: string; lines: SourceLinesState }>({
    key,
    lines: { status: "loading" },
  });
  useEffect(() => {
    let live = true;
    loadSourceLines(repo, path).then(
      (lines) => live && setState({ key, lines }),
      (error: unknown) =>
        live && setState({ key, lines: { status: "error", message: String(error) } }),
    );
    return () => {
      live = false;
    };
  }, [key, repo, path]);
  return state.key === key ? state.lines : { status: "loading" };
};

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
  useEffect(() => () => clearTimeout(timer.current), []);
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

export function CodeBlock({
  lang,
  value,
}: {
  readonly lang: string | null;
  readonly value: string;
}): ReactNode {
  const { strings } = useViewer();
  const key = `${lang ?? ""}\n${value}`;
  const [highlighted, setHighlighted] = useState<{ key: string; html: string }>();
  useEffect(() => {
    let live = true;
    void highlightLines(value.split("\n"), languageOf(lang)).then((lines) => {
      if (live) setHighlighted({ key, html: lines.join("\n") });
    });
    return () => {
      live = false;
    };
  }, [key, lang, value]);
  const html =
    highlighted?.key === key ? highlighted.html : plainLines(value.split("\n")).join("\n");
  return (
    <figure className="codeblock" data-lang={lang ?? "text"}>
      <div className="code-head">
        <span className="code-lang">{strings.codeLanguages[lang ?? "text"] ?? lang ?? ""}</span>
        <CopyButton text={() => value} label={strings.copyCode} />
      </div>
      <pre>
        <code dangerouslySetInnerHTML={{ __html: html }} />
      </pre>
    </figure>
  );
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
  const { locale, strings } = useViewer();
  const lines = useSourceLines(refValue.repo, refValue.path);
  const key = formatRef(refValue);
  const ranges =
    lines.status === "file"
      ? refValue.ranges.length === 0
        ? [{ from: 1, to: lines.raw.length }]
        : refValue.ranges
            .filter((range) => range.from <= lines.raw.length)
            .map((range) => ({ from: range.from, to: Math.min(range.to, lines.raw.length) }))
      : [];
  return (
    <figure className="excerpt" data-ref={key} data-kind="excerpt">
      <div className="code-head">
        <a
          className="cite excerpt-path"
          href={sourceHref(locale, refValue)}
          data-ref={key}
          data-kind="cite"
          data-follow="0"
        >
          {refValue.path}
          <span className="excerpt-range">{rangeLabel(refValue, strings)}</span>
        </a>
        {lines.status === "file" && (
          <CopyButton text={() => citedLines(refValue, lines.raw)} label={strings.copyCode} />
        )}
      </div>
      {lines.status === "loading" && <div className="code-skel" aria-hidden="true" />}
      {lines.status === "missing" && <MissingFile path={refValue.path} />}
      {lines.status === "error" && (
        <p className="err">
          {strings.fileUnreadable(key)}: {lines.message}
        </p>
      )}
      {lines.status === "file" && (
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
      )}
    </figure>
  );
}
