# 命令

`explain` 是一个用 Effect CLI 写成的程序。每个子命令都很薄：打开文档根、挑出要处理的页面、打印诊断、把失败换成退出码。真正的检查几乎都在 `loadDocRoot` 里（见[加载文档根](./load-doc-root.md)）；命令只决定**报告什么**、**拒绝什么**。

## 入口

```ts file=explain:packages/cli/src/main.ts:1-16
```

根命令 `explain` 本身没有处理函数，只挂了五个子命令。`Command.run({ version: "0.1.0" })` 按这棵命令树解析命令行并执行选中的处理函数；`BunServices.layer` 提供处理函数需要的平台服务，文档根代码用到的是 [`FileSystem`、`Path`、`Crypto`](explain:packages/cli/src/doc-root/types.ts:59)；`BunRuntime.runMain` 把整个程序作为进程运行，并决定退出码。`freshness` 同样只是一个分组，下面挂着 [`check` 和 `sync`](explain:packages/cli/src/commands/freshness.ts:5-8)。

<Tree open="2">

- packages/cli/src/commands/
  - [init.ts](explain:packages/cli/src/commands/init.ts) 在当前目录写 `explain.json`
  - [validate.ts](explain:packages/cli/src/commands/validate.ts) 报告阻止渲染的问题
  - [freshness.ts](explain:packages/cli/src/commands/freshness.ts) `check` 与 `sync` 的分组
  - freshness/
    - [check.ts](explain:packages/cli/src/commands/freshness/check.ts) 列出过期页面
    - [sync.ts](explain:packages/cli/src/commands/freshness/sync.ts) 记录被引用文件的哈希
  - [dev.ts](explain:packages/cli/src/commands/dev.ts) 本地预览并在变更时重载
  - [build.ts](explain:packages/cli/src/commands/build.ts) 输出静态站点
  - [open-doc-root.ts](explain:packages/cli/src/commands/open-doc-root.ts) 除 `init` 外所有命令共用的准备步骤
  - [exit-with.ts](explain:packages/cli/src/commands/exit-with.ts) 携带退出码的错误

</Tree>

所有命令都是同一个形状：`Command.make(名字, 参数配置, 处理函数)`。参数配置里用 `Flag.*` 声明选项、用 `Argument.*` 声明位置参数；处理函数是一个 `Effect.fnUntraced` 生成器，拿到的是已经解析好的值。几个值得注意的声明：

| 命令 | 参数声明 | 含义 |
|---|---|---|
| `init` | [`Flag.String("locales")`](explain:packages/cli/src/commands/init.ts:13) | 必填，逗号分隔 |
| `validate` | [`Argument.variadic()`](explain:packages/cli/src/commands/validate.ts:10) | 零个或多个页面；不给就检查全部 |
| `freshness sync` | [`Argument.atLeast(1)`](explain:packages/cli/src/commands/freshness/sync.ts:11) | 至少一个页面 |
| `dev` | [`Flag.withDefault(4321)`](explain:packages/cli/src/commands/dev.ts:11) | 端口默认 4321 |
| `build` | [`Flag.optional`](explain:packages/cli/src/commands/build.ts:12) | 不给 `--out` 就写到文档根下的 `dist` |

## 共用的开场：openDocRoot

除了 `init`，每个命令第一步都是 `yield* openDocRoot`：

```ts file=explain:packages/cli/src/commands/open-doc-root.ts:19-43
```

`findDocRoot` 从当前目录逐级向上找 `explain.json`（[config.ts](explain:packages/cli/src/doc-root/config.ts:25-35)），所以在文档根的任何子目录里都能运行命令。只有两种失败会让命令无从下手：向上找不到 `explain.json`，或者它不符合 schema。这两种在这里被捕获、打印，然后变成退出码 2。其余问题都作为数据挂在返回的 `DocRoot` 上，由各命令自己决定怎么处理。`display` 把诊断里的路径改写成相对于你运行命令的位置。

