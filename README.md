# Source Runtime Lab - 9 Legado Sources

这是一个 Bun + Vite + React 的书源运行测试环境。目标是在不公开 App / Swift runtime 源码的情况下，让数据源作者测试新协议书源。

本版本把你提供的 Legado JSON 里的 9 个书源全部迁移成新协议模块：

1. 七猫小说（JH 迁移版）
2. 书旗小说（JH 迁移版）
3. 番茄小说（fqgo 迁移版）
4. 光遇聚合（迁移版）
5. 番茄四合一（知秋段评）迁移版
6. 七猫-明月（迁移版）
7. xi~番茄 v3.0.0（迁移版）
8. 番茄-明月（迁移版）
9. 69-明月（迁移版）

## 运行

```bash
bun install
bun run dev
```

打开：

```text
http://localhost:5173
```

API：

```text
http://localhost:8787
```

## API

```text
GET  /api/sources
GET  /api/manifest?sourceId=...
GET  /api/source?sourceId=...
POST /api/call
```

`POST /api/call` 示例：

```json
{
  "sourceId": "legado.0.qimao.jh52dns",
  "name": "search",
  "args": { "keyword": "系统", "page": 1 },
  "settings": { "contentFormat": "blocks" }
}
```

## 重要说明

这不是 Legado 兼容运行时，而是把 9 个源按新协议重新实现。为了暴露协议问题，迁移中保留了每个源的关键差异：

- `ctx.args` 泛型入口参数
- 标准 `fetch`，不使用 `ctx.http`
- source-scoped cookie jar
- source-scoped storage/secret/cache
- 多源选择和独立 Runtime 实例
- URL 与 ID 分离：`id` 是紧凑 source-local key，URL/opaque 请求信息放在 `bookUrl/chapterUrl/extra`
- 聚合源 / 明月源 / 加密内容源 / 需要 token 的源都各自单独实现

部分源依赖对方服务端、token 或私有后端；本运行器会显示完整 fetch trace，便于判断是协议问题、迁移问题还是上游接口问题。

## 已发现的协议设计压力点

- 需要 `SourceContext<TArgs>` 而不是 `SearchContext extends SourceContext`。
- `id` 不能用 URL，应该是紧凑的 source-local opaque key。
- fetch 必须保持 Web 标准，Cookie/权限/trace 放 runtime 层。
- HTML/DOM 不应该放进协议核心；测试环境可以通过 bundled dependency 提供。
- 复杂源需要官方 dependency / helper 机制，比如 MD5、AES、HTML parser。
- `bookUrl/chapterUrl` 有时不是 URL，而是 opaque key；协议注释必须允许这一点。
