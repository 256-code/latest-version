# inpulse 前端（pnpm monorepo）

原型（Next.js）已按架构选型原地重构为 **React 19 + Vite 8 + react-router-dom(Hash) + Ant Design 6 + TanStack Query 5 + React Hook Form + Zod**。
**硬约束：视觉与交互必须与原 Next 原型逐像素、逐行为一致。**

## 工作区

```
apps/web        应用本体（Vite 8 + React 19，源码在 src/）
apps/e2e        Playwright 门禁与 e2e 测试
```

常用命令（仓库根目录）：

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 启动 `apps/web` 开发服务器（:5173） |
| `pnpm build` | 生产构建 |
| `pnpm typecheck` | 全仓 `tsc --noEmit` |
| `pnpm test` | `apps/web` 的 Vitest 单测（jsdom） |
| `pnpm e2e` | `apps/e2e` 的 Playwright e2e |

## 目录约定（apps/web/src）

```
main.tsx                StrictMode > ConfigProvider(antd 主题) > QueryClientProvider > HashRouter > AppProvider
App.tsx                 应用外壳、路由出口、toast
lib/domain.ts           领域类型
lib/seed.ts             种子数据
lib/ops.ts              纯函数 op 层：OpContext + applyOp(prev, op)
lib/mock-api.ts         内存后端：dispatch(op) 幂等去重 + 16ms 延迟
lib/query-keys.ts       TanStack Query key 工厂
lib/actions.ts          runOp：本地乐观计算 + 提交 mock-api
lib/store.tsx           AppProvider；对外只暴露 useData / useUi / useActions（签名与原型一致）
lib/selectors.ts        派生数据
lib/routes.ts           Hash 路由表
lib/schemas.ts          Zod schema 单一校验来源（含全部校验文案与 xxxFormValues 类型）
components/             组件（primitives.tsx 是通用原子）
components/surface-modal.tsx  antd Modal 包装（只借对话框语义，DOM 由 modalRender 接管）
components/calm-tabs.tsx      antd Tabs 包装（`.calm-tabs`）
components/more-menu.tsx      antd Dropdown 包装（`.more-wrap` 里的更多操作菜单）
components/toaster.tsx        antd message 包装（`.toast`）
components/tip.tsx             antd Tooltip 包装（原 `title=` 提示，`label` 为空时不渲染；侧栏导航不使用）
components/popover.tsx         antd Popover 包装（受控 + 自补 Escape，导出 ANCHOR_BOTTOM_RIGHT）
views/                  页面级视图
styles/design-system.css   全站唯一视觉来源（由原 app/globals.css 迁移：移除 Tailwind，preflight 逐条内联等价）
styles/antd-adapter.css    antd → design-system 的适配层（唯一允许写 antd 覆盖的地方）
styles/antd-theme.ts       ConfigProvider theme token
```

## 架构约束

- **状态层没有 Redux**：所有数据变更都表达成 `lib/ops.ts` 里的纯函数 op，`mock-api` 与本地乐观更新跑同一份 `applyOp`，因此结果永远一致。
- **视觉只由 `design-system.css` 决定**。antd 的默认样式必须在 `antd-adapter.css` 里逐条抹平，并且每条规则都要比 antd 自己多一层选择器（antd 是运行时 CSS-in-JS，注入在 `<head>` 末尾、晚于本文件）。
- antd 的样式注入很晚，**不要靠引入顺序**。
- 换任何一个 antd 组件前，先确认它的**根元素标签名**不会命中 `design-system.css` 里的元素级选择器（例如 `.dialog-form label` 曾命中 antd Segmented 渲染出的 `<label>`）。

## 表单（React Hook Form + Zod）

- **所有表单都走 RHF + `zodResolver`，校验规则与文案只允许写在 `lib/schemas.ts`**，组件里不再手写 `if (!x) setError(...)`。
  原型里由 op 层（`lib/ops.ts`）返回的失败消息，仍由 op 决定内容，表单只负责把它落到 `root` 错误上。
