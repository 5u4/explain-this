import { type ReactNode, use } from "react";
import type { NavPage, PageResponse } from "../api.ts";
import { Blocks } from "../blocks/blocks.tsx";
import { Inlines } from "../blocks/inlines.tsx";
import { type Site, useViewer } from "../context.ts";
import { loadPage } from "../data.ts";
import { icons } from "../icons.tsx";
import { homeHref, Shell } from "../shell/shell.tsx";
import { DevErrors } from "./dev-errors.tsx";
import { Pager } from "./pager.tsx";

export interface Placement {
  readonly page: NavPage;
  readonly group: string | null;
  readonly index: number;
  readonly order: ReadonlyArray<{ readonly page: NavPage; readonly group: string }>;
}

const placement = (site: Site, id: string): Placement => {
  const order = site.nav.flatMap((group) =>
    group.pages.map((page) => ({ page, group: group.title })),
  );
  const index = order.findIndex((entry) => entry.page.id === id);
  const found = order[index];
  if (found !== undefined) return { page: found.page, group: found.group, index, order };
  return { page: { id, title: id }, group: null, index: -1, order };
};

export function PageRoute({ site, id }: { readonly site: Site; readonly id: string }): ReactNode {
  const response = use(loadPage(id));
  const place = placement(site, id);
  const parsed = response.status === "parsed" ? response : null;
  return (
    <Shell
      site={site}
      current={id}
      title={place.page.title}
      toc={parsed?.page.toc ?? []}
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
  const { site, strings } = useViewer();
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
            {icons.search} {strings.missingPage}
          </p>
          <p>{strings.missingPageBody(response.file)}</p>
          <p>
            <a className="btn" href={homeHref(site)}>
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

  return (
    <article className="page" data-page={response.id}>
      <header className="page-head">
        {eyebrow}
        <h1>
          <Inlines inlines={response.page.title} />
        </h1>
      </header>
      {response.diagnostics.length > 0 && (
        <DevErrors
          title={strings.pageErrors(response.diagnostics.length)}
          errors={response.diagnostics}
        />
      )}
      {siteErrors}
      <div className="page-body">
        <Blocks blocks={response.page.blocks} lede />
      </div>
      <Pager place={place} />
    </article>
  );
}
