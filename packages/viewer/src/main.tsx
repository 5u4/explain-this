import { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { App, homeRedirect } from "./app.tsx";
import { loadSite } from "./data.ts";
import { parseRoute, startRouter } from "./router.ts";

const root = document.getElementById("root");
if (root === null) throw new Error("index.html has no #root");

loadSite().then((site) => {
  if (site.status !== "ok") {
    startRouter(() => null);
    return;
  }
  startRouter((pathname, search) => homeRedirect(site, parseRoute(pathname, search), pathname));
});

createRoot(root).render(
  <StrictMode>
    <Suspense fallback={null}>
      <App />
    </Suspense>
  </StrictMode>,
);
