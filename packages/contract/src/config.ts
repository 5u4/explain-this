import * as Schema from "effect/Schema";
import * as SchemaTransformation from "effect/SchemaTransformation";
import { repoKeyProblem } from "./citation.ts";

export const pageIdPattern = /^[a-z0-9][a-z0-9-]*$/;

const reservedPageIds: Readonly<Record<string, true>> = { source: true };

const localePattern = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$/;

const Locale = Schema.String.check(
  Schema.isPattern(localePattern, { message: "locale must be a BCP 47 tag such as en or zh-CN" }),
);

const PageId = Schema.String.check(
  Schema.isPattern(pageIdPattern, { message: `page id must match ${pageIdPattern.source}` }),
  Schema.makeFilter(
    (id: string) => !Object.hasOwn(reservedPageIds, id) || `page id "${id}" is reserved`,
  ),
);

const RepoPath = Schema.String.check(
  Schema.makeFilter(
    (path: string) => path.startsWith("/") || `repo path "${path}" must be absolute`,
  ),
);

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

const Locales = Schema.Array(Locale).pipe(
  Schema.refine((locales): locales is readonly [string, ...Array<string>] => locales.length > 0, {
    message: "locales must not be empty",
  }),
  Schema.check(Schema.isUnique({ message: "locales must be unique" })),
);

const ExplainConfigFields = {
  title: Schema.optionalKey(Schema.String),
  locales: Locales,
  repos: Repos,
  nav: Schema.Array(NavGroup),
};

const ExplainConfigFile = Schema.Struct({
  ...ExplainConfigFields,
  defaultLocale: Schema.optionalKey(Locale),
});

export const ExplainConfig = ExplainConfigFile.pipe(
  Schema.decodeTo(
    Schema.toType(Schema.Struct({ ...ExplainConfigFields, defaultLocale: Locale })),
    SchemaTransformation.transform({
      decode: ({ defaultLocale, ...config }) => ({
        ...config,
        defaultLocale: defaultLocale ?? config.locales[0],
      }),
      encode: (config) => config,
    }),
  ),
).check(
  Schema.makeFilter((config) => {
    const issues: Array<Schema.FilterIssue> = [];
    if (!config.locales.includes(config.defaultLocale)) {
      issues.push({
        path: ["defaultLocale"],
        issue: `defaultLocale "${config.defaultLocale}" is not listed in locales`,
      });
    }
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
