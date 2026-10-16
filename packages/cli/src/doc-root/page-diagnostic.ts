import type * as Api from "@explain/viewer/api";
import * as Data from "effect/Data";

export type PageDiagnostic = Api.PageDiagnostic;

export const PageDiagnostic = Data.taggedEnum<PageDiagnostic>();

interface Policy {
  readonly refusesSync: boolean;
  readonly skipsCheck: boolean;
}

export const diagnosticPolicy: { readonly [Tag in PageDiagnostic["_tag"]]: Policy } = {
  MissingPage: { refusesSync: true, skipsCheck: true },
  Parse: { refusesSync: true, skipsCheck: true },
  CitationRepo: { refusesSync: true, skipsCheck: true },
  CitationFile: { refusesSync: true, skipsCheck: false },
  PageLink: { refusesSync: false, skipsCheck: false },
  SourcesRecord: { refusesSync: false, skipsCheck: false },
};

export const diagnosticsThat = (
  rule: keyof Policy,
  diagnostics: ReadonlyArray<PageDiagnostic>,
): ReadonlyArray<PageDiagnostic> =>
  diagnostics.filter((diagnostic) => diagnosticPolicy[diagnostic._tag][rule]);