`init` 不走这条路，因为它要求文档根还不存在。它在写文件之前先用加载时同一个 `decodeConfig` 校验自己要写的内容，所以非法的语言标签会被拒绝，磁盘上什么也不留下：

```ts file=explain:packages/cli/src/commands/init.ts:17-25
```

## 页面参数如何解析

`validate` 和 `sync` 接收页面路径，由 `pagesFromArguments` 映射到 `DocPage`：

```ts file=explain:packages/cli/src/commands/open-doc-root.ts:45-62
```

参数先相对当前目录解析成绝对路径，再换成相对文档根、以 `/` 分隔的路径，最后与每个页面的 `file`（固定是 `<locale>/<id>.md`）逐字比较。因此在文档根运行 `explain validate zh/commands.md`，和在 `zh/` 里运行 `explain validate commands.md` 指的是同一页。

> [!NOTE]
> `DocRoot` 里只有 `nav` 列出的页面。一个不在 `nav` 里的 Markdown 文件会得到 “is not a page of the doc root”。未知参数不会打断其他参数的处理，但命令最后会以 2 退出。

## 各命令读哪些诊断

解析成功的页面带两份列表：`errors` 和 `refProblems`（为什么分两份见[加载文档根](./load-doc-root.md)）。命令对它们的取舍不同：

```ts file=explain:packages/cli/src/commands/open-doc-root.ts:64-65
```

<Tabs>
<Tab label="validate">

```ts file=explain:packages/cli/src/commands/validate.ts:11-21
```

`validate` 总会带上文档根级别的 `errors`（`explain.json` 里的仓库、`widgets/`），再加上所选页面的 `pageDiagnostics`。

</Tab>
<Tab label="freshness sync">

```ts file=explain:packages/cli/src/commands/freshness/sync.ts:12-28
```

`sync` 逐页处理：有任何诊断的页面被拒绝，其余页面照常写入；只要有一页被拒，最后就以 2 退出。

</Tab>
<Tab label="freshness check">

```ts file=explain:packages/cli/src/commands/freshness/check.ts:28-53
```

`check` 只看 `page.errors`，不看 `refProblems`。所以被引用的文件被删掉时，页面在这里显示为过期，而不是“未检查”。

</Tab>
<Tab label="build">

```ts file=explain:packages/cli/src/commands/build.ts:15-21
```

`build` 对所有页面要求零诊断；`dev` 则只要 `openDocRoot` 成功就会启动，带着错误的页面也照样能预览。站点本身见[站点](./site.md)。

</Tab>
</Tabs>

## 退出码

处理函数从不调用 `process.exit`，而是以一个带标签的错误失败：

<AnnotatedSource file="explain:packages/cli/src/commands/exit-with.ts:1-9">
<Note lines="4">类型上只允许 1 或 2；0 就是处理函数正常结束。</Note>
<Note lines="5-7">`runMain` 读取这个属性作为进程退出码，代替默认的 1。</Note>
<Note lines="8">处理函数在失败前已经把原因打印出来了，这里告诉运行时不要再把错误对象打印一遍。</Note>
</AnnotatedSource>

| 退出码 | 含义 |
|---|---|
| 0 | 成功 |
| 1 | `freshness check`：文档根合法，但有过期或未能检查的页面 |
| 2 | 拒绝执行：找不到文档根、`explain.json` 不合法、页面有诊断、页面参数未知、`init` 时 `explain.json` 已存在、开发服务器或构建失败 |

> [!WARNING]
> 由 Effect CLI 自己拒绝的用法错误，比如 `explain freshness sync` 不带页面、或子命令拼错，会打印帮助并以 1 退出（运行 CLI 观察到的行为，这部分逻辑在 Effect 里，不在本仓库）。所以脚本仅凭退出码 1 分不清“页面过期”和“命令写错了”。
