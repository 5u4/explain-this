import { type ReactNode, use, useEffect, useRef } from "react";
import { CopyButton, LinedRows, MissingFile, useSourceLines } from "../blocks/code.tsx";
import { type Site, useViewer } from "../context.ts";
import { loadSource } from "../data.ts";
import { stringsFor } from "../i18n/strings.ts";
import { pageHref } from "../router.ts";
import { Shell } from "../shell/shell.tsx";

export function SourceRoute({
  site,
  locale,
  repo,
  path,
}: {
  readonly site: Site;
  readonly locale: string;
  readonly repo: string;
  readonly path: string;
}): ReactNode {
  const source = use(loadSource(repo, path));
  const strings = stringsFor(locale);
  return (
    <Shell site={site} locale={locale} current={null} title={path}>
      <article className="page source-page">
        <header className="page-head">
          <p className="eyebrow">
            <span>{strings.sourceKicker}</span>
            <span aria-hidden="true">／</span>
            <span>{repo}</span>
          </p>
          <h1 className="source-title">
            <code>{path}</code>
          </h1>
          <div className="page-meta">
            <span className="fresh-note">
              {source.status === "file"
                ? strings.sourceLines(source.lines)
                : strings.fileGone(path)}
            </span>
          </div>
        </header>
        <section className="cited-by" aria-labelledby="cited-by">
          <h2 id="cited-by" className="auto-h">
            {strings.citedBy}
          </h2>
          {source.citedBy.filter((citer) => citer.locale === locale).length === 0 ? (
            <p className="sources-intro">{strings.citedByNone}</p>
          ) : (
            <ul className="cited-list">
              {source.citedBy
                .filter((citer) => citer.locale === locale)
                .map((citer) => (
                  <li key={citer.id}>
                    <a href={pageHref(locale, citer.id)}>{citer.title}</a>
                  </li>
                ))}
            </ul>
          )}
        </section>
        {source.status === "missing" ? (
          <MissingFile path={path} />
        ) : (
          <SourceFile repo={repo} path={path} />
        )}
      </article>
    </Shell>
  );
}

function SourceFile({ repo, path }: { readonly repo: string; readonly path: string }): ReactNode {
  const { strings } = useViewer();
  const lines = useSourceLines(repo, path);
  const figure = useRef<HTMLElement>(null);
  useEffect(() => {
    const match = /^#L(\d+)$/.exec(location.hash);
    if (lines.status !== "file" || match === null || figure.current === null) return;
    const row = figure.current.querySelector<HTMLElement>(`.ln[data-n="${match[1]}"]`);
    row?.classList.add("target");
    row?.scrollIntoView({ block: "center" });
  }, [lines.status]);
  return (
    <figure className="excerpt source-file" ref={figure}>
      <div className="code-head">
        <span className="excerpt-path">{path}</span>
        {lines.status === "file" && (
          <CopyButton text={() => lines.raw.join("\n")} label={strings.copyCode} />
        )}
      </div>
      {lines.status === "loading" && <div className="code-skel" aria-hidden="true" />}
      {lines.status === "missing" && <MissingFile path={path} />}
      {lines.status === "error" && <p className="err">{lines.message}</p>}
      {lines.status === "file" && (
        <pre className="lined">
          <LinedRows html={lines.html} from={1} to={lines.raw.length} />
        </pre>
      )}
    </figure>
  );
}
