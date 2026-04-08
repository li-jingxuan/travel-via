/**
 * TravelPlanner Graph — 主编排图定义
 *
 * ============================================================================
 * 架构总览
 * ============================================================================
 *
 * 本文件定义了 LangGraph StateGraph 的完整拓扑结构，包括：
 * 1. 节点注册（addNode）— 每个 Agent 对应一个节点
 * 2. 边定义（addEdge）— 固定的流转路径
 * 3. 条件边（addConditionalEdges）— 根据状态动态决定下一步
 * 4. 编译（compile）— 生成可执行的 Graph 实例
 *
 * MVP 阶段的拓扑（Phase 1，无 Tool Agent）：
 *
 *   START
 *     │
 *     ▼
 *   ┌──────────────┐
 *   │  intent_agent │  ← deepseek-v3, 用户文本 → TravelIntent
 *   └──────┬───────┘
 *          │
 *          ▼
 *   ┌───────────────┐
 *   │ route_planner │  ← deepseek-reasoner, intent → RouteSkeletonDay[]
 *   └───────┬───────┘
 *           │
 *           ▼
 *   ┌──────────────┐
 *   │   formatter   │  ← deepseek-reasoner, 所有中间数据 → ITravelPlan
 *   └──────┬───────┘
 *          │
 *          ▼
 *   ┌──────────────┐
 *   │   validator   │  ← Zod 校验 finalPlan 是否符合 Schema
 *   └──────┬───────┘
 *          │
 *     ┌────┴────┐
 *     ▼         ▼
 *   END    retry (回退到 route_planner，最多 2 次)
 *
 * ============================================================================
 * Phase 2 将扩展为 Fan-out/Fan-in 并行拓扑：
 *
 *   route_planner ──┬→ poi_agent      ─┐
 *                   ├→ weather_agent  ├──→ formatter → validator
 *                   └→ hotel_agent    ─┘
 *
 * ============================================================================
 * 核心概念说明
 * ============================================================================
 *
 * StateGraph vs 函数式调用：
 *   - 函数式：手动 A(B(args)) 传参，自己控制循环
 *   - StateGraph：声明式定义节点和边，框架控制流转
 *
 * 节点函数签名：
 *   async (state: typeof TravelStateAnnotation.State) => Promise<Partial<State>>
 *   - 输入：当前完整的 State
 *   - 返回：需要更新的字段（未返回的字段保持不变）
 *
 * compile() 之后：
 *   - graph.invoke(initialState)   — 同步执行，返回最终 State
 *   - graph.stream(initialState)  — 流式执行，逐 node 推送事件
 *   - graph.getState(config)      — 获取某个 checkpoint 的状态
 */

import { StateGraph, START, END } from "@langchain/langgraph"
import { TravelStateAnnotation } from "./state.js"
import { intentAgentNode } from "../agents/intent-agent.js"
import { routePlannerNode } from "../agents/route-planner-agent.js"
import { formatterNode } from "../agents/formatter-agent.js"
import { validatorNode } from "../validators/travel-plan.js"

/** 最大重试次数 — Validator 校验失败后最多回退重新规划这么多次 */
const MAX_RETRIES = 2

/**
 * 获取意图中缺失的必填字段
 *
 * 当前在 route_planner 前强制要求：
 * - destination: 目的地
 * - departurePoint: 出发地
 *
 * 说明：
 * 这里用字符串非空校验（trim 后不能为空），
 * 避免出现 "未知" / 空白 / undefined 直接进入规划阶段。
 */
function getMissingRequiredFields(
  state: typeof TravelStateAnnotation.State,
): string[] {
  const intent = state.intent
  if (!intent) return ["destination", "departurePoint"]

  const missing: string[] = []
  if (!intent.destination?.trim()) {
    missing.push("destination")
  }
  if (!intent.departurePoint?.trim()) {
    missing.push("departurePoint")
  }

  return missing
}

/**
 * intent_agent 之后的条件路由：
 * - 信息完整：进入 route_planner
 * - 信息缺失：进入 ask_clarification，提醒用户补充必要字段
 */
function routeAfterIntent(
  state: typeof TravelStateAnnotation.State,
): "ask_clarification" | "route_planner" {
  const missing = getMissingRequiredFields(state)
  return missing.length > 0 ? "ask_clarification" : "route_planner"
}

/**
 * 追问节点：
 * 当意图缺失必要字段时，不继续规划，直接写入可读错误信息并结束流程。
 *
 * 注意：
 * - 这里写入 errors，方便 CLI/API 统一处理。
 * - 使用 "NEED_USER_INPUT:" 前缀，调用方可据此做结构化分支显示。
 */
async function askClarificationNode(
  state: typeof TravelStateAnnotation.State,
) {
  const missing = getMissingRequiredFields(state)

  console.log('----: ', state.intent)
  const readable = missing
    .map((field) =>
      field === "destination"
        ? "目的地（destination）"
        : "出发地（departurePoint）",
    )
    .join("、")

  return {
    errors: [
      `NEED_USER_INPUT: 缺少必要信息：${readable}。请补充后重新提交。`,
    ],
  }
}

