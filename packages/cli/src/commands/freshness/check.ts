import { formatRef } from "@explain/contract/citation";
import type { StaleReason } from "@explain/contract/sources";
import * as Console from "effect/Console";
import * as Command from "effect/cli/Command";
import * as Effect from "effect/Effect";
import { ExitWith } from "../exit-with.ts";
import { openDocRoot } from "../open-doc-root.ts";

const describeReason = (reason: StaleReason, pageFile: string): string => {
  if (reason.kind === "sources-missing")
    return `no sources file; run explain freshness sync ${pageFile}`;
  const source = formatRef({ repo: reason.repo, path: reason.path, ranges: [] });
  switch (reason.kind) {
    case "not-recorded":
      return `${source} is cited but not hashed`;
    case "not-cited":
      return `${source} is hashed but no longer cited`;
    case "missing":
      return `${source} no longer exists`;
    case "changed":
      return `${source} changed`;
  }
};

export const check = Command.make(
  "check",
  {},
  Effect.fnUntraced(function* () {
    const { docRoot, display } = yield* openDocRoot;
    let fresh = 0;
    let stale = 0;
    let unchecked = 0;
    for (const page of docRoot.pages) {
      if (page.status !== "parsed" || page.errors.length > 0) {
        unchecked++;
        yield* Console.log(`not checked ${display(page.file)}: run explain validate`);
        continue;
      }
      if (page.freshness.status === "fresh") {
        fresh++;
        continue;
      }
      stale++;
      yield* Console.log(`stale ${display(page.file)}`);
      for (const reason of page.freshness.reasons) {
        yield* Console.log(`  ${describeReason(reason, display(page.file))}`);
      }
    }
    yield* Console.log(
      `${docRoot.pages.length} pages: ${fresh} fresh, ${stale} stale, ${unchecked} not checked`,
    );
    if (stale > 0 || unchecked > 0) return yield* new ExitWith({ code: 1 });
  }),
).pipe(Command.withDescription("List stale pages and the cited files that changed"));
