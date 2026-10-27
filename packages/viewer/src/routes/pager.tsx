import type { ReactNode } from "react";
import { useViewer } from "../context.ts";
import { icons } from "../icons.tsx";
import { pageHref } from "../router.ts";
import type { Placement } from "./page-route.tsx";

export function Pager({ place }: { readonly place: Placement }): ReactNode {
  const { strings } = useViewer();
  if (place.index < 0) return null;
  const card = (entry: Placement["order"][number] | undefined, direction: "prev" | "next") =>
    entry === undefined ? (
      <span />
    ) : (
      <a className={`pager-card ${direction}`} href={pageHref(entry.page.id)}>
        <span className="pager-kicker">
          {direction === "prev" ? (
            <>
              {icons.arrowLeft} {strings.prev}
            </>
          ) : (
            <>
              {strings.next} {icons.arrowRight}
            </>
          )}
        </span>
        <span className="pager-title">{entry.page.title}</span>
        <span className="pager-group">{entry.group}</span>
      </a>
    );
  return (
    <nav className="pager" aria-label={strings.pagerLabel}>
      {card(place.order[place.index - 1], "prev")}
      {card(place.order[place.index + 1], "next")}
    </nav>
  );
}
