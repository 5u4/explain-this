import { type ReactNode, use } from "react";
import type { NavPage, PageResponse } from "../api.ts";
import { Blocks } from "../blocks/blocks.tsx";
import { Inlines } from "../blocks/inlines.tsx";
import { type Site, useViewer } from "../context.ts";
import { loadPage } from "../data.ts";
import { icons } from "../icons.tsx";
import { homeHref, Shell } from "../shell/shell.tsx";
import { DevErrors } from "./dev-errors.tsx";
import { Freshness } from "./freshness.tsx";
import { Pager } from "./pager.tsx";
import { Sources } from "./sources.tsx";

export interface Placement {
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
  return { page: { id, title: id, status: "missing" }, group: null, index: -1, order };
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
        <span>{site.title}</span>
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
            <a className="btn" href={homeHref(site, locale)}>
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
        <DevErrors
          title={strings.pageErrors(response.diagnostics.length)}
          errors={response.diagnostics}
        />
        {siteErrors}
      </article>
    );
  }

  const citation = response.diagnostics.filter(
    (diagnostic) => diagnostic._tag === "CitationRepo" || diagnostic._tag === "CitationFile",
  );
  const other = response.diagnostics.filter(
    (diagnostic) => diagnostic._tag !== "CitationRepo" && diagnostic._tag !== "CitationFile",
  );
  return (
    <article className="page" data-page={response.id}>
      <header className="page-head">
        {eyebrow}
        <h1>
          <Inlines inlines={response.page.title} />
        </h1>
        <Freshness response={response} />
      </header>
      {other.length > 0 && <DevErrors title={strings.pageErrors(other.length)} errors={other} />}
      {siteErrors}
      <div className="page-body">
        <Blocks blocks={response.page.blocks} lede />
      </div>
      <Sources entries={response.sources} problems={citation} />
      <Pager place={place} />
    </article>
  );
}
