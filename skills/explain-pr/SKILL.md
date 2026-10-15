---
name: explain-pr
description: Write an explain doc root for one pull request or commit range, a cited site that checks every claim the PR makes against the code before and after it. Use when asked to explain a PR, a diff, or what changed between two commits. For a whole codebase, use explain-repo.
---

# Explain a PR

You coordinate. You collect the PR, survey the diff, and plan the pages. Page subagents read code and write pages. You merge the glossary, validate, review, and build.

[`../../docs/format.md`](../../docs/format.md) is the contract for every file in the doc root. Read it in full before step 2. Run the `explain` CLI as [`../explain-repo/SKILL.md`](../explain-repo/SKILL.md) says.

Inputs: a PR (URL or `owner/repo#N`) or a commit range `A..B`, the absolute path of a local clone, the doc root path, and the locales. Each PR gets its own doc root, named `<repo>-pr-<N>`, outside the clone. Locales default to `en`.

## 1. Collect

1. Resolve the commits. For a PR, read `gh pr view <N> -R <owner/repo> --json number,title,body,url,state,baseRefOid,headRefOid,mergeCommit,commits,reviews,comments,additions,deletions,changedFiles`. Head is `headRefOid`. Base is `git merge-base <baseRefOid> <headRefOid>`, the commit GitHub diffs against. For a range, head is `B` and base is `git merge-base A B`. When `git cat-file -e <oid>^{commit}` fails, run `git fetch origin pull/<N>/head` or `git fetch origin <oid>`.
2. Write `<doc root>/pr.md`. Its first line says the file holds claims to check against code and is never evidence. Then, verbatim: title, URL, state, base and head ids, size; every commit oldest first with subject and body (`git log --reverse --format='%h %s%n%n%b' <base>..<head>`); the description; every review and conversation comment with its author; every inline review comment from `gh api repos/<owner>/<repo>/pulls/<N>/comments` with its path and line. A range has only the commits.
3. Write `explain.json`. Pin key `<repo>-base` to base and key `<repo>` to head, both with the clone's path. Pin one more key, `<repo>-<short id>`, for an intermediate commit only when step 2 plans a page that compares against it.
4. Survey. Read `git diff --stat <base> <head>` and the full diff, then the code around each hunk. Find the callers of each changed or deleted declaration, at head and at base. For each claim in `pr.md`, find the code that can confirm or refute it, and record a search that found nothing as the command and the commit it ran at.

Done when every changed file has a row with path, lines at head (or `deleted (N at base)`), and kind (code, test, doc, generated), and every claim in `pr.md` has a lead.

## 2. Plan

Write `<doc root>/plan.md` and the `nav` of `explain.json`.

```md
# Plan

PR: <url>. Base `<id>`: <how it was chosen>. Head `<id>`.

- `<key>` pins `<path>` at `<id>`.
- Diff: `git -C <path> diff <base> <head>` (<files> files, +<added> −<deleted>).

## Changed files

| Path | Lines at head | Kind | Pages |
|---|---|---|---|

## Pages

### <id>: <title in the default locale>

- Question: the one question this page answers for a reviewer, in the default locale.
- Read: citations naming the side they read, such as `tael-base:src/query.ts:40-120`.
- Lines: total lines under Read. A file read at both commits counts twice.
- Leads: survey facts the writer must confirm in code.

## Skipped

- `<path>`: reason.
```

- Nav has three groups in this order: overview, changes, review. Titles are in each locale.
- `index` is the overview. Its plan entry numbers every claim in `pr.md` (the title, each commit, each point of the description, each review point) and names the page that explains it. The page gives each claim a verdict against the code: holds, partly holds (and which part), does not hold, or not checkable from code. It ends with the reading order.
- Change pages follow intent, not files or commits. Each answers how one behavior moved from base to head. A diff that fits one Read gets one change page.
- Plan a review page `risks` when the PR deletes or weakens tests, changes stored data or a schema, changes a public contract, or claims tradeoffs, risks, or verification. It covers costs the PR does not state, what now guards the behavior of each deleted test, and what the stated verification covers and misses. Without it, `index` covers these in its verdicts.
- Keep each Read under 4000 lines. Read ranges around the hunks rather than whole files on both sides.
- A doc changed by the PR (README, `AGENTS.md`, design doc) is a claim like `pr.md`. When the change is a policy, the page that owns it says what the text now requires.

Done when every changed file except generated files lies under some page's Read or in Skipped, and every claim in `pr.md` maps to a page.

Stop here unless the user asked for the whole run. Show the changed files, the pages with their questions, and the claim-to-page map. Continue after they approve, applying their edits to both files.

## 3. Write pages

Run step 3 of [`../explain-repo/SKILL.md`](../explain-repo/SKILL.md). Each brief also carries the path of `pr.md`, the page's Leads, and the path of [`writing-pr-pages.md`](writing-pr-pages.md), which the writer reads after `writing-pages.md`.

## 4. Glossary and 5. Validate

Run steps 4 and 5 of [`../explain-repo/SKILL.md`](../explain-repo/SKILL.md).

## 6. Coverage

For each changed file in `plan.md` that is not skipped, find a `*.sources.json` entry for that path under either key. Add each uncited file to a page's Read, or to Skipped with a reason, then rerun steps 3 to 5 for the pages you changed.

Done when every changed file is cited or skipped.

## 7. Review

1. Extract each pinned commit for reviewers without a shell: `mkdir -p <scratch>/<key> && git -C <path> archive <commit> | tar -x -C <scratch>/<key>`.
2. Dispatch a fresh read-only subagent per page with the page, `pr.md`, `writing-pr-pages.md`, and the map from each key to its extracted tree. It reads every cited range and lists each sentence the cited lines do not support, each claim about code with no citation, each citation on the wrong side, and each verdict the code contradicts.
3. Send each list to a fresh writer for that page, then rerun step 5.
4. Review again every page whose text changed. Fixes introduce new errors.

Done when a round lists nothing for every page.

## 8. Build

Run `explain build`. Serve `dist/` with any static server and open `index` to check it loads.

## Report

Reply with the page list and questions, the verdict count from `index` with each claim that does not hold, the files skipped and why, how many claims review corrected over how many rounds, the final `explain check` output, and the `dist/` path.
