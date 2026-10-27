import type { Position } from "@explain/contract/page";
import type { ParseResult } from "@explain/contract/parse-page";
import * as Effect from "effect/Effect";
import { PageDiagnostic } from "./page-diagnostic.ts";
import { refProblem } from "./resolve-source.ts";
import type { DocPage, DocRoot } from "./types.ts";

export interface PageContext {
  readonly existing: ReadonlySet<string>;
  readonly resolve: DocRoot["resolveSource"];
}

export const checkPage = Effect.fnUntraced(function* (
  { existing, resolve }: PageContext,
  id: string,
  parsed: ParseResult | undefined,
) {
  const file = `${id}.md`;
  const diagnostics: Array<PageDiagnostic> = [];
  const at = (
    make: (located: Omit<PageDiagnostic, "_tag">) => PageDiagnostic,
    position: Position,
    message: string,
  ) => diagnostics.push(make({ file, line: position.line, column: position.column, message }));
  if (parsed === undefined) {
    at(
      PageDiagnostic.MissingPage,
      { line: 1, column: 1 },
      `${file} is missing; nav lists page "${id}"`,
    );
    return { id, file, status: "missing", diagnostics } satisfies DocPage;
  }

  for (const error of parsed.errors) at(PageDiagnostic.Parse, error, error.message);
  const page = parsed.page;
  if (page === undefined) {
    return { id, file, status: "invalid", diagnostics } satisfies DocPage;
  }

  for (const { ref, at: position } of page.refs) {
    const resolved = yield* resolve(ref.repo, ref.path);
    const problem = refProblem(ref, resolved);
    if (problem === undefined) continue;
    at(
      resolved.status === "unknown-repo" || resolved.status === "escapes"
        ? PageDiagnostic.CitationRepo
        : PageDiagnostic.CitationFile,
      position,
      problem,
    );
  }
  for (const link of page.pageLinks) {
    if (!existing.has(link.page)) {
      at(PageDiagnostic.PageLink, link.at, `page link to "${link.page}" has no ${link.page}.md`);
    }
  }

  diagnostics.sort((a, b) => a.line - b.line || a.column - b.column);
  return { id, file, status: "parsed", page, diagnostics } satisfies DocPage;
});
