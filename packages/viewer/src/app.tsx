import { Component, type ReactNode, Suspense, use, useEffect } from "react";
import { homePageId, Shell } from "./chrome.tsx";
import type { Site } from "./context.ts";
import { loadSite } from "./data.ts";
import { PageRoute, SourceRoute } from "./pages.tsx";
import { interceptLinks, navigate, pageHref, parseRoute, useLocation } from "./router.ts";
import { stringsFor } from "./strings.ts";

export function App(): ReactNode {
  const site = use(loadSite());
  const where = useLocation();
  useEffect(interceptLinks, []);
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
  if (route.kind === "home") {
    const locale =
      route.locale !== null && site.locales.includes(route.locale)
        ? route.locale
        : site.defaultLocale;
    return <Redirect to={pageHref(locale, homePageId(site, locale))} />;
  }
  if (route.kind === "unknown" || !site.locales.includes(route.locale)) {
    return (
      <NotFound
        site={site}
        locale={site.defaultLocale}
        path={location.pathname + location.search}
      />
    );
  }
  const locale = route.locale;
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

function Redirect({ to }: { readonly to: string }): ReactNode {
  useEffect(() => navigate(to, { replace: true }), [to]);
  return null;
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
            <a className="btn" href={pageHref(locale, homePageId(site, locale))}>
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
