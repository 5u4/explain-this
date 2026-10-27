import { createContext, useContext } from "react";
import type { SiteResponse } from "./api.ts";
import type { Strings } from "./i18n/strings.ts";

export type Site = Extract<SiteResponse, { readonly status: "ok" }>;

export interface Viewer {
  readonly site: Site;
  readonly strings: Strings;
  readonly status: (message: string) => void;
}

export const ViewerContext = createContext<Viewer | null>(null);

export const useViewer = (): Viewer => {
  const viewer = useContext(ViewerContext);
  if (viewer === null) throw new Error("useViewer outside ViewerContext");
  return viewer;
};
