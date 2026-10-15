import { createContext, useContext } from "react";
import type { SiteResponse, SourceEntry } from "./api.ts";
import type { Strings } from "./strings.ts";

export type Site = Extract<SiteResponse, { readonly status: "ok" }>;

export interface Viewer {
  readonly site: Site;
  readonly locale: string;
  readonly strings: Strings;
  readonly sources: ReadonlyArray<SourceEntry>;
  readonly status: (message: string) => void;
}

export const ViewerContext = createContext<Viewer | null>(null);

export const useViewer = (): Viewer => {
  const viewer = useContext(ViewerContext);
  if (viewer === null) throw new Error("useViewer outside ViewerContext");
  return viewer;
};
