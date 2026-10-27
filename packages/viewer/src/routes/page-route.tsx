import { type ReactNode, use } from "react";
import type { NavPage, PageResponse } from "../api.ts";
import { Blocks } from "../blocks/blocks.tsx";
import { Inlines } from "../blocks/inlines.tsx";
import { type Site, useViewer } from "../context.ts";
import { loadPage } from "../data.ts";
import { Shell } from "../shell/shell.tsx";
import { DevErrors } from "./dev-errors.tsx";
import { Pager } from "./pager.tsx";

export interface Placement {
  readonly page: NavPage;
  readonly index: number;
  readonly order: ReadonlyArray<NavPage>;
}

const placement = (site: Site, id: string): Placement => {
  const order = site.nav;
  const index = order.findIndex((page) => page.id === id);
  return { page: order[index] ?? { id, title: id }, index, order };
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
      <span>{site.title}</span>
      {place.index >= 0 && (
        <>
          <span aria-hidden="true">／</span>
          <span>{strings.pageOf(place.index + 1, place.order.length)}</span>
        </>
      )}
    </p>
  );
  const siteErrors = site.errors.length > 0 && (
    <DevErrors title={strings.siteErrors(site.errors.length)} errors={site.errors} />
  );

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
