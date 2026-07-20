# shadcn 官网模式报告（Rive LipSync Previewer）

> 依据开源官网 `apps/v4` 拆解。本地副本：`_ref/shadcn-ui/`（已 gitignore，勿提交）。  
> 路径均相对于 `_ref/shadcn-ui/apps/v4/`。  
> **写 UI 前必读本文件，并打开下列源码对照，禁止只堆默认 Button/Card。**

主题：deepBlue — https://tweakcn.com/themes/cmrpwas9k000304ky07fxgy84  
Registry：https://tweakcn.com/r/themes/cmrpwas9k000304ky07fxgy84

---

## 0. 本工具页面映射

| 工具区域 | 官网模式 | 必读源码（全路径） |
| --- | --- | --- |
| 顶栏标题 + 状态 | Page header + Badge/status | `app/(app)/examples/playground/page.tsx`（顶栏）；`examples/base/badge-variants.tsx` |
| 左预览 + 右参数 | Playground 主/侧栏 grid | `app/(app)/examples/playground/page.tsx`（`md:grid-cols-[1fr_200px]`，本工具侧栏用 ~320–420px） |
| 底栏传输控件 | ButtonGroup + primary/outline | `examples/base/button-group-demo.tsx`；playground Submit 行 |
| 空预览态 | Empty over muted 区域 | `examples/base/empty-background.tsx`；`registry/bases/base/blocks/preview-02/cards/syncing-state.tsx` |
| 素材来源 Tabs+表单 | Tabs + FieldGroup | `examples/base/tabs-demo.tsx`；`examples/base/field-demo.tsx`；`examples/base/input-file.tsx` |
| 文本生成表单 | Field + Textarea + Select + Slider | `examples/base/field-textarea.tsx`；`field-select.tsx`；`field-slider.tsx`；playground `TemperatureSelector` |
| Rive 设置双列 | Settings Card + 响应式 Field grid | `registry/bases/base/blocks/preview-02/cards/preferences.tsx`；`examples/base/collapsible-settings.tsx`；`field-responsive.tsx` |
| 当前状态行 | ItemGroup / readout 列表 | `examples/base/item-group.tsx`；`marker-status.tsx` |
| 嘴型映射网格 | 小卡片网格 / Table | `examples/base/card-small.tsx`；`table-demo.tsx` |

**分层（本仓库实现）**

```text
原子 ui/*          ← shadcn CLI 安装
功能块 blocks/*    ← 对照上表组合，禁止在页面里平铺 50 个裸控件
页面 PreviewerPage ← 只负责拼块 + 接线状态
```

---

## 1. 完整页面示例（优先读）

| 路径 | 学什么 |
| --- | --- |
| `app/(app)/examples/playground/page.tsx` | ★ 工作台：顶栏工具 + Separator + Tabs + 主区/侧栏参数 |
| `app/(app)/examples/playground/components/*.tsx` | Slider/Select 参数控件、preset toolbar |
| `app/(app)/examples/playground/data/{models,presets}.ts` | **数据驱动** options |
| `app/(app)/examples/dashboard/page.tsx` | SidebarProvider + Header + 主内容 |
| `app/(app)/examples/tasks/page.tsx` | Toolbar + 数据表 |
| `registry/new-york-v4/blocks/dashboard-01/page.tsx` | Dashboard block |
| `registry/bases/base/blocks/preview/` / `preview-02/` | 卡片级组合金矿 |

平行栈：`examples/radix/`、`registry/bases/radix/`（与 base 文件名同构）。本项目用 **Base UI（vite + shadcn base-nova）** 时优先抄 `examples/base` + `registry/bases/base`。

---

## 2. 功能块示例

| 路径 | 模式 |
| --- | --- |
| `examples/base/field-demo.tsx` | FieldSet + FieldGroup + 主/次按钮 |
| `examples/base/field-*.tsx` | 单控件 Field 配方（input/select/textarea/slider…） |
| `examples/base/input-file.tsx` | Label + file + hint |
| `examples/base/file-upload-list.tsx` | 上传状态行（Item + Progress） |
| `examples/base/empty-*.tsx` | 空状态组合 |
| `examples/base/item-group.tsx` | 描述列表 / 状态行 |
| `examples/base/button-group-*.tsx` | 传输工具条 |
| `examples/base/tabs-*.tsx` | 面板切换 |
| `examples/base/card-demo.tsx` / `card-small.tsx` | Card 头/内容/脚 |
| `examples/base/resizable-demo.tsx` | 可拖拽主/侧/底分割（可选升级） |
| `registry/bases/base/blocks/preview/cards/file-upload.tsx` | Card + Empty 上传区 |
| `registry/bases/base/blocks/preview-02/cards/preferences.tsx` | Settings 卡片（数组驱动） |
| `registry/bases/base/blocks/preview-02/cards/catalog-toolbar.tsx` | 工具条组合 |

