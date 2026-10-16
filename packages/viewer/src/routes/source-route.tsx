import { type ReactNode, Suspense, use } from "react";
import { CopyButton, LinedRows, MissingFile } from "../blocks/code.tsx";
import { type Site, useViewer } from "../context.ts";
import { loadSource, loadSourceLines } from "../data.ts";
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
  return (
    <figure className="excerpt source-file">
      <div className="code-head">
        <span className="excerpt-path">{path}</span>
        <Suspense fallback={null}>
          <SourceCopy repo={repo} path={path} />
        </Suspense>
      </div>
      <Suspense fallback={<div className="code-skel" aria-hidden="true" />}>
        <SourceBody repo={repo} path={path} />
      </Suspense>
    </figure>
  );
}

function SourceCopy({ repo, path }: { readonly repo: string; readonly path: string }): ReactNode {
  const { strings } = useViewer();
  const lines = use(loadSourceLines(repo, path));
  return lines.status === "file" ? (
    <CopyButton text={() => lines.raw.join("\n")} label={strings.copyCode} />
  ) : null;
}

function SourceBody({ repo, path }: { readonly repo: string; readonly path: string }): ReactNode {
  const lines = use(loadSourceLines(repo, path));
  if (lines.status === "missing") return <MissingFile path={path} />;
  if (lines.status === "error") return <p className="err">{lines.message}</p>;
  return (
    <pre className="lined" ref={revealHashLine}>
      <LinedRows html={lines.html} from={1} to={lines.raw.length} />
    </pre>
  );
}

const revealHashLine = (pre: HTMLPreElement | null) => {
  const match = /^#L(\d+)$/.exec(location.hash);
  if (pre === null || match === null) return;
  const row = pre.querySelector<HTMLElement>(`.ln[data-n="${match[1]}"]`);
  row?.classList.add("target");
  row?.scrollIntoView({ block: "center" });
};
