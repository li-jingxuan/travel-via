# apps/web 重构清单（第二阶段）

## 1. 本阶段目标

本次重构聚焦你提出的 4 个要求：

1. 侧边栏从 `page.tsx` 上移到 `layout.tsx` 承载。
2. `page.module.scss` 按职责拆分为组件级样式。
3. `page.constants.ts` 从 `app` 目录迁移到 `lib` 目录。
4. `cn` 与小型 UI 工具函数进行统一收敛。

## 2. 结构改造总览

### 2.1 Layout 承载 Sidebar

新增：

- `components/AppDesktopShell.tsx`
- `components/AppDesktopShell.module.scss`

改造：

- `app/layout.tsx` 中引入 `AppDesktopShell`，统一包裹 `children`。

结果：

- `page.tsx` 不再维护侧边栏状态。
- 侧边栏收缩逻辑（媒体查询 + 手动切换）集中在 `AppDesktopShell`。

### 2.2 page 样式拆责

已删除：

- `app/page.module.scss`

拆分为：

- `components/TravelSidebar.module.scss`
- `components/TravelChatPanel.module.scss`
- `components/TravelPlannerPanel.module.scss`
- `components/TravelPlannerSkeleton.module.scss`
- `components/AppDesktopShell.module.scss`

职责边界：

- `AppDesktopShell.module.scss`：页面级网格壳层（sidebar/chat/planner 列布局）。
- `TravelSidebar.module.scss`：侧边栏专属视觉与折叠态样式。
- `TravelChatPanel.module.scss`：聊天区域样式与动效（`rise`/`blink`）。
- `TravelPlannerPanel.module.scss`：右侧规划区样式。
- `TravelPlannerSkeleton.module.scss`：骨架屏样式与 `shimmer` 动效。

### 2.3 常量迁移至 lib

已删除：

- `app/page.constants.ts`

新增：

- `lib/travel-page/constants.ts`

迁移内容包含：

- 查询参数 key（`QUERY_KEY`）
- UI 文案与布局常量（如 `CHAT_PLACEHOLDER_SUMMARY`、`WEATHER_PAGE_SIZE`）
- 导航配置、动作配置、mock 数据、行李清单等

### 2.4 工具函数收敛

新增：

- `lib/ui/cn.ts`
- `lib/travel-page/ui-utils.ts`

统一收敛内容：

- `cn` 类名拼接函数
- `resolveRoleLabel`
- `splitWeatherSlot`
- `resolveWeatherMonthLabel`
- `buildMetaPills`
- `getPrimaryAccommodation`
- `getPrimaryActivityImage`
- `SummaryStatItem` 类型

## 3. 关键文件变更清单

### 3.1 新增文件

1. `components/AppDesktopShell.tsx`
2. `components/AppDesktopShell.module.scss`
3. `components/TravelSidebar.module.scss`
4. `components/TravelChatPanel.module.scss`
5. `components/TravelPlannerPanel.module.scss`
6. `components/TravelPlannerSkeleton.module.scss`
7. `lib/ui/cn.ts`
8. `lib/travel-page/constants.ts`
9. `lib/travel-page/ui-utils.ts`

### 3.2 改造文件

1. `app/layout.tsx`
- 根布局接入 `AppDesktopShell`。

2. `app/page.tsx`
- 从“页面 + 侧边栏 + 聊天 + 规划”降级为“聊天 + 规划编排”。
- 移除侧边栏状态与布局壳层逻辑。
- 使用 `lib/travel-page/constants.ts` 与 `lib/travel-page/ui-utils.ts`。

3. `components/TravelSidebar.tsx`
- 使用独立样式模块与统一 `cn`。
- 常量来源切换到 `lib/travel-page/constants.ts`。

4. `components/TravelChatPanel.tsx`
- 使用独立样式模块。
- `resolveRoleLabel` 改为使用共享工具函数。

5. `components/TravelPlannerPanel.tsx`
- 使用独立样式模块。
- `splitWeatherSlot` 与 `cn` 改为共享工具函数。
- `summary` 图标颜色由 `tone -> class map` 控制。

