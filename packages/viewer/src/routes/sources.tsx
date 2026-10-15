import type { ReactNode } from "react";
import type { Diagnostic, SourceEntry } from "../api.ts";
import { useViewer } from "../context.ts";
import { sourceRouteHref } from "../router.ts";
import { DevErrors } from "./dev-errors.tsx";

export function Sources({
  entries,
  problems,
}: {
  readonly entries: ReadonlyArray<SourceEntry>;
  readonly problems: ReadonlyArray<Diagnostic>;
}): ReactNode {
  const { strings, locale } = useViewer();
  const repos = [...new Set(entries.map((entry) => entry.repo))].join(strings.listSeparator);
  return (
    <section className="sources" aria-labelledby="page-sources">
      <h2 id="page-sources" className="auto-h">
        {strings.sources}
      </h2>
      <p className="sources-intro">{strings.sourcesIntro(repos, entries.length)}</p>
      <div className="table-wrap" tabIndex={0} role="region" aria-label={strings.sources}>
        <table className="sources-table">
          <thead>
            <tr>
              <th>{strings.sourceColumns.file}</th>
              <th>{strings.sourceColumns.hash}</th>
              <th>{strings.sourceColumns.state}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const key = `${entry.repo}:${entry.path}`;
              const recorded = entry.recorded ?? entry.current;
              return (
                <tr
                  key={key}
                  className={entry.state === "fresh" ? undefined : "is-stale"}
                  data-state={entry.state}
                >
                  <td>
                    <a
                      className="cite"
                      href={sourceRouteHref(locale, entry.repo, entry.path)}
                      data-ref={key}
                      data-kind="file"
                    >
                      {entry.path}
                    </a>
                  </td>
                  <td>
                    <code title={recorded?.hash ?? ""}>{recorded?.hash.slice(0, 12) ?? "—"}</code>
                  </td>
                  <td>
                    <span
                      className={entry.state === "fresh" ? "src-state ok" : "src-state stale"}
                      title={
                        entry.state === "changed" && entry.current !== null
                          ? strings.currentHash(entry.current.hash.slice(0, 12))
                          : undefined
                      }
                    >
                      {strings.sourceStates[entry.state]}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {problems.length > 0 && <DevErrors title={strings.refProblems} errors={problems} />}
    </section>
  );
}
