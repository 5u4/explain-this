import { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { App, homeRedirect, siteLocale } from "./app.tsx";
import { loadSite } from "./data.ts";
import { parseRoute, startRouter, subscribeLocation } from "./router.ts";
import { installSearchShortcut } from "./shell/search-opener.ts";

const root = document.getElementById("root");
if (root === null) throw new Error("index.html has no #root");

installSearchShortcut();
loadSite().then((site) => {
  if (site.status !== "ok") {
    startRouter(() => null);
    return;
  }
  subscribeLocation(() => {
    document.documentElement.lang = siteLocale(
      site,
      parseRoute(location.pathname, location.search),
    );
  });
  startRouter((pathname, search) => homeRedirect(site, parseRoute(pathname, search), pathname));
});

createRoot(root).render(
  <StrictMode>
    <Suspense fallback={null}>
      <App />
    </Suspense>
  </StrictMode>,
);
