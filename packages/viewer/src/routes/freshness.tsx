import type { ReactNode } from "react";
import type { PageResponse } from "../api.ts";
import { useViewer } from "../context.ts";

export function Freshness({
  response,
}: {
  readonly response: Extract<PageResponse, { readonly status: "parsed" }>;
}): ReactNode {
  const { strings } = useViewer();
  const stale = response.freshness.status === "stale";
  const reasons = response.freshness.status === "stale" ? response.freshness.reasons : [];
  const recordNote = reasons.some((reason) => reason.kind === "sources-missing")
    ? strings.unhashedNote
    : reasons.some((reason) => reason.kind === "sources-malformed")
      ? strings.malformedSourcesNote
      : undefined;
  const off = response.sources.filter((entry) => entry.state !== "fresh");
  const onlyChanged = off.every((entry) => entry.state === "changed");
  const state = stale ? "stale" : "fresh";
  return (
    <div className="page-meta" data-state={state}>
      <a
        className="fresh"
        href="#page-sources"
        data-state={state}
        title={
          stale
            ? strings.staleTitle(off.map((entry) => entry.path).join(strings.listSeparator))
            : strings.freshTitle(response.sources.length)
        }
      >
        <span className="fresh-dot" aria-hidden="true" />
        <span className="fresh-text">{stale ? strings.stale : strings.fresh}</span>
      </a>
      <span className="fresh-note">
        {!stale
          ? strings.freshNote(response.sources.length)
          : (recordNote ??
            off.map((entry, index) => (
              <span key={`${entry.repo}:${entry.path}`}>
                {index > 0 && strings.listSeparator}
                <code>{entry.path}</code>
                {!onlyChanged && ` ${strings.sourceStates[entry.state]}`}
              </span>
            )))}
        {stale &&
          recordNote === undefined &&
          (onlyChanged ? ` ${strings.staleNote}` : strings.staleMixedNote)}
      </span>
    </div>
  );
}
