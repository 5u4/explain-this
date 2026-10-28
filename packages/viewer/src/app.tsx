import { Component, type ReactNode, Suspense, use } from "react";
import type { Site } from "./context.ts";
import { loadSite } from "./data.ts";
import { strings } from "./i18n/strings.ts";
import { parseRoute, type Route, useLocation } from "./router.ts";
import { DevErrors } from "./routes/dev-errors.tsx";
import { PageRoute } from "./routes/page-route.tsx";
import { homeHref, Shell } from "./shell/shell.tsx";

export const homeRedirect = (site: Site, route: Route, pathname: string): string | null => {
  if (route.kind !== "home") return null;
  const home = homeHref(site);
  return home === pathname ? null : home;
};

export function App(): ReactNode {
  const site = use(loadSite());
  const where = useLocation();
  if (site.status === "invalid") {
    return (
      <main className="prose-col">
        <article className="page">
          <h1>{strings.siteErrors(site.errors.length)}</h1>
          <ol className="dev-errors">
            {site.errors.map((error, index) => (
              <li key={index}>
                <code>
                  {error.file}:{error.line}:{error.column}
                </code>
                <span>{error.message}</span>
              </li>
            ))}
          </ol>
        </article>
      </main>
    );
  }
  const route = parseRoute(location.pathname, location.search);
  if (route.kind === "home") {
    return homeRedirect(site, route, location.pathname) === null ? <EmptyHome site={site} /> : null;
  }
  if (route.kind === "unknown") {
    return <NotFound site={site} path={location.pathname + location.search} />;
  }
  const key = where.split("#")[0];
  return (
    <ErrorBoundary key={key} site={site}>
      <Suspense
        fallback={
          <Shell site={site} current={route.id} title={null}>
            <div className="page-loading" role="status">
              {strings.loading}
            </div>
          </Shell>
        }
      >
        <PageRoute site={site} id={route.id} />
      </Suspense>
    </ErrorBoundary>
  );
}

function EmptyHome({ site }: { readonly site: Site }): ReactNode {
  return (
    <Shell site={site} current={null} title={null}>
      <article className="page">
        <header className="page-head">
          <h1>{site.title}</h1>
        </header>
        <div className="missing-state">
          <p>{strings.noPages}</p>
        </div>
        {site.errors.length > 0 && (
          <DevErrors title={strings.siteErrors(site.errors.length)} errors={site.errors} />
        )}
      </article>
    </Shell>
  );
}

function NotFound({ site, path }: { readonly site: Site; readonly path: string }): ReactNode {
  return (
    <Shell site={site} current={null} title={strings.notFound}>
      <article className="page">
        <header className="page-head">
          <h1>{strings.notFound}</h1>
        </header>
        <div className="missing-state">
          <p>{strings.notFoundBody(path)}</p>
          <p>
            <a className="btn" href={homeHref(site)}>
              {strings.backHome}
            </a>
          </p>
        </div>
      </article>
    </Shell>
  );
}

class ErrorBoundary extends Component<
  { readonly site: Site; readonly children: ReactNode },
  { readonly error: Error | null }
> {
  override state: { readonly error: Error | null } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (error === null) return this.props.children;
    return (
      <Shell site={this.props.site} current={null} title={null}>
        <article className="page">
          <p className="err">{strings.loadFailed(error.message)}</p>
        </article>
      </Shell>
    );
  }
}
