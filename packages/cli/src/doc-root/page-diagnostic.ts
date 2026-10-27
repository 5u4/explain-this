import type * as Api from "@explain/viewer/api";
import * as Data from "effect/Data";

export type PageDiagnostic = Api.PageDiagnostic;

export const PageDiagnostic = Data.taggedEnum<PageDiagnostic>();
