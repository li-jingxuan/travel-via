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
import { z } from "zod"
import { createDeepSeekReasoner } from "../lib/llm.js"
import type { TravelStateAnnotation } from "../graph/state.js"
import type { RouteSkeletonDay } from "../types/internal.js"
import { ROUTE_PLANNER_SYSTEM_PROMPT } from "../prompts/index.js"
import { agentLog } from "../lib/logger.js"
import { parseRouteWaypoints } from "../lib/waypoint.js"

/** 行程规划专用 LLM 实例 */
const llm = createDeepSeekReasoner({ temperature: 0.7 })

const routeWaypointSchema = z.object({
  alias: z.string().trim().min(1),
  address: z.string().trim().min(1),
  city: z.string().trim().min(1),
  province: z.string().trim().min(1),
})

const routeSkeletonActivitySchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().min(1),
  suggestedHours: z.string().trim().min(1),
  city: z.string().trim().min(1),
  province: z.string().trim().min(1),
})

const routeSkeletonAccommodationSchema = z.object({
  name: z.string().trim().min(1),
  address: z.string().trim().min(1),
  feature: z.string().trim().min(1),
  city: z.string().trim().min(1),
  province: z.string().trim().min(1),
})

const routeSkeletonDaySchema = z.object({
  day: z.number().int().positive(),
  title: z.string().trim().min(1),
  waypoints: z.array(routeWaypointSchema).min(1).max(16),
  description: z.string().trim().min(1),
  activities: z.array(routeSkeletonActivitySchema).min(1).max(5),
  accommodation: z.array(routeSkeletonAccommodationSchema).min(1).max(3),
  foodRecommendation: z.array(z.string().trim().min(1)).min(1).max(3),
  commentTips: z.string().trim().min(1).optional(),
  distance: z.number().finite().nonnegative().optional(),
  drivingHours: z.number().finite().nonnegative().optional(),
})

const routeSkeletonSchema = z.array(routeSkeletonDaySchema).nonempty()

function validateRouteSkeleton(
  value: unknown,
  expectedDays: number,
): { success: true; data: RouteSkeletonDay[] } | { success: false; message: string } {
  const result = routeSkeletonSchema.safeParse(value)
  if (!result.success) {
    const issueText = result.error.issues
      .slice(0, 3)
      .map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join(".") : "root"
        return `${path}: ${issue.message}`
      })
      .join("; ")

    return {
      success: false,
      message: `routeSkeleton schema 校验失败: ${issueText || "unknown"}`,
    }
  }

  const skeleton = result.data
  if (skeleton.length !== expectedDays) {
    return {
      success: false,
      message: `routeSkeleton 天数不匹配: expected=${expectedDays}, actual=${skeleton.length}`,
    }
  }

  const hasSequentialDays = skeleton.every((item, idx) => item.day === idx + 1)
  if (!hasSequentialDays) {
    return {
      success: false,
      message: "routeSkeleton.day 必须从 1 开始递增且连续",
    }
  }

  return { success: true, data: skeleton }
}

/**
 * 统一规范 waypoints：
 * - 优先保留模型给出的结构化 waypoint（alias/address/city/province）
 * - 若模型返回旧格式 string[]，自动转为新结构
 * - 若完全不可用，兜底注入目的地，避免后续高德参数为空
 */
function normalizeSkeletonWaypoints(
  skeleton: RouteSkeletonDay[],
  fallbackCity: string,
): RouteSkeletonDay[] {
  return skeleton.map((dayPlan) => {
    const parsed = parseRouteWaypoints(dayPlan.waypoints, fallbackCity)
    const normalized =
      parsed.length > 0
        ? parsed
        : [
          {
            alias: fallbackCity,
            address: fallbackCity,
            city: fallbackCity,
            province: "",
          },
        ]

    return {
      ...dayPlan,
      waypoints: normalized,
    }
  })
}

/**
 * 路线骨架生成节点：
 * - 输入：intent
 * - 输出：routeSkeleton + messages
 */
export async function routerPlannerNode(
  state: typeof TravelStateAnnotation.State,
) {
  const intent = state.intent

  agentLog("路线规划", "开始生成路线骨架", {
    destination: intent?.destination,
    days: intent?.days,
    travelType: intent?.travelType,
  })
  if (!intent) {
    agentLog("路线规划", "路线骨架生成失败", {
      reason: "intent 为空",
    })
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
  let routeSkeleton: RouteSkeletonDay[] | null = null

  try {
    const jsonStr = content.replace(/```\w*\n?|\n?```/g, "").trim()
    const parsed = JSON.parse(jsonStr) as unknown

    const validated = validateRouteSkeleton(parsed, intent.days)
    if (!validated.success) {
      throw new Error(validated.message)
    }
    routeSkeleton = normalizeSkeletonWaypoints(validated.data, intent.destination)
  } catch (parseError) {
    /**
     * 解析失败策略：
     * - 不继续把坏骨架传给下游节点
     * - 累加 routePlannerRetryCount，交由 graph 条件边决定是否重试
     */
    agentLog("路线规划", "路线骨架生成失败", {
      reason: "模型输出解析失败",
      error: parseError instanceof Error ? parseError.message : String(parseError),
      retryCount: state.routePlannerRetryCount + 1,
    })
    console.error("RouterPlanner JSON parse failed:", parseError)
    console.error("Raw LLM output:", content)

    return {
      routeSkeleton: null,
      routePlannerRetryCount: state.routePlannerRetryCount + 1,
      messages: [response],
    }
  }

  agentLog("路线规划", "路线骨架生成成功", {
    dayCount: routeSkeleton.length,
    retryCount: 0,
  })

  // 成功产出有效骨架后，重置 route_planner 专用重试计数。
  return {
    routeSkeleton,
    routePlannerRetryCount: 0,
    messages: [response],
  }
}