- **必须 `shouldFocusError: false`**：RHF 默认在提交失败时把焦点移到第一个错误字段，而原型不移动焦点。
- 错误统一渲染在原有位置（`.dialog-form > .form-error`、`.record-actions > .form-error`、`.github-block > .form-error`），
  文案取自 `errors.root?.message`（`setError('root', ...)` 的读取方式）。
- **`Controller` 不产生额外 DOM**，所以 `smoke.mjs` / `visual-states.mjs` 依赖的 `<label>` 包裹结构与原生 `input`/`select`/`textarea`
  标签必须手动保持（不要换成 antd `Form`，它的 `Form.Item` 会生成新的 wrapper）。
- **transform 型 schema 不能直接当表单字段类型**：`z.string().transform(...)` 会让 `z.input ≠ z.output`，与 `Resolver` 泛型冲突
  （`tsc` 报 TS2322，展开字段还报 TS2698）。做法是另建一个纯 `z.string().superRefine(...)` 的表单 schema（如
  `githubLinkTextSchema`），把 transform 留给解析用的 schema（`githubLinkSchema`），在 `onValid` 里再 `safeParse` 一次。
- **`ctx.addIssue` 必须带 `path`**：Zod 4 的 resolver 用 `issue.path.join('.')` 当键，`path` 为空会写出 `errors['']` 伪键。
- 提交按钮统一写 `onClick={() => { void submitForm() }}`：resolver 自身 reject 时 `handleSubmit()` 的 promise 会 reject，
  不 `void` 会变成 unhandled rejection（探针的「无运行时报错」断言会抓住）。
- 换页面 hash 时**整页不会重载**，新写行为探针要在 `open()` 里先 `goto('about:blank')`，否则上一场景的 antd Modal 遮罩会拦截点击。

## 弹层（Modal / Dropdown / Popover / Tooltip / message）

- 原型用原生 `<dialog>.showModal()`，盒子进 top layer，会盖住 body 级的其他弹层；antd Modal 不是 top layer
  （`.ant-modal-wrap` z-index 1000），所以 antd 自己的弹层（Dropdown 1150 / Tooltip 1070 / message 2050）
  都能正常压在弹窗之上，**保持 antd 默认的 body 级 portal 即可，不要加 `getPopupContainer`**（加回盒子里反而会被
  `.surface-modal` 的滚动容器裁切）。已用 hit test + 逐像素门禁 + 滚动锚点实测验证。
- `.surface-modal` 由 `modalRender` 渲染，必须显式 `height:fit-content`（配合 `inset:0` 才能「内容自适应 + `max-height` 截断」）。
- `.surface-modal` 需要 `will-change:opacity`：原型里 top-layer 元素是独立合成层，光栅相位不同会让细斜线（如关闭图标的 X）抗锯齿差 1px。**不要换成 `transform`**，那会把弹层内文字抗锯齿切成灰度。
- antd `Modal` 的 `scrollLock` 会改 body 宽度，必须关掉并自己管 `body.style.overflow`。
- 已废弃的 props（会触发 console warning，`smoke.mjs` 会判失败）：`focusTriggerAfterClose` → `focusable.focusTriggerAfterClose`；`maskClosable` → `mask.closable`；`destroyOnClose` → `destroyOnHidden`；`bodyStyle`/`maskStyle` → `styles.body`/`styles.mask`。
- **弹层 portal 到 body 后，原型「子元素 `position:absolute` 相对小 wrapper 定位」的假设整体失效**。修复范式（`notifications-popover` / `account-popover` 就是这样做的）：给弹层容器一个 1×1 的透明盒、用 `align.points=['tl','br']` 把它的左上角对到锚点右下角、再让内层 `ant-popover-content` 绝对定位到容器原点 —— 引用系就回到原型那个 `.popover-wrap` 的右下角，适配层再按同语义写回 `top`/`right`。**容器不能是 0×0**（`useAlign` 用 `popupRect.width / computedStyle.width` 算缩放，0 会得 NaN 让定位失效），也**不能用 `transform` 偏移**（会切灰度抗锯齿）。
- `useAlign` 会 `Math.floor` 对齐结果，锚点坐标带 .5 时被抹掉的小数要在适配层补回来（通知按钮底边 46.5 → `.popover` 写 `top: 10.5px`）。
- **rc-trigger 的 `cloneElement` 是覆盖语义**：任何「透明包装组件」（`tip.tsx` 这种把 antd 注入的 props 转交给子元素的组件）必须自己合并 `className`（空格拼接）、`style`（对象合并）与同名事件（逐键合成），否则触发器自己的类名会被顶掉（实测 `mini-avatar` 被 `ant-popover-open` 顶掉后按钮宽度从 29px 塌到 14.94px）。
- **z-index 语义要对齐原型**：原型 `.popover` 的 `z-index:40` 被 `.topbar`（`sticky` + `z-index:15`）的层叠上下文困住，所以 `.overlay(30)` / `.palette-overlay(45)` / `.toast(50)` 都能盖住它；antd 的弹层脱离该上下文后默认 1030 会浮到调色板之上，适配层退回 `z-index:15` 还原层级。而 Tooltip 对应的是原生 `title`（OS 自绘、永远在最上层），所以 1070 保持不动。
- rc-trigger 只监听 `pointerdown/mousedown/contextmenu` 做外部关闭，**没有 `keydown`** —— Escape 关闭必须自己在包装层补（原型 `usePopover` 有的行为）。