6. `components/TravelPlannerSkeleton.tsx`
- 样式切换到独立模块。

### 3.3 删除文件

1. `app/page.constants.ts`
2. `app/page.module.scss`

## 4. 代码规范对齐说明

1. 注释
- 新增函数与关键位置补充了中文注释，聚焦“设计意图与约束”。

2. ES6+
- 保持 `const/let`、箭头函数、解构、可选链等语法风格。

3. 魔法字符串治理
- 页面级关键常量统一迁移到 `lib/travel-page/constants.ts`。

## 5. 验证结果

执行命令：

1. `cd apps/web && pnpm lint`
2. `cd apps/web && pnpm check-types`

结果：均通过。

## 6. 后续建议（可选）

1. 将 `TravelPlannerPanel.tsx` 进一步拆分为更小粒度子组件
- 如 `WeatherCard`、`DayTabs`、`DayMain`、`ChecklistPanel`、`SummaryPanel`。

2. 将图标映射表进一步常量化
- 例如 `PLANNER_ACTION_ICON_MAP` 和 checklist 图标映射，统一收口到 `lib/travel-page`。

3. 增加视觉回归检查
- 对 `layout + chat + planner` 三栏布局加截图回归，防止后续样式改动造成结构漂移。

## 7. 第三阶段：`page.tsx` 逻辑内聚改造（本次）

### 7.1 改造目标

1. 让 `page.tsx` 只负责“会话编排 + 数据分发”。
2. 将“天气分页、天数切换、统计派生”等规划区局部逻辑下沉到 `TravelPlannerPanel` 内部。
3. 仅服务于某个组件的常量与工具函数就近内聚，避免继续堆积在全局常量或 `page.tsx`。

### 7.2 具体变更

1. `app/page.tsx` 页面层瘦身
- 移除页面层状态：`activeDayIndex`、`weatherPage`。
- 移除页面层派生：`plannerMetaPills`、`weatherMonthLabel`、`currentWeatherItems`、`summaryStats`。
- 移除页面层行为：天气分页切换与分页纠偏逻辑。
- 保留核心职责：会话流控制、提示词选择、`TravelChatPanel` 与 `TravelPlannerPanel` 的数据编排。

2. `components/TravelPlannerPanel/index.tsx` 主规划组件内聚
- 内部维护 `activeDayIndex`。
- 内部计算 `activeDay/fallbackDay`、`featuredHotel`、`featuredHotelImage`。
- 内部计算 `summaryStats`，并以本地 `SUMMARY_STAT_CONFIG` 消除魔法字符串。

3. `components/TravelPlannerPanel/PlannerInfoCards.tsx` 天气卡内聚
- 内部维护 `weatherPage`。
- 内部声明 `WEATHER_PAGE_SIZE`。
- 内部处理分页切片、分页上下限纠偏、月份标签解析。

4. `components/TravelPlannerPanel/PlannerHeader.tsx` 顶部信息内聚
- 内部声明 `PLANNER_ACTIONS`。
- 内部封装 `buildMetaPills`，避免外部再传入“中间态展示数据”。

5. 公共层清理
- 删除 `types.ts` 中未使用的 `PlannerMetaPill`。
- 删除 `lib/utils.ts` 中已下沉的仅规划区使用函数：
  - `resolveWeatherMonthLabel`
  - `buildMetaPills`
  - `getPrimaryAccommodation`
  - `getPrimaryActivityImage`
  - `SummaryStatItem`（迁移为 `TravelPlannerPanel` 本地类型）
- 删除 `lib/travel-page/constants.ts` 中未再使用的全局常量：
  - `WEATHER_PAGE_SIZE`
  - `PLANNER_ACTIONS`

### 7.3 本次重点收益

1. `page.tsx` 可读性明显提升，定位问题更快。
2. 规划区逻辑“就近维护”，后续迭代天气卡/行程卡时改动范围更小。
3. 全局工具与常量更干净，减少“看起来通用、实际私有”的依赖耦合。

### 7.4 本次验证

执行命令：

1. `pnpm --filter web check-types`
2. `pnpm --filter web lint`

结果：均通过。
