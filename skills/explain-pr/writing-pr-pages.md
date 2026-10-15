# Writing a PR page

You write one page of a PR doc root. Follow [`../explain-repo/writing-pages.md`](../explain-repo/writing-pages.md); this file adds the rules for a PR.

## Sides

- `<repo>-base` is the code before the PR and `<repo>` the code after. Cite each claim on the side it is about: removed behavior on base, new behavior on head, unchanged behavior on both.
- Line numbers drift between the sides. Take each side's numbers from that side's file.
- `pr.md` and the docs the PR changes are claims. Quote a claim to check it; never cite it as evidence.

## Diffs

- Show changed code with `<Diff>`. Find the ranges with `git -C <path> diff -U0 <base> <head> -- <file>`: hunk `@@ -a,b +c,d @@` covers base lines `a` to `a+b-1` and head lines `c` to `c+d-1`. Add the same context on both sides.
- One `<Diff>` per hunk or run of nearby hunks. For a file with many similar hunks, show the representative ones and say how many others repeat the change.
- When a `<Diff>` shows a block as removed and added but only its indentation or position changed, say so in the prose.

## Evidence no file holds

- A claim that something is absent ("no other caller", "nothing reads it in that order") is a search. Run `git -C <path> grep -n <pattern> <commit> -- <paths>` at the commit the claim is about, and show the command and its result as a fenced `sh` block. When no single command proves the absence, mark it as inference and say how you checked.
- A fact about commits, such as which commit deleted a file, is shown the same way with `git show --stat <id>`.
- Runtime facts (query plans, test counts, timing, what a migration does to an existing database) are not in the code. Mark them as inference, or show the command you ran, its output, and the commit it ran at.
