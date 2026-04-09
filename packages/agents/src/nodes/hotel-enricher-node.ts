import type { IAccommodation } from "@repo/shared-types/travel"
import type { TravelStateAnnotation } from "../graph/state.js"
import { searchHotels } from "../lib/amap.js"
import { agentLog } from "../lib/logger.js"

/**
 * 住宿 enrich 节点：
 * - 读取 routeSkeleton 每天的住宿骨架
 * - 用“目的地 + 住宿名”到高德检索酒店候选
 * - 输出 enrichedAccommodation(Map<dayIndex, IAccommodation[]>)
 */
export async function hotelEnricherNode(
  state: typeof TravelStateAnnotation.State,
) {
  const skeleton = state.routeSkeleton
  const intent = state.intent

  if (!skeleton || !intent) {
    agentLog("住宿增强", "缺少 routeSkeleton 或 intent，跳过住宿增强")
    return {}
  }

  const hotelMap = new Map<number, IAccommodation[]>()
  const errors: string[] = []

  for (const dayPlan of skeleton) {
    const dayIndex = Math.max(dayPlan.day - 1, 0)
    const seedHotelName =
      dayPlan.accommodation[0]?.name || `${intent.destination} 住宿`

    const candidates = await searchHotels(intent.destination, seedHotelName, 3)
    if (candidates.length === 0) {
      errors.push(`HOTEL_ENRICH: 酒店检索失败 - day${dayPlan.day} ${seedHotelName}`)
      hotelMap.set(
        dayIndex,
        dayPlan.accommodation.map((item) => ({
          name: item.name,
          address: item.address,
          feature: item.feature,
        })),
      )
      continue
    }

    const hotels: IAccommodation[] = candidates.map((hotel) => ({
      name: hotel.name,
      address: hotel.address,
      feature: hotel.rating
        ? `${hotel.type ?? "酒店"}｜评分${hotel.rating}`
        : hotel.type ?? "酒店",
      price: hotel.avgCostCny ?? undefined,
    }))

    hotelMap.set(dayIndex, hotels)
    agentLog("住宿增强", `第${dayPlan.day}天完成`, `候选数=${hotels.length}`)
  }

  return {
    enrichedAccommodation: hotelMap,
    ...(errors.length > 0 ? { errors } : {}),
  }
}