## 门禁（改任何视觉/交互相关代码后必须全绿）

先准备基线环境：在 `D:\design\_baseline-next`（原 Next 原型的 `git worktree`）执行 `next build` 静态导出，
用 `node apps/e2e/scripts/static-server.mjs <out 目录> 3100` 起在 **:3100**（用 `next dev` 不会 hydrate，测不准）。

然后在 `apps/e2e` 目录下依次跑：

| 脚本 | 作用 | 通过标准 |
| --- | --- | --- |
| `node scripts/parity.mjs` | DOM 结构 + 文本 + 视口盒 + 60 个计算样式属性 | `总差异条数: 0` |
| `node scripts/visual.mjs` | 6 个视图整页截图逐像素 | `总差异像素: 0` |
| `node scripts/visual-states.mjs` | 13 个弹层/交互态逐像素 | `总计差异像素: 0` |
| `node scripts/smoke.mjs` | 12 步交互链路 + 无运行时报错 | 全部 PASS |
| `node scripts/probe-modal-behavior.mjs` | 弹层行为契约（焦点/ESC/遮罩/滚动还原） | 全部 PASS |
| `node scripts/probe-menu-behavior.mjs` | 菜单行为契约（锚点/菜单项/四个动作/收起/hover/残影） | 全部 PASS |
| `node scripts/probe-tooltip-behavior.mjs` | 提示行为契约（延迟/文案/关联/定位/外观/层级/残留 + 侧栏无提示） | `20/20 项通过` |
| `node scripts/probe-popover-behavior.mjs` | 顶栏面板行为契约（开合/互斥/内外点击/ESC/面板结构/已读/账户动作/遮罩层级） | 全部 PASS |
| `node scripts/probe-forms-behavior.mjs` | 表单行为契约（校验文案与顺序/范围级联/作废内联确认/取消与合并/链接 Enter 提交/不移动焦点） | 全部 PASS |

`smoke.mjs` 加 `NAV=click TARGET_URL=http://127.0.0.1:3100/` 可以跑基线；基线导航必须**点击** `button.nav-item`（静态导出上直接改 hash 不触发路由）。

定位差异时写的一次性排障脚本用完即删（当前只留了 `probe-matched.mjs`，它是 CDP 匹配规则排查器），**不要把它们当成门禁**。

## 测试

| 命令 | 覆盖 |
| --- | --- |
| `pnpm test` | Vitest：`lib/selectors` `lib/ops` `lib/mock-api` `lib/schemas` `lib/store` `components/task-form` |
| `pnpm e2e` | Playwright：`tests/navigation.spec.ts`（导航与目录层级）、`tests/tasks.spec.ts`（任务中心）、`tests/records.spec.ts`（迭代记录）、`tests/persistence.spec.ts`（内存态契约） |

