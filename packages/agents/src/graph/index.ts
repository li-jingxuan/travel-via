/**
 * TravelPlanner Graph — 主编排图定义
 *
 * 设计目标：
 * 1. 让本文件聚焦“拓扑结构”本身（节点注册 + 连边）
 * 2. 把路由判定、常量、系统节点实现拆到独立模块
 * 3. 在不改变行为的前提下提高可读性与可维护性
 */

import { StateGraph, START, END, MemorySaver } from "@langchain/langgraph"
import { TravelStateAnnotation } from "./state.js"
import {
  intentAgentNode,
  mergeCollectedIntentNode,
  routerPlannerNode,
  drivingDistanceNode,
  poiEnricherNode,
  // weatherEnricherNode,
  hotelEnricherNode,
  formatterNode,
  preFormatterGuardNode,
  askClarificationNode,
  routePlannerFailedNode,
  routeEnrichEntryNode,
} from "../nodes/index.js"
import { validatorNode } from "../validators/travel-plan.js"
import {
  routeAfterRequirementGuard,
  routeAfterPreFormatterGuard,
  routeAfterRoutePlanner,
  shouldRetryOrEnd,
} from "./routing.js"

/**
 * Graph Builder 类型别名。
 *
 * 说明：
 * LangGraph 的 fluent API 在拆分为多个 helper 函数后，节点名字面量类型
 * 很容易在函数边界丢失，导致 addEdge/addConditionalEdges 报类型错误。
 * 这里显式声明为“string 节点名的 StateGraph 构建器”，
 * 保留类型约束的同时避免 `any`。
 */
type TravelGraphBuilder = StateGraph<
  typeof TravelStateAnnotation,
  typeof TravelStateAnnotation.State,
  Partial<typeof TravelStateAnnotation.State>,
  string
>

/**
 * 注册所有节点。
 *
 * 说明：
 * 把 addNode 聚合在一个函数里，便于快速浏览“图里有什么节点”。
 */
function registerNodes(graph: TravelGraphBuilder): TravelGraphBuilder {
  return graph
    .addNode("intent_agent", intentAgentNode)
    // 多轮需求收集
    .addNode("merge_collected_intent", mergeCollectedIntentNode)
    // 条件节点
    .addNode("ask_clarification", askClarificationNode)
    // 规划 骨架
    .addNode("route_planner", routerPlannerNode)
    // 条件节点
    .addNode("route_planner_failed", routePlannerFailedNode)
    // 空节点，用于并发节点入口
    .addNode("route_enrich_entry", routeEnrichEntryNode)

    // 驾车/路线规划增强
    .addNode("driving_distance", drivingDistanceNode)
    // 景点增强
    .addNode("poi_enricher", poiEnricherNode)
    // 天气增强
    // .addNode("weather_enricher", weatherEnricherNode)
    // 酒店增强
    .addNode("hotel_enricher", hotelEnricherNode)
    // formatter 前置守卫
    .addNode("pre_formatter_guard", preFormatterGuardNode)

    // 格式化数据节点
    .addNode("formatter", formatterNode)
    // 数据校验节点
    .addNode("validator", validatorNode)
}

/**
 * 连接入口阶段：
 * START -> intent_agent -> merge_collected_intent -> (ask_clarification | route_planner)
 */
function connectEntry(graph: TravelGraphBuilder): TravelGraphBuilder {
  return graph
    .addEdge(START, "intent_agent")
    // 入口先做多轮需求合并，再决定是追问用户还是进入正式路线规划。
    .addEdge("intent_agent", "merge_collected_intent")
    .addConditionalEdges("merge_collected_intent", routeAfterRequirementGuard, {
      ask_clarification: "ask_clarification",
      route_planner: "route_planner",
    })
    // 缺参时本轮对话结束，等待用户下一轮输入继续同一 thread_id。
    .addEdge("ask_clarification", END)
}

/**
 * 连接 route_planner 阶段：
 * route_planner -> (retry | continue | giveup)
 */
function connectRoutePlannerStage(
  graph: TravelGraphBuilder,
): TravelGraphBuilder {
  return graph
    .addConditionalEdges("route_planner", routeAfterRoutePlanner, {
      retry: "route_planner",
      continue: "route_enrich_entry",
      giveup: "route_planner_failed",
    })
    .addEdge("route_planner_failed", END)
}

/**
 * 连接增强阶段（Fan-out / Fan-in）：
 * route_enrich_entry -> driving/poi/weather/hotel -> pre_formatter_guard
 */
function connectEnrichment(graph: TravelGraphBuilder): TravelGraphBuilder {
  return graph
    .addEdge("route_enrich_entry", "driving_distance")
    .addEdge("route_enrich_entry", "poi_enricher")
    // .addEdge("route_enrich_entry", "weather_enricher")
    .addEdge("route_enrich_entry", "hotel_enricher")
    .addEdge("driving_distance", "pre_formatter_guard")
    .addEdge("poi_enricher", "pre_formatter_guard")
    // .addEdge("weather_enricher", "pre_formatter_guard")
    .addEdge("hotel_enricher", "pre_formatter_guard")
}

/**
 * formatter 前置守卫：
 * pre_formatter_guard -> (retry | continue)
 */
function connectPreFormatterGuard(
  graph: TravelGraphBuilder,
): TravelGraphBuilder {
  return graph.addConditionalEdges(
    "pre_formatter_guard",
    routeAfterPreFormatterGuard,
    {
      retry: "route_planner",
      continue: "formatter",
    },
  )
}

/**
 * 连接收敛阶段：
 * formatter -> validator -> (retry | success)
 */
function connectValidationLoop(graph: TravelGraphBuilder): TravelGraphBuilder {
  return graph
    .addEdge("formatter", "validator")
    .addConditionalEdges("validator", shouldRetryOrEnd, {
      retry: "route_planner",
      success: END,
    })
}

// V1 会话记忆（短期记忆）：
// - 使用 LangGraph 内存型 checkpointer 保存同一 thread_id 的状态快照
// - 后续可无缝替换为 Redis/Postgres 等持久化 checkpointer
export const graphCheckpointer = new MemorySaver()

const travelPlannerGraph = connectValidationLoop(
  connectPreFormatterGuard(
    connectEnrichment(
      connectRoutePlannerStage(
        connectEntry(
          registerNodes(
            new StateGraph(TravelStateAnnotation) as TravelGraphBuilder,
          ),
        ),
      ),
    ),
  ),
).compile({
  checkpointer: graphCheckpointer,
})

export { travelPlannerGraph }
