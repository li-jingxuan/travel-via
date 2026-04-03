# TravelVia AI Agent 实施路线图

## 项目概述
- 工作目录：/src/
- 主入口：`src/index.ts`
- 参考技术方案文档：`doc/技术方案.md`，适当添加注释信息

## 📊 当前现状盘点

| 模块 | 状态 | 说明 |
|------|------|------|
| `@repo/shared-types` | ✅ 已完成 | `ITravelPlan` 全部接口定义完毕 |
| 技术方案文档 | ✅ 已完成 | 含架构图、数据流、Schema、成本估算 |
| JSON Schema | ✅ 已完成 | `travel-plan.schema.json` 可用于 Zod 校验 |
| LangGraph 学习示例 | ✅ 已完成 | `example/study/graph.ts` — ReAct 模式参考实现 |
| Ink CLI 壳子 | ✅ 已完成 | `example/ink-cli.tsx` — 直连 DeepSeek（尚未接入 Agent） |
| **Graph 骨架** | ❌ 待建 | `src/index.ts` 是空文件 |
| **7 个 Agent** | ❌ 待建 | 全部未开始 |
| **Tool 层** | ❌ 待建 | 高德 API / 天气 API 封装 |
| **Prompt 工程** | ❌ 待建 | 6 套 System Prompt |

---

## Phase 0：基础设施层（地基）

> 目标：搭好所有 Agent 共用的基础设施，后续每个 Agent 只需关注业务逻辑

```
优先级: 🔴 最高（其他所有 Phase 的前置依赖）
```

| 序号 | 任务 | 文件路径 | 说明 |
|------|------|----------|------|
| 0.1 | **State 定义** | `src/graph/state.ts` | 按技术方案 3.2 节定义 `TravelStateAnnotation`，含全部字段和 reducer |
| 0.2 | **LLM 工厂** | `src/lib/llm.ts` | 封装 DeepSeek-V3 和 DeepSeek-Reasoner 两个实例，统一配置 baseURL / apiKey / temperature |
| 0.3 | **内部类型** | `src/types/internal.ts` | 定义 `TravelIntent`、`RouteSkeletonDay` 等中间类型 |
| 0.4 | **目录骨架搭建** | `src/{agents,tools,prompts,validators,lib}/` | 创建所有目录和 index 导出 |

---

## Phase 1：最小可运行管线（MVP）

> 目标：跑通 Intent → RoutePlanner → Formatter → Validator 这条「无 Tool 主线」，能生成一个基本行程

```
优先级: 🔴 高（验证核心链路）
```

| 序号 | 任务 | 文件 | 核心要点 |
|------|------|------|----------|
| 1.1 | **IntentAgent** | `src/agents/intent-agent.ts` | deepseek-v3，纯推理，用户文本 → `TravelIntent` JSON |
| 1.2 | **RoutePlanner** | `src/agents/route-planner-agent.ts` | deepseek-reasoner，纯推理，intent → `RouteSkeletonDay[]` |
| 1.3 | **FormatterAgent** | `src/agents/formatter-agent.ts` | deepseek-reasoner，skeleton → `ITravelPlan` JSON（此时 POI/天气/酒店为空） |
| 1.4 | **SchemaValidator** | `src/validators/travel-plan.ts` | 用 Zod 校验 finalPlan，控制 retry 逻辑 |
| 1.5 | **Graph 编译** | `src/graph/index.ts` | 注册节点 + 边 + 条件路由 + compile() |
| 1.6 | **包入口导出** | `src/index.ts` | 导出 `travelPlannerGraph` 及相关类型 |

> **里程碑 🏁**：此时 `graph.invoke({ userInput: "新疆15天自驾" })` 能返回一个结构化的 `ITravelPlan`（景点无门票价格、无天气、酒店信息为 LLM 编造）

---

## Phase 2：Tool 层 + 数据丰富 Agent（并行 Fan-out）

> 目标：接入真实外部 API，让行程数据从「编造」变为「真实」

```
优先级: 🟡 中高（质量关键）
```

| 序号 | 任务 | 文件 | 说明 |
|------|------|------|------|
| 2.1 | **高德 POI Tool** | `src/tools/amap.ts` | `search_poi`、`get_poi_detail`、`get_route_driving`，含 Redis 缓存壳 |
| 2.2 | **高德酒店 Tool** | `src/tools/amap.ts` (续) | `search_hotel`、`get_hotel_price_range` |
| 2.3 | **天气 Tool** | `src/tools/weather-tool.ts` | `get_weather_forecast`、`get_historical_weather` |
| 2.4 | **POIAgent** | `src/agents/poi-agent.ts` | 遍历 skeleton activities，调高德 API 补充详情 |
| 2.5 | **WeatherAgent** | `src/agents/weather-agent.ts` | 按 waypoints 区域查天气 + 穿衣建议 |
| 2.6 | **HotelAgent** | `src/agents/hotel-agent.ts` | 每天终点搜附近住宿 |
| 2.7 | **Graph 接入并行边** | `src/graph/index.ts` (改) | 加入 fan-out/fan-in 三条边 |

> **里程碑 🏁**：生成的行程包含真实 POI 数据（经纬度、门票）、真实天气、真实酒店推荐

