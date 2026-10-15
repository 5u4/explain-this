---
name: explain-repo
description: Write an explain doc root, a cited wiki rendered by `explain dev`, for one or more source repos. Use when asked to explain a repo, generate its wiki, or document how a codebase works.
---

# Explain a repo

You coordinate. You survey the repos and plan the pages. Page subagents read code and write pages. You merge the glossary, validate, and review.

Run the `explain` CLI inside the doc root. When `explain` is not on `PATH`, run `bun <this skill directory>/../../packages/cli/src/main.ts` instead.

`explain get format` prints the contract for every file in the doc root. Read its output in full before step 2.

Inputs: each repo as a key and an absolute path, the doc root path, and the locales. The doc root lives outside every repo. Locales default to `en`.

## 1. Survey

For each repo:

- Count lines per module over every tracked file, tests included, leaving out generated files such as lockfiles: `git ls-files -z <prefix> | xargs -0 cat | wc -l`. A module is a workspace member (crate, package) or, without a workspace, a top-level directory. Tracked files outside every module form one more module per repo, `(root)`.
- Read the manifests, the entry points, the public declarations, and the short functions that wire modules together, enough to phrase each module's questions. A README, `AGENTS.md`, design doc, or code comment may point you to entry points, but it proves nothing. Take each module's role from the code it runs. Leave module bodies for the page writers.
- Find seams: a manifest that depends on another target repo. Record each pinned package with its rev or version, and compare the rev with that checkout's `HEAD`.

Done when every module of every repo has a row with repo, path, lines, and a one-line role citing the code files it came from.

## 2. Plan

Write `<doc root>/plan.md` and `<doc root>/explain.json`.

```md
# Plan

## Modules

| Repo | Module | Lines | Role | Pages |
|---|---|---|---|---|

## Pages

### <id>: <title in the default locale>

- Question: the one question this page answers for a new maintainer, in the default locale.
- Read: what the writer reads, in citation form: a directory prefix such as `xapi:crates/gate/src/`, a file, or a file with ranges.
- Lines: total lines under Read, counted as in step 1. A range counts its own length.

## Skipped

- `<repo>:<module>`: reason.

## Seams

- `<repo>` depends on `<repo>` (`<package>`, …) at `<rev>`; local `HEAD` is `<rev>`.
```

- A page answers a question a maintainer asks ("how does an order reach the exchange"). Directory layout suggests modules; it does not decide pages.
- `index` comes first. It says what the system is, maps the repos, and shows how the parts connect.
- Each pair of dependent repos gets one seam page. Pages may read the same files; each cites what its Question needs.
- Keep each page's Read under 4000 lines. Split a larger module into several questions.
- A question of the form "what does X provide" is a catalog, not an explanation. When a module repeats one pattern many times (endpoints, handlers, commands), plan one page that explains the pattern by following one instance end to end, and one catalog page per repo that lists every instance in a table. Pick for the walkthrough an instance that another repo or an entry point calls. A repo without such a pattern gets no catalog. A catalog's Read may exceed the cap, because its writer reads declarations, not bodies.
- `explain.json` nav lists exactly the planned page ids, grouped in reading order.

Done when every tracked file of every non-skipped module, except prose docs and generated files, lies under some page's Read, and every page has a Question, Read, and Lines.

Stop here. Show the user the module table, the page list with each question, the skipped modules, and the seams. Continue after they approve, applying their edits to both files.

## 3. Write pages

Dispatch one subagent per page, all in parallel. Each brief carries:

- the doc root path, the locale, and the page's id, title, Question, and Read;
- every other page's id, title, and Question, for cross links;
- the path of [`writing-pages.md`](writing-pages.md), which the writer reads in full first, together with the output of `explain get format`.

Done when every planned page exists in every locale and every writer has returned its term candidates.

## 4. Glossary

Merge the term candidates into `<locale>/glossary.md`, one `## Label {#id}` per term with a cited definition. Collapse duplicates to one id and rewrite the affected `term:` links.

Done when `explain check` reports no unknown term.

## 5. Validate

1. Run `explain check`. On exit code 2, fix each diagnostic or send it to a fresh writer for that page.
2. Run `explain hash <locale>/*.md` for each locale.
3. Run `explain check` again.

Done when `explain check` exits 0.

## 6. Coverage

For each module in `plan.md`, find a `*.sources.json` entry with that repo whose path lies under the module. Add each uncited module to a page's Read, or to Skipped with a reason, then rerun steps 3 to 5 for the pages you changed.

Done when every module is cited or skipped.

## 7. Review

Dispatch a fresh subagent per page. It reads the page and every cited range, and lists each sentence the cited lines do not support and each claim about code with no citation. A cited doc or comment does not support a claim about what the code does. Send the list to a fresh writer for that page, then rerun step 5.

Done when every page's review lists nothing.

## Report

Reply with the page list, the final `explain check` output, modules skipped and why, seam rev mismatches, and how many claims review corrected.
