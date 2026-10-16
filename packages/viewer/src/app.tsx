import { Component, type ReactNode, Suspense, use } from "react";
import type { Site } from "./context.ts";
import { loadSite } from "./data.ts";
import { stringsFor } from "./i18n/strings.ts";
import { parseRoute, type Route, useLocation } from "./router.ts";
import { PageRoute } from "./routes/page-route.tsx";
import { SourceRoute } from "./routes/source-route.tsx";
import { homeHref, Shell } from "./shell/shell.tsx";

export const siteLocale = (site: Site, route: Route): string =>
  route.kind === "unknown" || route.locale === null || !site.locales.includes(route.locale)
    ? site.defaultLocale
    : route.locale;

export const homeRedirect = (site: Site, route: Route, pathname: string): string | null => {
  if (route.kind !== "home") return null;
  const home = homeHref(site, siteLocale(site, route));
  return home === pathname ? null : home;
};

export function App(): ReactNode {
  const site = use(loadSite());
  const where = useLocation();
  if (site.status === "invalid") {
    const strings = stringsFor(navigator.language);
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
  const locale = siteLocale(site, route);
  if (route.kind === "home") {
    return homeRedirect(site, route, location.pathname) === null ? (
      <EmptyHome site={site} locale={locale} />
    ) : null;
  }
  if (route.kind === "unknown" || !site.locales.includes(route.locale)) {
    return <NotFound site={site} locale={locale} path={location.pathname + location.search} />;
  }
  const key = where.split("#")[0];
  return (
    <ErrorBoundary key={key} site={site} locale={locale}>
      <Suspense
        fallback={
          <Shell
            site={site}
            locale={locale}
            current={route.kind === "page" ? route.id : null}
            title={null}
          >
            <div className="page-loading" role="status">
              {stringsFor(locale).loading}
            </div>
          </Shell>
        }
      >
        {route.kind === "page" ? (
          <PageRoute site={site} locale={locale} id={route.id} />
        ) : (
          <SourceRoute site={site} locale={locale} repo={route.repo} path={route.path} />
        )}
      </Suspense>
    </ErrorBoundary>
  );
}

function EmptyHome({ site, locale }: { readonly site: Site; readonly locale: string }): ReactNode {
  const strings = stringsFor(locale);
  return (
    <Shell site={site} locale={locale} current={null} title={null}>
      <article className="page">
        <header className="page-head">
          <h1>{site.title}</h1>
        </header>
        <div className="missing-state">
          <p>{strings.noPages}</p>
        </div>
      </article>
    </Shell>
  );
}

function NotFound({
  site,
  locale,
  path,
}: {
  readonly site: Site;
  readonly locale: string;
  readonly path: string;
}): ReactNode {
  const strings = stringsFor(locale);
  return (
    <Shell site={site} locale={locale} current={null} title={strings.notFound}>
      <article className="page">
        <header className="page-head">
          <h1>{strings.notFound}</h1>
        </header>
        <div className="missing-state">
          <p>{strings.notFoundBody(path)}</p>
          <p>
            <a className="btn" href={homeHref(site, locale)}>
              {strings.backHome}
            </a>
          </p>
        </div>
      </article>
    </Shell>
  );
}

class ErrorBoundary extends Component<
  { readonly site: Site; readonly locale: string; readonly children: ReactNode },
  { readonly error: Error | null }
> {
  override state: { readonly error: Error | null } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (error === null) return this.props.children;
    const strings = stringsFor(this.props.locale);
    return (
      <Shell site={this.props.site} locale={this.props.locale} current={null} title={null}>
        <article className="page">
          <p className="err">{strings.loadFailed(error.message)}</p>
        </article>
      </Shell>
    );
  }
}