---

## Phase 3：Prompt 工程优化

> 目标：让每个 Agent 的输出质量稳定可控

```
优先级: 🟡 中（影响输出质量）
```

| 序号 | 任务 | 文件 | 说明 |
|------|------|------|------|
| 3.1 | Intent Prompt | `src/prompts/intent.ts` | 加 few-shot 示例，处理模糊输入 |
| 3.2 | RoutePlanner Prompt | `src/prompts/route-planner.ts` | 地理约束、强度平衡、美食推荐的详细指令 |
| 3.3 | POI Prompt | `src/prompts/poi.ts` | fallback 策略指令（API 失败时保留原始数据） |
| 3.4 | Weather Prompt | `src/prompts/weather.ts` | 温差穿衣逻辑 |
| 3.5 | Hotel Prompt | `src/prompts/hotel.ts` | 档次分层推荐策略 |
| 3.6 | Formatter Prompt | `src/prompts/formatter.ts` | 强制 JSON 格式 + Schema 约束指令 |

---

## Phase 4：工程化与集成

> 目标：从「能跑」到「好用」「好调试」

```
优先级: 🟢 中低（锦上添花）
```

| 序号 | 任务 | 说明 |
|------|------|------|
| 4.1 | **SSE 流式输出** | Koa Router 接入 `graph.stream()`，推送 progress 事件 |
| 4.2 | **Human-in-the-loop** | 在 route_planner / formatter 后设 interruptAfter，支持审核修改 |
| 4.3 | **Redis 缓存** | Tool 层接入 ioredis，按技术方案 5.2 节的 TTL 策略缓存 |
| 4.4 | **Ink CLI 升级** | 将 ink-cli 从直连 DeepSeek 改为调用 `travelPlannerGraph.invoke()` |
| 4.5 | **错误处理完善** | LLM 重试退避、Tool 超时、全流程超时中止 |
| 4.6 | **Checkpoint 支持** | MemorySaver 接入，支持断点恢复 |

---

## 关键依赖关系

```
Phase 0 (基础设施)
    │
    ├──→ Phase 1 (MVP 主线) ──→ 可交付 v0.1
    │         │
    │         ├──→ Phase 2 (Tool + 数据Agent) ──→ 可交付 v0.5
    │         │              │
    │         │              └──→ Phase 3 (Prompt优化) ──→ 可交付 v1.0
    │         │
    │         └──→ Phase 4 (工程化) ← 可与 Phase 2/3 并行
```

## 实施建议

1. **先做 Phase 0 + Phase 1** — 用最快速度验证整条管线的可行性。这一步不依赖任何外部 API（高德 Key 都不需要），纯 LLM 推理就能跑通。这是风险最低、反馈最快的路径。
2. **Phase 1 跑通后立即接 Ink CLI** — 让你能在终端里直观地看到效果，而不是只看 console.log。
3. **再做 Phase 2** — 接入高德 API，让数据变真实。
4. **Phase 3 和 4 可以穿插进行** — Prompt 优化是持续迭代的事。

---

## 最终目标目录结构

```
packages/agents/
├── src/
│   ├── index.ts                    # 包入口，导出 graph
│   ├── graph/
│   │   ├── index.ts               # Graph 定义（节点+边+编译）
│   │   └── state.ts               # TravelStateAnnotation 定义
│   ├── agents/
│   │   ├── intent-agent.ts        # IntentAgent
│   │   ├── route-planner-agent.ts # RoutePlanner Agent
│   │   ├── poi-agent.ts           # POIAgent
│   │   ├── weather-agent.ts       # WeatherAgent
│   │   ├── hotel-agent.ts         # HotelAgent
│   │   └── formatter-agent.ts     # FormatterAgent
│   ├── tools/
│   │   ├── amap.ts               # 高德地图工具集
│   │   ├── weather-tool.ts        # 天气查询工具
│   │   └── index.ts              # 工具注册导出
│   ├── prompts/
│   │   ├── intent.ts             # IntentAgent Prompt
│   │   ├── route-planner.ts       # RoutePlanner Prompt
│   │   ├── poi.ts                # POIAgent Prompt
│   │   ├── weather.ts            # WeatherAgent Prompt
│   │   ├── hotel.ts              # HotelAgent Prompt
│   │   └── formatter.ts          # FormatterAgent Prompt
│   ├── validators/
│   │   └── travel-plan.ts        # Zod Schema 校验器
│   ├── lib/
│   │   ├── llm.ts                # LLM 实例工厂
│   │   ├── cache.ts              # Redis 缓存封装
│   │   └── logger.ts             # 日志工具
│   └── types/
│       └── internal.ts           # 内部类型（RouteSkeleton, TravelIntent 等）
├── doc/
│   ├── 技术方案.md                 # 技术设计文档
│   ├── plan.md                    # 本文档（实施路线图）
│   └── 数据结构/
│       ├── 类型定义.md
│       ├── travel-plan.schema.json
│       └── travel-plan.mock.json
├── example/
│   ├── study/                     # LangGraph 学习示例
│   └── ink-cli.tsx               # Ink CLI 入口
├── package.json
└── tsconfig.json
```
