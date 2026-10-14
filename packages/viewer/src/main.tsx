import { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app.tsx";

const root = document.getElementById("root");
if (root === null) throw new Error("index.html has no #root");

createRoot(root).render(
  <StrictMode>
    <Suspense fallback={null}>
      <App />
    </Suspense>
  </StrictMode>,
);
