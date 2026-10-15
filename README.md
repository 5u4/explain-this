<div align="center">
<h1>explain this</h1>
</div>

## Install the CLI

```sh
git clone https://github.com/5u4/explain-this.git
cd explain-this
bun install
cd packages/cli
bun link
```

To update, run `git pull && bun install` in the clone. You don't need to link again.

To uninstall, run `bun unlink` in `packages/cli`.

## Write docs with an agent

Install [`skills/explain-this`](skills/explain-this/SKILL.md) into your agent's skill directory. The
skill needs `explain` on `PATH` and runs only when you invoke it by name.

1. `cd` to the directory that will be the doc root and create it:

   ```sh
   explain init --locales=zh,en
   ```

2. In a coding agent started there, run `/skill:explain-this <what to explain>`, for example a repo,
   a feature, or a pull request. The agent settles the scope with you, splits it into components,
   writes their pages, and checks the result. Ask follow-up questions the same way.
3. When the code changes, `explain freshness check` lists the stale pages and the files behind them. Run
   `/skill:explain-this` again to refresh them.