原子组件目录：

- Base：`registry/bases/base/ui/`
- new-york-v4：`registry/new-york-v4/ui/`

---

## 3. 组合套路（写代码必须遵循）

### R1 — 页头 + 状态

```text
header (flex justify-between):
  标题 text-2xl|3xl font-semibold tracking-tight
  副标题 text-sm text-muted-foreground
  Badge / status pill（ok|warn|error 变体，非单一灰色）
```

### R2 — 工作台分栏

```text
grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(280px,420px)]
  左：PreviewStage（canvas + Empty + TransportBar）
  右：aside 纵向 stack Cards（Source / Settings / Status / Mapping）
```

参考 playground；侧栏加宽以适配中文 Label。

### R3 — Tabs + 表单

```text
Tabs
  TabsList（grid-cols-2，高度对齐控件 ~h-9）
  TabsContent → Field 列表（非裸 div）
```

### R4 — Label + 控件 + hint

```text
Field / grid gap-1.5:
  Label text-sm font-medium
  Input|Select|Textarea|Slider（统一高度，默认勿用过小的 h-8 除非 toolbar）
  p.text-xs text-muted-foreground（hint）
```

### R5 — 按钮工具条

```text
flex flex-wrap gap-2:
  Button                 // 载入 / 生成 — primary
  Button variant="outline" × N  // 播放暂停重播 / 下载
```

禁止全部做成同权重实心按钮。

### R6 — 状态行（数据驱动）

```text
rows.map → flex justify-between border-b py-2.5 text-sm
  label
  Badge variant="secondary" font-mono
```

### R7 — 空状态盖在预览区

```text
relative canvas 容器 + absolute Empty:
  标题 text-lg font-semibold
  说明 text-sm text-muted-foreground max-w-md
```

### R8 — Settings 卡

```text
Card:
  CardHeader: Title + Description
  CardContent: 响应式 sm:grid-cols-2 字段
  底部 hint text-xs
```

高级项可后续用 Collapsible（`collapsible-settings.tsx`）。

---

## 4. AI / 开发约束（防「很丑」）

1. **先打开上表源码，再写块**；不要只凭组件 API。  
2. **组合优于堆砌**：页面只装配 `blocks/*`。  
3. **数据驱动**：声音列表、设置字段、状态行、映射表用数组 `map`。  
4. **变体要考究**：primary / outline / secondary / ghost；size 区分工具条与表单。  
5. **状态齐全**：disabled、生成中、错误 Alert、空状态、分析就绪 Badge。  
6. **字体**：英文字体族名必须是 `Geist Variable` / `Geist Mono Variable`（fontsource 注册名）；中文回退 `PingFang SC` / `Microsoft YaHei UI`；字号只用 `xs/sm/base/lg/2xl/3xl`。  
7. **不改业务语义**：上传 / Edge TTS / Rhubarb / Rive 绑定逻辑与原 `index.html` 一致。  
8. 旧版 `index.html` 保留可跑；新 UI 在 `web/`，经 Vite 代理访问 `/api` 与 `/vendor`。

---

## 5. 本地查看官网源码

```powershell
cd C:\Users\Yung\Desktop\Work\Rive-LipSync-Previewer
# 已 sparse-clone 到 _ref/shadcn-ui（gitignore，勿提交）
code "_ref\shadcn-ui\apps\v4\app\(app)\examples\playground\page.tsx"
code "_ref\shadcn-ui\apps\v4\examples\base\field-demo.tsx"
code "docs\shadcn-patterns.md"
```

完整跑官网（可选，需 pnpm 装整个 monorepo）：见上游 https://github.com/shadcn-ui/ui

---

## 6. 本仓库功能块清单（实现目标）

| 块 | 文件 | 对应原 UI |
| --- | --- | --- |
| AppHeader | `web/src/components/blocks/AppHeader.tsx` | header + status |
| PreviewStage | `blocks/PreviewStage.tsx` | canvas + empty |
| TransportBar | `blocks/TransportBar.tsx` | 载入/播放/时间轴 |
| SourcePanel | `blocks/SourcePanel.tsx` | 素材来源 |
| RiveSettingsPanel | `blocks/RiveSettingsPanel.tsx` | Rive 设置 |
| StatusPanel | `blocks/StatusPanel.tsx` | 当前状态 |
| MappingPanel | `blocks/MappingPanel.tsx` | 映射 |
| PreviewerPage | `pages/PreviewerPage.tsx` 或 `Previewer.tsx` | 组装 + hooks |
