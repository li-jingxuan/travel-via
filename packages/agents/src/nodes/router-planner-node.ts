/**
 * RouterPlanner Agent — 路线骨架规划节点
 *
 * 作用：
 * - 只负责“路线规划”本身（LLM 生成每天骨架）
 * - 不做里程/时长查询（由 driving-distance-agent 负责）
 *
 * 这样拆分后，职责更清晰：
 * 1. router-planner-agent：生成结构化路线骨架
 * 2. driving-distance-agent：补真实驾驶里程与时长
 */

import { SystemMessage, HumanMessage } from "@langchain/core/messages"
import { createDeepSeekReasoner } from "../lib/llm.js"
import type { TravelStateAnnotation } from "../graph/state.js"
import type { RouteSkeletonDay } from "../types/internal.js"
import { ROUTE_PLANNER_SYSTEM_PROMPT } from "../prompts/route-planner.js"
import { agentLog } from "../lib/logger.js"

/** 行程规划专用 LLM 实例 */
const llm = createDeepSeekReasoner({ temperature: 0.7 })

/**
 * 路线骨架生成节点：
 * - 输入：intent
 * - 输出：routeSkeleton + messages
 */
export async function routerPlannerNode(
  state: typeof TravelStateAnnotation.State,
) {
  const intent = state.intent

  agentLog("路线规划", "开始规划，意图信息", intent)
  if (!intent) {
    throw new Error("routerPlannerNode: intent is null, cannot plan route")
  }

  const userContext = JSON.stringify(intent, null, 2)
  const prompt = ROUTE_PLANNER_SYSTEM_PROMPT.replace(
    "{totalDays}",
    String(intent.days),
  )

  const response = await llm.invoke([
    new SystemMessage(prompt),
    new HumanMessage(`请为以下用户需求生成${intent.days}天行程：\n\n${userContext}`),
  ])

  const content = response.content as string
  let routeSkeleton: RouteSkeletonDay[]

  agentLog("路线规划", "模型返回骨架原文", content)

  try {
    const jsonStr = content.replace(/```\w*\n?|\n?```/g, "").trim()
    routeSkeleton = JSON.parse(jsonStr)

    if (!Array.isArray(routeSkeleton)) {
      throw new Error("routeSkeleton is not an array")
    }
  } catch (parseError) {
    agentLog("路线规划", "骨架解析失败，已降级为空数组")
    console.error("RouterPlanner JSON parse failed:", parseError)
    console.error("Raw LLM output:", content)
    routeSkeleton = []
  }

  return {
    routeSkeleton,
    messages: [response],
  }
}
