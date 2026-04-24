/**
 * TravelStateAnnotation — 整个 Graph 共享的状态定义
 *
 * ============================================================================
 * 什么是 Annotation / State？
 * ============================================================================
 *
 * 在 LangGraph 中，State 是整个图的全局共享数据结构。
 * 每个 Node（节点）接收完整的当前 State，返回一个 **部分更新（partial update）**，
 * LangGraph 通过每个字段定义的 "reducer" 将更新合并到现有 State 中。
 *
 * 类比理解：
 *   - 传统函数调用：A(B 的返回值) → C(A 的返回值)  —— 手动传参
 *   - LangGraph State：所有 Node 读写同一个对象           —— 声明式数据流
 *
 * ============================================================================
 * Reducer 是什么？
 * ============================================================================
 *
 * Reducer 决定了"新值如何与旧值合并"。LangGraph 提供了几种常见模式：
 *
 * 1. (current, _) => current    → 取第一次写入的值，后续忽略（写一次）
 *     适用场景：userInput、intent、routeSkeleton 等不应被覆盖的字段
 *
 * 2. (_, update) => update       → 直接替换为新值
 *     适用场景：finalPlan、retryCount 每次都取最新值
 *
 * 3. (current, update) => [...current, ...update]  → 追加合并
 *     适用场景：issues 数组累积问题项
 *
 * 4. addMessages（内置）         → 消息列表追加
 *     适用场景：messages 字段，自动去重/追加
 *
 * ============================================================================
 * 数据流向图
 * ============================================================================
 *
 *   userInput ──→ IntentAgent ──→ intent
 *                                    │
 *                              RoutePlanner ──→ routeSkeleton
 *                                                    │
 *                          ┌─────────────────────────┤
 *                          ▼                         ▼                   ▼
 *                    POIAgent                 WeatherAgent          HotelAgent
 *                          │                         │                   │
 *                    enrichedActivities        enrichedWeather    enrichedAccommodation
 *                          └─────────────────────────┴───────────────────┘
 *                                                    │
 *                                              Formatter ──→ finalPlan
 *                                                            │
 *                                                      Validator ◄── retryCount
 */

import { Annotation, addMessages } from "@langchain/langgraph"
import type { BaseMessage } from "@langchain/core/messages"
import type {
  ITravelPlan,
  IActivity,
  IWeather,
  IAccommodation,
} from "@repo/shared-types/travel"
import type {
  TravelIntent,
  RouteSkeletonDay,
} from "../types/internal.js"
import type { IssueItem } from "../constants/error-code.js"

