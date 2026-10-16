---
name: explain-this
description: Write or refresh pages in an explain doc root.
disable-model-invocation: true
---

# Explain this

The doc root is the current directory. Confirm both preconditions first; when one fails, tell the user and stop:

- `explain.json` exists. When it is missing, ask the user to run `explain init --locales=<a,b>`.
- `explain` is on `PATH`. When it is not, tell the user the `explain` CLI is not installed.

[format.md](format.md) is the format of every file in the doc root; read it before writing a page.

[writing.md](writing.md) is how a page reads; read it before writing a page.

Pick the branch:

- **Write**: the user asks to explain something, or follows up on something already explained.
- **Refresh**: the user asks for stale pages, or names pages that are out of date.

## Write

1. **Scope.** Settle with the user what to cover: which repos, which parts of them, or which PR or commit range. A follow-up question is its own scope. Done when the user has named the scope.
2. **Survey.** Split the scope into components: parts a reader can understand one at a time. Add each repo to `explain.json` `repos` as a key and an absolute path. Done when every component has a name and the paths it covers.
3. **Pages.** Write one or more pages per component, in every locale of `explain.json`. Pages are free form. Cite the code behind each claim as `repo:path:ranges`, reading the cited lines as you write the sentence; mark what you could not confirm in code as inference. For a follow-up, extend existing pages or add new ones. Done when every component has its pages in every locale and each page passes every check in `writing.md`.
4. **Nav.** Edit `explain.json`: set `title` if it has none, and place every new page in `nav` where a reader would look for it. Done when every page you wrote is in `nav`.
5. **Validate.** Run `explain validate` on the pages you wrote or changed and fix every diagnostic; it always validates `explain.json` too. Then run `explain freshness sync` on those same pages. Done when `explain validate <your pages>` exits 0 and the sync succeeded.

## Refresh

1. Run `explain freshness check`. It lists each stale page with the source files that make it stale. When the user named pages, refresh those.
2. Read each listed source file in full, find what changed against the page's claims, and rewrite the affected parts. When check names no source file because the page's sources file is missing or malformed, read every file the page cites instead. When the change opens a part the page does not cover, survey it and write pages as in **Write** step 3 and 4.
3. Validate as in **Write** step 5, on every page you refreshed, including those whose claims still hold.

## Report

Reply with the pages you wrote or changed, the final `explain validate` output, and the command to view them: `explain dev`.
