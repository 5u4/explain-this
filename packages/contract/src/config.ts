import * as Schema from "effect/Schema";
import { repoKeyProblem } from "./citation.ts";

export const pageIdPattern = /^[a-z0-9][a-z0-9-]*$/;

const PageId = Schema.String.check(
  Schema.isPattern(pageIdPattern, { message: `page id must match ${pageIdPattern.source}` }),
);

const RepoPath = Schema.String.check(Schema.isNonEmpty({ message: "repo path must not be empty" }));

const Repos = Schema.Record(Schema.String, RepoPath).check(
  Schema.makeFilter((repos: Readonly<Record<string, string>>) =>
    Object.keys(repos).flatMap((key) => {
      const issue = repoKeyProblem(key);
      return issue === undefined ? [] : [{ path: [key], issue }];
    }),
  ),
);

const NavGroup = Schema.Struct({
  title: Schema.String,
  pages: Schema.Array(PageId),
});

export const ExplainConfig = Schema.Struct({
  title: Schema.optionalKey(Schema.String),
  repos: Repos,
  nav: Schema.Array(NavGroup),
}).check(
  Schema.makeFilter((config) => {
    const issues: Array<Schema.FilterIssue> = [];
    const seen = new Set<string>();
    config.nav.forEach((group, groupIndex) => {
      group.pages.forEach((page, pageIndex) => {
        if (seen.has(page)) {
          issues.push({
            path: ["nav", groupIndex, "pages", pageIndex],
            issue: `page "${page}" appears more than once in nav`,
          });
        }
        seen.add(page);
      });
    });
    return issues;
  }),
);

export type ExplainConfig = typeof ExplainConfig.Type;

export const navPageIds = (config: ExplainConfig): ReadonlyArray<string> =>
  config.nav.flatMap((group) => group.pages);