export const TravelStateAnnotation = Annotation.Root({
  // ==================== 输入层 ====================

  /**
   * 用户原始输入文本
   *
   * 写入时机：Graph.invoke() 时由外部传入
   * 读取者：IntentAgent
   * Reducer：始终采用本轮最新输入
   *
   * 说明：
   * 接入 checkpointer 后，同一 thread_id 会复用历史 state。
   * 若这里保留“只写首次值”策略，会导致连续对话场景下 intent
   * 永远读取第一轮 userInput，无法响应后续补充信息。
   */
  userInput: Annotation<string>({
    reducer: (_, update) => update,
    default: () => "",
  }),

  // ==================== Agent 输出层 ====================

  /**
   * 结构化旅行意图 — IntentAgent 的输出
   *
   * 包含 destination、days、month、travelType 等关键字段。
   * 这是整个管线的"翻译层"，把自然语言变成机器可处理的结构化数据。
   */
  intent: Annotation<TravelIntent | null>({
    reducer: (_, update) => update,
    default: () => null,
  }),

  /**
   * 行程骨架 — RoutePlanner 的输出
   *
   * 这是一个 RouteSkeletonDay[] 数组，每天包含：
   * - title / description（当天概要）
   * - activities[]（景点名称+描述，但无门票/开放时间等详情）
   * - accommodation[]（住宿名称+地址，但无价格等详情）
   * - foodRecommendation[]（美食推荐）
   *
   * 这个骨架是后续 POI/Weather/Hotel Agent 的输入基础。
   * Phase 2 中，三个 Agent 会并行往 skeleton 里填充真实 API 数据。
   */
  routeSkeleton: Annotation<RouteSkeletonDay[] | null>({
    reducer: (_, update) => update,
    default: () => null,
  }),

  /**
   * 已丰富的景点数据 — POIAgent 的输出
   *
   * 类型是 Map<dayIndex, IActivity[]>：
   * - key   = 天数索引（0-based，对应 routeSkeleton 的第几天）
   * - value = 该天所有景点的完整信息（含 ticketPriceCny、openingHours、images 等）
   *
   * 为什么用 Map 而不是数组？
   * 因为不同天的景点由 POIAgent 可能并行处理（Phase 2 fan-out），
   * Map 允许按 dayIndex 精确合并，避免顺序依赖。
   *
   * Reducer 使用 merge 策略：新数据按 dayIndex 合并到已有 Map 中，
   * 这样即使多次调用也不会丢失之前的结果。
   */
  enrichedActivities: Annotation<Map<number, IActivity[]>>({
    reducer: (current, update) => {
      if (!update) return current ?? new Map()
      const merged = new Map(current)
      for (const [dayIdx, activities] of update) {
        merged.set(dayIdx, activities)
      }
      return merged
    },
    default: () => new Map(),
  }),

  /**
   * 天气数据 — WeatherAgent 的输出
   *
   * IWeather[] 数组，每个元素代表一个区域的天气情况
   * （含白天/夜间温度、天气描述、穿衣建议）。
   *
   * 与 enrichedActivities 不同，这里用数组而不是 Map，
   * 因为天气是按"区域"而非"天数"组织的，且通常数量较少。
   */
  enrichedWeather: Annotation<IWeather[]>({
    reducer: (_, update) => update,
    default: () => [],
  }),

  /**
   * 已丰富的住宿数据 — HotelAgent 的输出
   *
   * 同样使用 Map<dayIndex, IAccommodation[]> 结构，
   * 与 enrichedActivities 设计一致，方便 Formatter 按 dayIndex 查找。
   */
  enrichedAccommodation: Annotation<Map<number, IAccommodation[]>>({
    reducer: (current, update) => {
      if (!update) return current ?? new Map()
      const merged = new Map(current)
      for (const [dayIdx, hotels] of update) {
        merged.set(dayIdx, hotels)
      }
      return merged
    },
    default: () => new Map(),
  }),

  /**
   * 最终行程计划 — Formatter 的输出
   *
   * 完整的 ITravelPlan 对象，严格符合 JSON Schema。
   * 这是整个 Graph 对外暴露的最终产物。
   */
  finalPlan: Annotation<ITravelPlan | null>({
    reducer: (_, update) => update,
    default: () => null,
  }),

  // ==================== 控制层 ====================

  /**
   * 重试计数器 — Validator 更新
   *
   * 每次 Validator 校验失败时 +1，达到 MAX_RETRIES 后强制结束（降级模式）。
   * 由 graph/index.ts 中的 shouldRetryOrEnd() 条件路由函数读取此值做判断。
   */
  retryCount: Annotation<number>({
    reducer: (_, update) => update,
    default: () => 0,
  }),

  /**
   * 路线骨架重试计数器 — router_planner 更新
   *
   * 用途：
   * - 专门统计“route_planner 结构化输出失败”的重试次数
   * - 与 Validator 的 retryCount 分离，避免两个阶段互相干扰
   *
   * 约定：
   * - router_planner 解析失败时 +1
   * - router_planner 成功产出有效骨架时重置为 0
   */
  routePlannerRetryCount: Annotation<number>({
    reducer: (_, update) => update,
    default: () => 0,
  }),

  /**
   * pre_formatter_guard 已处理 issue 游标
   *
   * 用途：
   * - 仅检查“新增 issues”，避免历史问题反复触发重试
   * - 值含义：上次 guard 执行后，issues 已处理到的长度
   */
  preFormatterIssueCursor: Annotation<number>({
    reducer: (_, update) => update,
    default: () => 0,
  }),

  /**
   * pre_formatter_guard 的路由决策结果
   *
   * true  -> 回退 route_planner
   * false -> 继续 formatter
   */
  preFormatterShouldRetry: Annotation<boolean>({
    reducer: (_, update) => update,
    default: () => false,
  }),

  /**
   * 问题日志累积 — 所有 Node 都可写入
   *
   * 统一承载原 errors/warnings：
   * - code 使用 ERROR_CODE 常量管理
   * - 重试与否由 routing.ts 的 RETRYABLE_ISSUE_CODES 决定
   */
  issues: Annotation<IssueItem[]>({
    reducer: (current, update) => [...(current ?? []), ...(update ?? [])],
    default: () => [],
  }),

  // ==================== 调试层 ====================

  /**
   * 消息历史 — 用于调试和 Human-in-the-loop
   *
   * 记录每个 LLM 调用的完整对话历史（System/Human/AI/Tool Message）。
   * 使用 LangGraph 内置的 addMessages reducer，它会：
   * - 自动追加新消息到末尾
   * - 根据 message.id 去重（同一消息不会重复添加）
   *
   * 用途：
   * 1. 调试时查看每个 Agent 的完整 prompt/response
   * 2. Human-in-the-loop 场景下让用户看到 AI 的思考过程
   * 3. Checkpoint 持久化后可恢复执行上下文
   */
  messages: Annotation<BaseMessage[]>({
    reducer: addMessages,
    default: () => [],
  }),
})
