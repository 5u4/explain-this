import { type ReactNode, use, useEffect, useRef } from "react";
import type { Diagnostic, NavPage, PageResponse, SourceEntry } from "./api.ts";
import { Blocks } from "./blocks.tsx";
import { homePageId, Shell } from "./chrome.tsx";
import { CopyButton, LinedRows, MissingFile, useSourceLines } from "./code.tsx";
import { type Site, useViewer } from "./context.ts";
import { loadPage, loadSource } from "./data.ts";
import { icons } from "./icons.tsx";
import { Inlines } from "./inlines.tsx";
import { pageHref } from "./router.ts";
import { stringsFor } from "./strings.ts";

interface Placement {
  readonly page: NavPage;
  readonly group: string | null;
  readonly index: number;
  readonly order: ReadonlyArray<{ readonly page: NavPage; readonly group: string }>;
}

const placement = (site: Site, locale: string, id: string): Placement => {
  const localeSite = site.byLocale[locale];
  const order = (localeSite?.nav ?? []).flatMap((group) =>
    group.pages.map((page) => ({ page, group: group.title })),
  );
  const index = order.findIndex((entry) => entry.page.id === id);
  const found = order[index];
  if (found !== undefined) return { page: found.page, group: found.group, index, order };
  const glossary = localeSite?.glossary;
  return {
    page:
      glossary !== undefined && glossary.id === id
        ? glossary
        : { id, title: id, status: "missing" },
    group: null,
    index: -1,
    order,
  };
};

export function PageRoute({
  site,
  locale,
  id,
}: {
  readonly site: Site;
  readonly locale: string;
  readonly id: string;
}): ReactNode {
  const response = use(loadPage(locale, id));
  const place = placement(site, locale, id);
  const parsed = response.status === "parsed" ? response : null;
  return (
    <Shell
      site={site}
      locale={locale}
      current={id}
      title={place.page.title}
      toc={parsed?.page.toc ?? []}
      sources={parsed?.sources ?? []}
      pane={parsed !== null}
    >
      <PageContent response={response} place={place} />
    </Shell>
  );
}

function PageContent({
  response,
  place,
}: {
  readonly response: PageResponse;
  readonly place: Placement;
}): ReactNode {
  const { site, locale, strings } = useViewer();
  const eyebrow = (
    <p className="eyebrow">
      {place.group === null ? (
        <span>
          {place.page.id === "glossary" ? strings.reference : site.byLocale[locale]?.title}
        </span>
      ) : (
        <>
          <span>{place.group}</span>
          <span aria-hidden="true">／</span>
          <span>{strings.pageOf(place.index + 1, place.order.length)}</span>
        </>
      )}
    </p>
  );
  const siteErrors = site.errors.length > 0 && (
    <DevErrors title={strings.siteErrors(site.errors.length)} errors={site.errors} />
  );

  if (response.status === "missing") {
    return (
      <article className="page" data-page={response.id}>
        <header className="page-head">
          {eyebrow}
          <h1>{place.page.title}</h1>
        </header>
        <div className="missing-state">
          <p className="missing-kicker">
            {icons.search} {strings.missingPage(locale)}
          </p>
          <p>{strings.missingPageBody(response.file)}</p>
          <p>
            <a className="btn" href={pageHref(locale, homePageId(site, locale))}>
              {icons.arrowLeft} {strings.backHome}
            </a>
          </p>
        </div>
        <Pager place={place} />
      </article>
    );
  }

  if (response.status === "invalid") {
    return (
      <article className="page" data-page={response.id}>
        <header className="page-head">
          {eyebrow}
          <h1>{place.page.title}</h1>
          <p className="fresh-note">{strings.unparsedPage}</p>
        </header>
        <DevErrors title={strings.pageErrors(response.errors.length)} errors={response.errors} />
        {siteErrors}
      </article>
    );
  }

  return (
    <article className="page" data-page={response.id}>
      <header className="page-head">
        {eyebrow}
        <h1>
          <Inlines inlines={response.page.title} />
        </h1>
        <Freshness response={response} />
      </header>
      {response.errors.length > 0 && (
        <DevErrors title={strings.pageErrors(response.errors.length)} errors={response.errors} />
      )}
      {siteErrors}
      <div className="page-body">
        <Blocks blocks={response.page.blocks} lede />
      </div>
      <Sources entries={response.sources} problems={response.refProblems} />
      <Pager place={place} />
    </article>
  );
}

