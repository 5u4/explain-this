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

In a coding agent started in the repo you are asking about, run `/skill:explain-this <question>`.
The agent writes pages under `~/.explain/<date>-<slug>/`, copies the code they cite there, validates
them, and gives you `explain open <dir>` to view them with live reload. Follow-up questions go to
the same dir.
