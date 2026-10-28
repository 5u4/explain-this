---
name: explain-this
description: Write a throwaway explain doc under ~/.explain that answers the user's question about code.
disable-model-invocation: true
---

# Explain this

Confirm `explain` is on `PATH` first. When it is not, tell the user the `explain` CLI is not installed and stop.

[format.md](format.md) is the format of every file in the doc dir; read it before writing a page.

[writing.md](writing.md) is how a page reads; read it before writing a page.

The user's question is the scope.

## Steps

1. **Dir.** Run `date +%Y%m%d` and pick a short kebab-case slug from the question. The doc dir is `~/.explain/<date>-<slug>/`. When that dir exists, pick another slug. A follow-up on the same question uses the same dir. Done when the dir exists and is yours.
2. **Code.** Copy every file you will cite, whole, with shell commands only. Never write a file under `code/` with a write or edit tool. From a work tree:

   ```sh
   mkdir -p <dir>/code/<key>/<parent>
   cp <path> <dir>/code/<key>/<path>
   ```

   From a revision:

   ```sh
   mkdir -p <dir>/code/<key>/<parent>
   git show <rev>:<path> > <dir>/code/<key>/<path>
   ```

   `<path>` is the repo-relative path, kept as is, so line numbers and citations match the source. `<key>` matches `^[a-z][a-z0-9-]*$`. Two versions of the same code are two keys, such as `app-main` and `app-pr`; name the revision or sha in the prose. Done when every file you cite is under `code/<key>/`.
3. **Pages.** Write top-level `*.md` files in the doc dir. Each filename stem matches `^[a-z0-9][a-z0-9-]*$`; prefix numbers (`01-overview.md`) when order matters. The first file by name is the entry page. Write the whole doc in one language, the language the user asked in. Cite the code behind each claim as `<key>:<path>[:<ranges>]`, reading the cited lines as you write the sentence; mark what you could not confirm in code as inference. For a follow-up, extend existing pages or add new ones. Done when the pages answer the question and each passes every check in `writing.md`.
4. **Validate.** Run `explain validate <dir>` and fix every diagnostic. Done when it exits 0.

## Report

Reply with the pages you wrote or changed, the final `explain validate` output, and the command for the user to view them: `explain open <dir>`. Do not run `explain open` yourself; it serves until stopped.
