# Browser Automation Playground

`@lwmacct/260729-ba-playground` 是独立的浏览器自动化与 workflow Web 应用。它提供
Context Baton workflow controller、AdsPower 管理和浏览器 viewer，并直接调用远端
workflow executor API。

## 架构边界

- `@lwmacct/260729-ba-context-baton` 提供 Baton v1 协议、schema、reducer 和引用解析。
- `@lwmacct/260729-ba-framework` 提供通用 controller、executor HTTP client 和 Catalog Manifest 类型。
- 本仓库保留 React、Ant Design、Dexie、表单状态、AdsPower 和浏览器 viewer 等应用层实现。
- `@lwmacct/260729-ba-executor` 在独立进程中托管可加载 Step Packs。
- 具体 Step Packs 和 Playwright runtime 位于独立仓库，不打包进 Playground。

Context Baton 是步骤编排、输入/资源声明、执行状态和输出的唯一事实来源。Dexie 只保存
Baton 记录 envelope，不维护另一套前端运行模型。

## 安装与运行

```bash
pnpm install
pnpm dev
```

开发服务默认监听 `http://127.0.0.1:40218`。executor 需要独立启动；首次使用时：

1. 在 `#/settings` 的 Workflow 页签配置 Workflow ID、executor API URL 和 token。
2. 进入 `#/workflow` 创建或导入 Context Baton。
3. 从左侧添加步骤、编辑输入并执行。
4. Playground 按 Baton entry 顺序创建 invocation，通过共享 client 调用 executor，再用共享 reducer 写回结果。

默认 executor API URL 是 `http://127.0.0.1:3000/api`。executor 已允许跨源 API 请求，
因此 Playground 不需要与 executor 部署在同一域名或容器。

## Workflow 数据模型

Context Baton v1 保存在 IndexedDB 数据库 `workflow-console-v2`：

```json
{
  "id": "baton-id",
  "workflow": "example",
  "title": "example",
  "status": "draft",
  "revision": 0,
  "baton": {
    "kind": "context-baton",
    "version": 1,
    "entries": []
  },
  "meta": {}
}
```

步骤引用使用稳定 entry ID。上游输入、资源或执行结果改变后，共享 reducer 会递归清空
依赖它的下游旧结果，并拒绝制造前向引用或删除仍被引用的 entry。

executor 的 `/api/manifest` 是版本化 Step Catalog 契约，包含所有已加载 Packs 与合并后的
Steps。`requiresBrowser` 从 Step resource 声明派生；执行状态始终写回 Context Baton。
AdsPower 管理和浏览器 viewer 是 Playground 自身的应用功能，不定义 workflow Step。

## 验证与构建

```bash
pnpm typecheck
pnpm test
pnpm build
```

`pnpm build` 生成可独立部署的 `dist/`。也可以使用仓库 Dockerfile 构建静态站点镜像。

AdsPower headless 主机的 CJK 字体与 SunBrowser 内核准备说明见
[`docs/adspower-fonts.md`](docs/adspower-fonts.md)。
