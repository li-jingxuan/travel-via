import type { IActivity } from "@repo/shared-types/travel"
import type { TravelStateAnnotation } from "../graph/state.js"
import type { RouteSkeletonActivity } from "../types/index.js"
import { searchScenicPois } from "../lib/amap/index.js"
import { agentLog } from "../lib/logger.js"

// LLM 偶尔会把“参观/游览/打卡”等动作词拼到地点名后面。
// 这里做轻量兜底清洗，尽量保留标准 POI 名称，提高高德检索命中率。
const normalizeActivityPoiName = (name: string): string =>
  name
    .trim()
    .replace(/(参观|游览|打卡|体验|漫步|逛街|拍照|观光|休整|入住)$/, "")
    .trim()

const buildFallbackActivity = ({
  name,
  description,
  suggestedHours,
}: RouteSkeletonActivity): IActivity => ({
  name,
  description,
  suggestedHours,
  ticketPriceCny: 0,
  openingHours: "待查询",
  images: [],
})

const buildEnrichedDescription = (
  description: string,
  rating?: number | null,
  avgCostCny?: number | null,
) => {
  const ratingText = rating ? `评分${rating}` : "评分待补充"
  const costText = avgCostCny ? `人均约${avgCostCny}元` : "人均消费待补充"

  return `${description}（${ratingText}，${costText}）`
}

const buildEnrichedActivity = (
  activity: RouteSkeletonActivity,
  {
    name,
    rating,
    avgCostCny,
    openingHours,
    images,
  }: Awaited<ReturnType<typeof searchScenicPois>>[number],
): IActivity => ({
  name,
  description: buildEnrichedDescription(activity.description, rating, avgCostCny),
  suggestedHours: activity.suggestedHours,
  ticketPriceCny: avgCostCny ?? 0,
  openingHours: openingHours ?? "待查询",
  images,
})

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

  agentLog("景点增强", "开始进行景点增强", {
    routeDays: skeleton?.length ?? 0,
  })

  if (!skeleton || !intent) {
    agentLog("景点增强", "缺少 routeSkeleton 或 intent，跳过景点增强")
    return {}
  }

  const activityMap = new Map<number, IActivity[]>()
  const errors: string[] = []

  for (const dayPlan of skeleton) {
    const { day, activities } = dayPlan
    const dayIndex = Math.max(day - 1, 0)
    const dayActivities: IActivity[] = []

    for (const activity of activities) {
      const { city, name } = activity
      const cityHint = city?.trim()
      const keyword = normalizeActivityPoiName(name)

      if (!cityHint || !keyword) {
        errors.push(`POI_ENRICH: 缺少 city 或 name - day${day} ${name || "unknown"}`)
        dayActivities.push(buildFallbackActivity(activity))
        continue
      }

      const candidates = await searchScenicPois(cityHint, keyword, 3)
      const best = candidates[0]

      if (!best) {
        errors.push(`POI_ENRICH: 未找到景点候选 - day${day} ${cityHint} ${keyword}`)
        dayActivities.push(buildFallbackActivity(activity))
        continue
      }

      dayActivities.push(buildEnrichedActivity(activity, best))
    }

    activityMap.set(dayIndex, dayActivities)
    agentLog("景点增强", `第${day}天完成`, `活动数=${dayActivities.length}`)
  }

  agentLog("景点增强", "景点增强完成", {
    dayCount: activityMap.size,
    errorCount: errors.length,
  })

  return {
    enrichedActivities: activityMap,
    ...(errors.length > 0 ? { errors } : {}),
  }
}
