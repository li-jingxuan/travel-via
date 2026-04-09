import type { IActivity } from "@repo/shared-types/travel"
import type { TravelStateAnnotation } from "../graph/state.js"
import { searchScenicPois } from "../lib/amap.js"
import { agentLog } from "../lib/logger.js"

function parseWaypointNames(waypointsRaw: string): string[] {
  try {
    const parsed = JSON.parse(waypointsRaw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

/**
 * POI enrich 节点：
 * - 读取 routeSkeleton 中每天的活动骨架
 * - 按活动名称向高德检索候选景点详情
 * - 产出 enrichedActivities(Map<dayIndex, IActivity[]>)
 *
 * 失败策略：单个景点查询失败时降级为 skeleton 原始数据，不中断整图。
 */
export async function poiEnricherNode(
  state: typeof TravelStateAnnotation.State,
) {
  const skeleton = state.routeSkeleton
  const intent = state.intent

  if (!skeleton || !intent) {
    agentLog("景点增强", "缺少 routeSkeleton 或 intent，跳过景点增强")
    return {}
  }

  const activityMap = new Map<number, IActivity[]>()
  const errors: string[] = []

  for (const dayPlan of skeleton) {
    const dayIndex = Math.max(dayPlan.day - 1, 0)
    const dayActivities: IActivity[] = []
    const waypointNames = parseWaypointNames(dayPlan.waypoints)
    const cityHint = waypointNames[0] || intent.destination

    for (const activity of dayPlan.activities) {
      const candidates = await searchScenicPois(cityHint, activity.name, 3)
      const best = candidates[0]

      if (!best) {
        errors.push(`POI_ENRICH: 未找到景点候选 - day${dayPlan.day} ${activity.name}`)
        dayActivities.push({
          name: activity.name,
          description: activity.description,
          suggestedHours: activity.suggestedHours,
          ticketPriceCny: 0,
          openingHours: "待查询",
          images: [],
        })
        continue
      }

      const ratingText = best.rating ? `评分${best.rating}` : "评分待补充"
      const costText = best.avgCostCny ? `人均约${best.avgCostCny}元` : "人均消费待补充"
      const enrichedDescription = `${activity.description}（${ratingText}，${costText}）`

      dayActivities.push({
        name: best.name,
        description: enrichedDescription,
        suggestedHours: activity.suggestedHours,
        ticketPriceCny: best.avgCostCny ?? 0,
        openingHours: best.openingHours ?? "待查询",
        images: best.images,
      })
    }

    activityMap.set(dayIndex, dayActivities)
    agentLog("景点增强", `第${dayPlan.day}天完成`, `活动数=${dayActivities.length}`)
  }

  return {
    enrichedActivities: activityMap,
    ...(errors.length > 0 ? { errors } : {}),
  }
}