/**
 * 条件路由函数 — 决定 Validator 之后走哪条路
 *
 * 由 addConditionalEdges("validator", thisFunc, {...}) 调用，
 * LangGraph 会在 validator 节点执行完毕后自动调用此函数，
 * 根据返回值决定下一步跳转到哪个节点。
 *
 * @param state - 当前完整 State（包含 finalPlan、retryCount、errors 等）
 * @returns "retry" 回到 route_planner 重新生成 | "success" 结束流程
 */
function shouldRetryOrEnd(
  state: typeof TravelStateAnnotation.State,
): "retry" | "success" {
  // 如果 finalPlan 为空，必须重试
  if (!state.finalPlan) return "retry"

  // 达到最大重试次数 → 强制成功（降级模式，返回已有的部分结果 + 错误警告）
  if (state.retryCount >= MAX_RETRIES) {
    return "success"
  }

  // 有新的校验错误且未超限 → 重试
  // 注意：errors.length > retryCount 说明本轮产生了新的错误
  if (state.errors.length > 0 && state.errors.length > state.retryCount) {
    return "retry"
  }

  // 无错误 → 校验通过，正常结束
  return "success"
}

/**
 * 编译后的 TravelPlanner Graph 实例
 *
 * 使用方式：
 * ```ts
 * import { travelPlannerGraph } from "@repo/agents"
 *
 * const result = await travelPlannerGraph.invoke({
 *   userInput: "我想去新疆自驾游，15天，6月份",
 * })
 *
 * console.log(result.finalPlan)  // ITravelPlan | null
 * console.log(result.errors)     // string[] 错误日志
 * ```
 */
const travelPlannerGraph = new StateGraph(TravelStateAnnotation)
  // ========== 节点注册 ==========
  // 每个 addNode 注册一个命名节点，参数为 (节点名, 节点函数)
  // 节点函数签名固定：async (state) => Promise<Partial<State>>

  /** 意图理解节点 — 解析用户自然语言为结构化 TravelIntent */
  .addNode("intent_agent", intentAgentNode)

  /**
   * 补充信息节点 — 当 intent 缺失关键字段时给用户明确提示
   * 该节点不会继续进入 route_planner，而是直接 END。
   */
  .addNode("ask_clarification", askClarificationNode)

  /** 行程规划节点 — 基于 TravelIntent 生成多天行程骨架 */
  .addNode("route_planner", routePlannerNode)

  /** 格式化组装节点 — 将所有中间数据组装为符合 Schema 的 ITravelPlan */
  .addNode("formatter", formatterNode)

  /** 校验节点 — Zod Schema 校验，控制重试逻辑 */
  .addNode("validator", validatorNode)

  // ========== 边定义 ==========
  // addEdge(a, b) 表示从节点 a 执行完后无条件转移到 b

  /** 图入口：START → 第一个节点 intent_agent */
  .addEdge(START, "intent_agent")

  /**
   * 意图理解后先做必填信息分流：
   * - 信息完整    → route_planner
   * - 信息不完整  → ask_clarification（提醒补充）
   */
  .addConditionalEdges("intent_agent", routeAfterIntent, {
    ask_clarification: "ask_clarification",
    route_planner: "route_planner",
  })

  /** 追问节点执行后直接结束，等待用户补充输入再发起下一轮 invoke */
  .addEdge("ask_clarification", END)

  /** 行程规划完成后进入格式化（MVP阶段；Phase2会改为fan-out到3个并行Agent） */
  .addEdge("route_planner", "formatter")

  /** 格式化完成后进入校验 */
  .addEdge("formatter", "validator")

  // ========== 条件边 ==========
  // addConditionalEdges(source, routerFn, pathMap)
  //   source   : 源节点名
  //   routerFn : 路由函数，返回目标节点名字符串或特殊常量 END
  //   pathMap  : 路由返回值 → 目标节点的映射表

  /**
   * Validator 之后的条件路由：
   * - "retry"   → 回到 route_planner 重新规划（会保留之前的 retryCount+1）
   * - "success" → 流程结束，返回最终结果
   *
   * 这形成了一个"带重试的闭环"：
   *   route_planner → formatter → validator ──→ (失败) → route_planner ...
   *                                           └─→ (成功) → END
   */
  .addConditionalEdges("validator", shouldRetryOrEnd, {
    retry: "route_planner",
    success: END,
  })

  // ========== 编译 ==========
  // compile() 将图定义转换为可执行对象。
  // 编译后可以进行 invoke() / stream() / getState() 等操作。
  //
  // 未来可在 compile({ ... }) 中配置：
  //   - interruptBefore / interruptAfter : Human-in-the-loop 断点
  //   - checkpointer                  : CheckpointStore 持久化支持
  //   - store                         : 自定义状态存储
  .compile()

export { travelPlannerGraph }
