import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { repoKeyProblem } from "./citation.ts";

export const pageIdPattern = /^[a-z0-9][a-z0-9-]*$/;

export const glossaryPageId = "glossary";

const reservedPageIds: Readonly<Record<string, true>> = { glossary: true, source: true };

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

const LocalizedString = Schema.Record(Schema.String, Schema.String);

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
  title: LocalizedString,
  pages: Schema.Array(PageId),
});

export const ExplainConfig = Schema.Struct({
  title: LocalizedString,
  locales: Schema.Array(Locale).check(
    Schema.isMinLength(1, { message: "locales must not be empty" }),
    Schema.isUnique({ message: "locales must be unique" }),
  ),
  defaultLocale: Locale.pipe(Schema.withDecodingDefaultKey(Effect.succeed("en"))),
  repos: Repos,
  nav: Schema.Array(NavGroup),
}).check(
  Schema.makeFilter((config) => {
    const issues: Array<Schema.FilterIssue> = [];
    if (!config.locales.includes(config.defaultLocale)) {
      issues.push({
        path: ["defaultLocale"],
        issue: `defaultLocale "${config.defaultLocale}" is not listed in locales`,
      });
    }
    const missingLocales = (text: Readonly<Record<string, string>>) =>
      config.locales.filter((locale) => !Object.hasOwn(text, locale));
    for (const locale of missingLocales(config.title)) {
      issues.push({ path: ["title"], issue: `title has no "${locale}" entry` });
    }
    const seen = new Set<string>();
    config.nav.forEach((group, groupIndex) => {
      for (const locale of missingLocales(group.title)) {
        issues.push({
          path: ["nav", groupIndex, "title"],
          issue: `nav title has no "${locale}" entry`,
        });
      }
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