- e2e 的 `webServer` 会自己 `build` + `preview` 到 :4173，**不需要手动起目标服务器**（基线 :3100 只给门禁脚本用）。
- 全部选择器集中在 `tests/helpers.ts`，spec 里不要再写裸 CSS。`test` 是 `base.extend` 夹具，用例结束会断言「无 `pageerror` / 无 `console.error`」。
- 断言文案前先去 `lib/schemas.ts` / `lib/actions.ts` / `views/*.tsx` 核对原文；「元素找不到」类失败先看 `test-results/*/error-context.md`（ARIA 快照，`display:none` 的元素不会出现）。
- 设计系统里 `.view-description`、`.personal-scope`、`.task-toolbar > .secondary-button`（任务中心「更多筛选」）是**故意隐藏**的，不要在 e2e 里断言它们的交互。
- 记录页默认「来源」过滤会排除 `taskId` 为空的新建记录（`views/records.tsx` 的 `if (!record.taskId) return false`），断言新建记录前要先把来源切到「功能直接创建」。

## 踩坑速查

- antd 的 CSS-in-JS 选择器**带 `:where(...)` 前缀**（特异性 0）也**带 `:not(...)`**，例如 danger 菜单项是
  `:where(.css-xxx).ant-dropdown .ant-dropdown-menu .ant-dropdown-menu-item.ant-dropdown-menu-item-danger:not(.ant-dropdown-menu-item-disabled)`
  共 (0,5,0)。adapter 里只堆三层类名会被它压过去 —— 要么补 `:not(...)`，要么直接改 `antd-theme.ts` 的 token
  （危险色就是靠 `colorError` 一处收敛的）。排查用 `probe-matched.mjs`（CDP `CSS.getMatchedStylesForNode`
  会按优先级列出所有命中规则，能一眼看出谁赢）。
- antd 元素常被 `position:relative` / 恒等 `transform` / **大范围 `filter`（含 `drop-shadow`）** 提升为合成层，
  Blink 对合成层内文字用**灰度抗锯齿**，基线用 LCD。最小修复集是 `position: static` + `transform: none`，
  **缺一项都无效**；内联 transform 需要 `!important`；只有 `filter` 起作用时单独写 `filter: none`（如 `.ant-tooltip`）。
- **原生 `title=` 在基线截图里截不到**（OS 自绘），所以「原生 title → antd Tooltip」这类覆盖层**无法做基线逐像素对比**，
  只能靠目标侧的行为契约门禁（`probe-tooltip-behavior.mjs`）覆盖，四层视觉门禁同步保证「没有引入回归」。
- **侧栏导航（`button.workspace` + 6 个 `button.nav-item`）已按要求去掉悬停提示**，这是**有意偏离原型**的一处：
  门禁看不出来（悬浮层不进截图 / parity 不比 `title`），不要再把 `hint` 加回去。回归靠 `probe-tooltip-behavior.mjs`
  的第 5b 组断言（逐个 hover 侧栏入口，要求 `.ant-tooltip` 计数为 0）守住。其余位置的提示照旧保留，
  该门禁的样本锚点已从导航项改到任务卡的「负责人」提示上。
- Playwright 的 `.click()` 会把鼠标**留在元素上**。若锚点带 Tooltip，截图会截到提示 ——
  截图前必须 `page.mouse.move(x, y)` 移开并等 200ms 让提示卸载（`visual-states.mjs` 的 `account-popover` 就是踩了这个坑）。
- `rc-segmented` 会给 `.ant-segmented-item-label` 挂**原生 `title`**，「应用内不再有原生 title」这类断言要排除 `[class*="ant-segmented"]` 后代。
- Playwright：`page.evaluate(fn, arg)` 只能传一个参数，多参要包成对象/数组。
- 非 TTY 环境跑 pnpm 需要先 `$env:CI='true'`。
- pnpm 的 `node_modules` 是 junction，**不要移动目录**。
- 换依赖版本后要删 `node_modules/.vite` 并重启 dev server。