function Freshness({
  response,
}: {
  readonly response: Extract<PageResponse, { readonly status: "parsed" }>;
}): ReactNode {
  const { strings } = useViewer();
  const stale = response.freshness.status === "stale";
  const unhashed =
    response.freshness.status === "stale" &&
    response.freshness.reasons.some((reason) => reason.kind === "sources-missing");
  const off = response.sources.filter((entry) => entry.state !== "fresh");
  const onlyChanged = off.every((entry) => entry.state === "changed");
  const state = stale ? "stale" : "fresh";
  return (
    <div className="page-meta" data-state={state}>
      <a
        className="fresh"
        href="#page-sources"
        data-state={state}
        title={
          stale
            ? strings.staleTitle(off.map((entry) => entry.path).join(strings.listSeparator))
            : strings.freshTitle(response.sources.length)
        }
      >
        <span className="fresh-dot" aria-hidden="true" />
        <span className="fresh-text">{stale ? strings.stale : strings.fresh}</span>
      </a>
      <span className="fresh-note">
        {!stale
          ? strings.freshNote(response.sources.length)
          : unhashed
            ? strings.unhashedNote
            : off.map((entry, index) => (
                <span key={`${entry.repo}:${entry.path}`}>
                  {index > 0 && strings.listSeparator}
                  <code>{entry.path}</code>
                  {!onlyChanged && ` ${strings.sourceStates[entry.state]}`}
                </span>
              ))}
        {stale && !unhashed && (onlyChanged ? ` ${strings.staleNote}` : strings.staleMixedNote)}
      </span>
    </div>
  );
}

function Sources({
  entries,
  problems,
}: {
  readonly entries: ReadonlyArray<SourceEntry>;
  readonly problems: ReadonlyArray<Diagnostic>;
}): ReactNode {
  const { strings, locale } = useViewer();
  const repos = [...new Set(entries.map((entry) => entry.repo))].join(strings.listSeparator);
  return (
    <section className="sources" aria-labelledby="page-sources">
      <h2 id="page-sources" className="auto-h">
        {strings.sources}
      </h2>
      <p className="sources-intro">{strings.sourcesIntro(repos, entries.length)}</p>
      <div className="table-wrap" tabIndex={0} role="region" aria-label={strings.sources}>
        <table className="sources-table">
          <thead>
            <tr>
              <th>{strings.sourceColumns.file}</th>
              <th>{strings.sourceColumns.hash}</th>
              <th>{strings.sourceColumns.commit}</th>
              <th>{strings.sourceColumns.state}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const key = `${entry.repo}:${entry.path}`;
              const recorded = entry.recorded ?? entry.current;
              return (
                <tr
                  key={key}
                  className={entry.state === "fresh" ? undefined : "is-stale"}
                  data-state={entry.state}
                >
                  <td>
                    <a
                      className="cite"
                      href={`/${encodeURIComponent(locale)}/source/${encodeURIComponent(entry.repo)}/${entry.path.split("/").map(encodeURIComponent).join("/")}`}
                      data-ref={key}
                      data-kind="file"
                    >
                      {entry.path}
                    </a>
                  </td>
                  <td>
                    <code title={recorded?.hash ?? ""}>{recorded?.hash.slice(0, 12) ?? "—"}</code>
                  </td>
                  <td>
                    <code title={recorded?.commit ?? ""}>
                      {recorded?.commit?.slice(0, 7) ?? "—"}
                    </code>
                  </td>
                  <td>
                    <span
                      className={entry.state === "fresh" ? "src-state ok" : "src-state stale"}
                      title={
                        entry.state === "changed" && entry.current !== null
                          ? strings.currentHash(entry.current.hash.slice(0, 12))
                          : undefined
                      }
                    >
                      {strings.sourceStates[entry.state]}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {problems.length > 0 && <DevErrors title={strings.refProblems} errors={problems} />}
    </section>
  );
}

function Pager({ place }: { readonly place: Placement }): ReactNode {
  const { locale, strings } = useViewer();
  if (place.index < 0) return null;
  const card = (entry: Placement["order"][number] | undefined, direction: "prev" | "next") =>
    entry === undefined ? (
      <span />
    ) : (
      <a className={`pager-card ${direction}`} href={pageHref(locale, entry.page.id)}>
        <span className="pager-kicker">
          {direction === "prev" ? (
            <>
              {icons.arrowLeft} {strings.prev}
            </>
          ) : (
            <>
              {strings.next} {icons.arrowRight}
            </>
          )}
        </span>
        <span className="pager-title">{entry.page.title}</span>
        <span className="pager-group">{entry.group}</span>
      </a>
    );
  return (
    <nav className="pager" aria-label={strings.pagerLabel}>
      {card(place.order[place.index - 1], "prev")}
      {card(place.order[place.index + 1], "next")}
    </nav>
  );
}

export function DevErrors({
  title,
  errors,
}: {
  readonly title: string;
  readonly errors: ReadonlyArray<Diagnostic>;
}): ReactNode {
  return (
    <section className="dev-errors" role="alert">
      <h2 className="dev-errors-title">{title}</h2>
      <ol>
        {errors.map((error, index) => (
          <li key={index}>
            <code>
              {error.file}:{error.line}:{error.column}
            </code>
            <span>{error.message}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

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
  const commit = site.repos[repo]?.commit ?? null;
  return (
    <Shell site={site} locale={locale} current={null} title={path}>
      <article className="page source-page">
        <header className="page-head">
          <p className="eyebrow">
            <span>{strings.sourceKicker}</span>
            <span aria-hidden="true">／</span>
            <span>
              {repo}
              {commit !== null && (
                <code className="source-commit" title={strings.pinnedCommit(commit)}>
                  @{commit.slice(0, 7)}
                </code>
              )}
            </span>
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
