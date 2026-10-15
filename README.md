# explain-this

explain-this turns a codebase or a pull request into a documentation site where every claim links
to the lines of code that back it. Agent skills write the pages. The `explain` CLI validates them,
records the hash of every cited file, marks a page stale when a cited file changes, and serves or
builds the site.

The docs live in a doc root: a directory outside the source repos that the repos never track.
[`docs/format.md`](docs/format.md) is the contract for everything in it.

## Install the CLI

You need [Bun](https://bun.sh) and Git.

```sh
git clone https://github.com/5u4/explain-this.git
cd explain-this
bun install
cd packages/cli
bun link
```

`bun link` puts `explain` in `~/.bun/bin`, which the Bun installer adds to your `PATH`. The command
runs the source in your clone, so keep the clone where it is. If you move or delete it, `explain`
stops working.

To update, run `git pull && bun install` in the clone. You don't need to link again.

To uninstall, run `bun unlink` in `packages/cli`.

## Write docs with an agent

The skills in [`skills/`](skills) drive an agent through the whole process: survey, plan, write
pages in parallel, review every page against the code, and build.

| Skill | Use it to |
|---|---|
| [`explain-repo`](skills/explain-repo/SKILL.md) | write a wiki for one or more repos |
| [`explain-pr`](skills/explain-pr/SKILL.md) | explain one pull request or commit range, and check every claim the PR makes against the code before and after it |

Install both directories together into your agent's skill directory. `explain-pr` links to files in
`explain-repo`. The skills expect `explain` on `PATH`, and they work best in an agent that can run
subagents in parallel. `explain-pr` reads the pull request with the GitHub CLI, `gh`.

## Run the CLI in a doc root

Every command except `get` finds the doc root by walking up from the current directory to
`explain.json`.

| Command | What it does |
|---|---|
| `explain check` | Validates every page and lists stale pages. Exits 0 when every page is fresh, 1 when a page is stale, and 2 when a page or `explain.json` is invalid. |
| `explain hash <page.md...>` | Records the hash of every file the pages cite, which marks the pages fresh. |
| `explain dev [--port 4321]` | Serves the site and reloads it when a page or a cited file changes. |
| `explain build [--out dist]` | Writes the site as static files. The default output is `dist/` in the doc root. |
| `explain get format` | Prints the doc root format contract. |

A built site has these limits:

- Serve it from the root of a domain. It does not work under a subpath.
- It contains the full text of every cited source file. Do not publish a site built from a private
  repo.
- It shows freshness as of the build.

## Develop

```sh
bun install
bun run typecheck
bun run lint
bun run test
```

Read [`AGENTS.md`](AGENTS.md) before you change code.
