# 新鲜度

页面是对不断变化的代码所做的一组断言。新鲜度就是 `explain` 发现“代码变了”的办法：同步页面时，记下它引用的每个文件的哈希；此后只要“页面现在引用什么”“当时记录了什么”“磁盘上现在是什么”三者有任何出入，页面就是**过期**的。新鲜度从不读页面正文，它只负责指出哪些页面需要有人回去重读代码。

## 三份来源清单

每个解析成功的页面，在 `checkPage` 里都会得到三份清单（见[加载文档根](./load-doc-root.md)）：

| 名称 | 内容 |
|---|---|
| `cited` | 页面当前引用的每个不重复的仓库加路径，来自链接、摘录、`AnnotatedSource`、`Diff` |
| `sources` | `cited` 中能解析成文件的那些，各带当前哈希 |
| `recorded` | `.sources.json` 里的记录；没有这个文件时是 `undefined` |

`explain freshness sync` 把 `sources` 写进 `<locale>/<id>.sources.json`：

```ts file=explain:packages/cli/src/doc-root/freshness.ts:72-76
```

`formatSourcesFile` 按仓库再按路径排序，两空格缩进，以换行结尾：

```ts file=explain:packages/contract/src/sources.ts:41-46
```

所以对没变的页面再同步一次，写出的文件逐字节相同，测试专门断言了这一点（[explain.test.ts](explain:packages/cli/test/explain.test.ts:80-87)）；`git diff` 里看到的 `.sources.json` 改动都是真实变化。`SourceFile`、`StaleReason`、`Freshness` 这些类型由 contract 包定义，查看器也在用，见[来源记录](./sources.md)。

## 哈希：git 的 blob id

<AnnotatedSource file="explain:packages/cli/src/doc-root/freshness.ts:17-32">
<Note lines="19">整个加载过程共用一份缓存，键与解析器缓存相同；同一个文件被多页引用也只算一次。</Note>
<Note lines="23-26">在字节前加上 `blob <长度>` 和一个 NUL，这正是 git 计算对象 id 前的封装方式。</Note>
<Note lines="27-28">通过 Effect 的 `Crypto` 服务算 SHA-1，输出 40 位小写十六进制。</Note>
</AnnotatedSource>

结果与 `git hash-object --no-filters` 对同一文件给出的 id 相同，测试直接拿两者比较：

```ts file=explain:packages/cli/test/explain.test.ts:27-28
```

文件不需要提交，甚至不需要被 git 跟踪：字节是经由[解析源文件](./resolve-source.md)从磁盘读的。选用 git 的格式而不是裸 SHA-1，好处是记录下的哈希能直接和 git 里同一内容的对象 id 对上（推断：代码没有说明选择理由）。

> [!IMPORTANT]
> 哈希覆盖整个文件，而不只是被引用的那几行。被引用文件的任何改动，哪怕离引用范围很远，都会让所有引用它的页面过期。

## 什么让页面过期

`compareSources` 比较三份清单，返回 `fresh`，或者 `stale` 加一组原因：

```ts file=explain:packages/cli/src/doc-root/freshness.ts:34-70
```

| 原因 | 条件 | `freshness check` 的输出 |
|---|---|---|
| `sources-missing` | 根本没有 `.sources.json`；此时不再计算其他原因 | no sources file; run explain freshness sync … |
| `sources-malformed` | `.sources.json` 解码失败；由 `checkPage` 设置，不经过 `compareSources` | … is malformed; run explain freshness sync … |
| `not-recorded` | 现在引用了，但记录里没有 | … is cited but not hashed |
| `not-cited` | 记录里有，但已经不再引用 | … is hashed but no longer cited |
| `missing` | 记录了也还在引用，但已解析不到文件 | … no longer exists |
| `changed` | 记录了也还在引用，当前哈希不同 | … changed |

输出文案来自 `describeReason`（[check.ts](explain:packages/cli/src/commands/freshness/check.ts:10-26)）。原因按仓库和路径排序，输出稳定。

几个容易忽略的推论：

- 引用的**文件集合**变了，即使代码没动，页面也会过期：加了引用没同步是 `not-recorded`，删掉某文件的最后一处引用是 `not-cited`。只改同一文件内的行号范围则不影响新鲜度，因为文件集合和字节都没变。
- 被引用文件被删除，是新鲜度事件而不是硬错误。“does not exist” 是一条 `CitationFile` 诊断，它不会让 `check` 跳过页面，所以页面以 `missing` 原因显示为过期（[explain.test.ts](explain:packages/cli/test/explain.test.ts:108-115)）。
- 文件变短到引用范围之外时，`check` 报 `changed`，而 `sync` 会拒绝，直到页面改好（[explain.test.ts](explain:packages/cli/test/explain.test.ts:117-125)）。

## 两个命令

| | `freshness check` | `freshness sync page.md...` |
|---|---|---|
| 范围 | 全部页面，不接受参数 | 只处理列出的页面 |
| 跳过 / 拒绝 | 缺失、解析失败，或有跳过检查的诊断（解析错误、`CitationRepo`）的页面记为 not checked | 解析失败，或有拒绝同步的诊断（解析错误、任何引用问题）的页面拒绝同步；坏的页面链接不挡 |
| 写入 | 无 | 每页一个 `.sources.json` |
| 退出码 | 有过期或未检查的页面时为 1，否则 0 | 有页面被拒或参数未知时为 2，否则 0 |

见 [check.ts](explain:packages/cli/src/commands/freshness/check.ts:36-57) 和 [sync.ts](explain:packages/cli/src/commands/freshness/sync.ts:17-27)。`sync` 之所以连 `CitationFile` 也拒绝，是因为给一个还引用着已删除文件的页面记哈希，等于悄悄认可了一条坏引用；先改页面，再同步。

> [!NOTE]
> `.sources.json` 解码失败时，页面会得到一条 `SourcesRecord` 诊断，新鲜度变为过期，唯一原因是 `sources-malformed`（[check-page.ts](explain:packages/cli/src/doc-root/check-page.ts:89-112)）。`check` 打印 `<来源文件> is malformed; run explain freshness sync <页面>`。`SourcesRecord` 不拒绝同步，因为同步本来就会覆盖这个文件，所以照提示运行一次就修好了（[explain.test.ts](explain:packages/cli/test/explain.test.ts:191-215)）。

## 在查看器里

开发服务器和静态构建都会把每页的新鲜度交给查看器：导航项的状态是 `missing`、`invalid`（解析失败或有跳过检查的诊断），或者页面自己的 `fresh` / `stale`（[api-bodies.ts](explain:packages/cli/src/site/api-bodies.ts:18-27)）。查看器在导航栏里标出过期页面（[rail.tsx](explain:packages/viewer/src/shell/rail.tsx:72-73)），并在页面上显示新鲜或过期的标记（[freshness.tsx](explain:packages/viewer/src/routes/freshness.tsx:10-20)）。界面部分见[查看器外壳](./viewer-shell.md)和[源码面板](./source-pane.md)。
