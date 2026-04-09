/**
 * TravelPlanner Graph — 主编排图定义
 *
 * 设计目标：
 * 1. 让本文件聚焦“拓扑结构”本身（节点注册 + 连边）
 * 2. 把路由判定、常量、系统节点实现拆到独立模块
 * 3. 在不改变行为的前提下提高可读性与可维护性
 */

import { StateGraph, START, END } from "@langchain/langgraph"
import { TravelStateAnnotation } from "./state.js"
import {
  intentAgentNode,
  routerPlannerNode,
  drivingDistanceNode,
  poiEnricherNode,
  weatherEnricherNode,
  hotelEnricherNode,
  formatterNode,
  askClarificationNode,
  routePlannerFailedNode,
  routeEnrichEntryNode,
} from "../nodes/index.js"
import { validatorNode } from "../validators/travel-plan.js"
import {
  routeAfterIntent,
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
    .addNode("ask_clarification", askClarificationNode)
    .addNode("route_planner", routerPlannerNode)
    .addNode("route_planner_failed", routePlannerFailedNode)
    .addNode("route_enrich_entry", routeEnrichEntryNode)
    .addNode("driving_distance", drivingDistanceNode)
    .addNode("poi_enricher", poiEnricherNode)
    .addNode("weather_enricher", weatherEnricherNode)
    .addNode("hotel_enricher", hotelEnricherNode)
    .addNode("formatter", formatterNode)
    .addNode("validator", validatorNode)
}

/**
 * 连接入口阶段：
 * START -> intent_agent -> (ask_clarification | route_planner)
 */
function connectEntry(graph: TravelGraphBuilder): TravelGraphBuilder {
  return graph
    .addEdge(START, "intent_agent")
    .addConditionalEdges("intent_agent", routeAfterIntent, {
      ask_clarification: "ask_clarification",
      route_planner: "route_planner",
    })
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
 * route_enrich_entry -> driving/poi/weather/hotel -> formatter
 */
function connectEnrichment(graph: TravelGraphBuilder): TravelGraphBuilder {
  return graph
    .addEdge("route_enrich_entry", "driving_distance")
    .addEdge("route_enrich_entry", "poi_enricher")
    .addEdge("route_enrich_entry", "weather_enricher")
    .addEdge("route_enrich_entry", "hotel_enricher")
    .addEdge("driving_distance", "formatter")
    .addEdge("poi_enricher", "formatter")
    .addEdge("weather_enricher", "formatter")
    .addEdge("hotel_enricher", "formatter")
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

const travelPlannerGraph = connectValidationLoop(
  connectEnrichment(
    connectRoutePlannerStage(
      connectEntry(
        registerNodes(
          new StateGraph(TravelStateAnnotation) as TravelGraphBuilder,
        ),
      ),
    ),
  ),
).compile()

export { travelPlannerGraph }
