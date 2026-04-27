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
 * 1. (_, update) => update       → 直接替换为新值
 *     适用场景：userInput、intent、finalPlan、retryCount 每次都取最新值
 *
 * 2. (current, update) => [...current, ...update]  → 追加合并
 *     适用场景：issues 数组累积问题项
 *
 * ============================================================================
 * 数据流向图
 * ============================================================================
 *
 *   userInput ──→ IntentAgent ──→ intentExtraction
 *                                      │
 *                         merge_collected_intent
 *                                      │
 *                           collectedIntent + intent
 *                                      │
 *                              RoutePlanner ──→ routeSkeleton
 *                                                    │
 *                          ┌─────────────────────────┴───────────────────┐
 *                          ▼                                             ▼
 *                    POIAgent                                      HotelAgent
 *                          │                                             │
 *                    enrichedActivities                         enrichedAccommodation
 *                          └─────────────────────────┬───────────────────┘
 *                                                    │
 *                                              Formatter ──→ finalPlan
 *                                                            │
 *                                                      Validator ◄── retryCount
 */

import { Annotation } from "@langchain/langgraph"
import type {
  ITravelPlan,
  IActivity,
  IAccommodation,
} from "@repo/shared-types/travel"
import type {
  TravelIntent,
  TravelIntentExtraction,
  TravelIntentPatch,
  TravelClarification,
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

  // ==================== 需求收集层 ====================

  /**
   * 本轮结构化旅行意图增量 — IntentAgent 的原始输出
   *
   * 包含：
   * - intentPatch：用户本轮明确表达的信息
   * - explicitFields：本轮允许覆盖历史值的字段
   *
   * 这里不包含默认值，默认值只在 merge_collected_intent 后补齐到 intent。
   */
  intentExtraction: Annotation<TravelIntentExtraction | null>({
    reducer: (_, update) => update,
    default: () => null,
  }),

  /**
   * 完整旅行意图 — 下游规划节点读取的稳定输入
   *
   * 包含 destination、days、month、travelType 等关键字段。
   * merge_collected_intent 会把 collectedIntent 补齐默认值后写入这里。
   */
  intent: Annotation<TravelIntent | null>({
    reducer: (_, update) => update,
    default: () => null,
  }),

  /**
   * 多轮对话中已收集到的旅行需求。
   *
   * 与 intent 的区别：
   * - collectedIntent 是跨轮合并后的 patch，不携带默认值
   * - intent 是补齐默认值后的完整需求，供 route_planner 等节点使用
   */
  collectedIntent: Annotation<TravelIntentPatch | null>({
    reducer: (_, update) => update,
    default: () => null,
  }),

  /** 当前仍缺失的必要字段。 */
  missingFields: Annotation<string[]>({
    reducer: (_, update) => update,
    default: () => [],
  }),

  /** 当前是否需要用户补充信息。 */
  needUserInput: Annotation<boolean>({
    reducer: (_, update) => update,
    default: () => false,
  }),

  /** 面向用户的追问信息，由 ask_clarification 节点生成。 */
  clarification: Annotation<TravelClarification | null>({
    reducer: (_, update) => update,
    default: () => null,
  }),

  // ==================== 规划数据层 ====================

  /**
   * 行程骨架 — RoutePlanner 的输出。
   *
   * 后续增强节点会基于这个骨架补充 POI/住宿等真实数据。
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
})
