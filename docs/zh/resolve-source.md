# 解析源文件

引用用“仓库键 + 路径”指向一个文件，比如 `explain:packages/cli/src/main.ts`。把这一对变成字节的只有一个函数：`resolveSource`。页面检查、新鲜度哈希、开发服务器的源码接口都调用它；`explain build` 生成静态源码文件时，也是对每个被引用或被记录的文件请求同一个接口（[build.ts](explain:packages/cli/src/site/build.ts:23-40,55-63)）。所有使用者因此对“这个引用指向什么”看法一致。

## 先解析仓库，再解析文件

加载文档根时，`resolveRepos` 先把 `explain.json` 里每个仓库路径换成真实路径：

```ts file=explain:packages/cli/src/doc-root/resolve-source.ts:18-37
```

路径不存在或不是目录的仓库，会在 `explain.json` 上产生一条文档根错误，并且不进入 `repos` 映射，但键仍留在配置里。保存**真实路径**是为了下面的包含判断：比如 macOS 上 `/tmp` 是指向 `/private/tmp` 的符号链接，拿解析后的文件路径去和未解析的仓库根比前缀，就会把所有文件都判成越界。

`makeResolveSource` 返回真正的解析函数。它按仓库和路径缓存结果，缓存的寿命就是一次加载：

```ts file=explain:packages/cli/src/doc-root/resolve-source.ts:39-53
```

缓存键 `sourceKey` 用 NUL 字符把仓库键和路径连起来（[resolve-source.ts](explain:packages/cli/src/doc-root/resolve-source.ts:10)），仓库键里不可能出现这个字符，而仓库键在前，所以拼出来的键不会有歧义。缓存不会过期，是因为 `explain dev` 在监听到文件变化后会整体重新加载文档根，得到一份新缓存（[dev.ts](explain:packages/cli/src/site/dev.ts:29,34-37,69-78)）。

## 依次做的检查

<AnnotatedSource file="explain:packages/cli/src/doc-root/resolve-source.ts:54-70">
<Note lines="58">`explain.json` 的 `repos` 里根本没有这个键。</Note>
<Note lines="59-60">键存在，但 `resolveRepos` 因为路径不是目录而把它剔除了；这个仓库里的所有文件都算不存在。</Note>
<Note lines="61-62">路径本身、或者途经的符号链接指向不存在的东西时，`realPath` 失败。</Note>
<Note lines="63-65">真实路径必须落在仓库真实根目录之内。前缀后面多带一个分隔符，避免 `/work/repo-old` 冒充 `/work/repo` 的子路径。</Note>
<Note lines="66-67">目录、套接字、设备等都不能被引用。</Note>
<Note lines="68-69">到这里才真正读取字节，并据此计算行数。</Note>
</AnnotatedSource>

结果是一个按 `status` 区分的联合类型：

```ts file=explain:packages/cli/src/doc-root/types.ts:39-44
```

行数的算法是数换行字节，文件不以换行结尾时再加一（[countLines](explain:packages/cli/src/doc-root/resolve-source.ts:12-16)）。所以 `a\nb\n` 和 `a\nb` 都是两行，空文件是零行。引用的行号范围就和这个数比较。

## 为什么要有 `escapes`

光靠写法是逃不出仓库的：路径在到达解析器之前，`parseRef` 已经拒绝了绝对路径以及 `.`、`..` 段。

```ts file=explain:packages/contract/src/citation.ts:30-41
```

但一个全是普通段的路径，仍然可以经由符号链接离开仓库：`src/outside.ts` 可以是指向 `../../secret.ts` 的链接，`realPath` 会跟过去。对真实路径做前缀判断，拦的正是这种情况。CLI 测试专门造了这样一个链接，期望得到 `resolves outside the repo`：

```ts file=explain:packages/cli/test/explain.test.ts:235-246
```

这件事要紧，是因为开发服务器。查看器通过 `/@explain/api/source/<repo>/<path>` 取源码，而这个接口解析的是请求里写的任意路径，不限于页面引用过的：

```ts file=explain:packages/cli/src/site/api.ts:56-93
```

没有 `escapes` 的话，只要某个仓库里有一个指向家目录之类位置的符号链接，任何能访问开发服务器的客户端都能读到所有已配置仓库之外的文件（推断：代码里没有写明威胁模型）。有了它，接口返回 403。留在仓库内部的符号链接照常解析，只比较最终的真实路径。

## 从状态到诊断

`refProblem` 把状态翻译成页面上显示的消息：

```ts file=explain:packages/cli/src/doc-root/resolve-source.ts:74-92
```

`file` 只有在某个行号范围超出最后一行时才算问题。页面检查把每条消息变成一种诊断：`unknown-repo` 和 `escapes` 成为 `CitationRepo`，它让 `freshness check` 跳过页面；其余成为 `CitationFile`，新鲜度把它们看作代码发生了变化。两种都拒绝 `sync`。分流规则见[加载文档根](./load-doc-root.md)，字节如何被哈希见[新鲜度](./freshness.md)。
