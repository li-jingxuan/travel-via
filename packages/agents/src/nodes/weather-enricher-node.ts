import type { IWeather } from "@repo/shared-types/travel"
import type { TravelStateAnnotation } from "../graph/state.js"
import { getWeatherSnapshot } from "../lib/amap/index.js"
import { ERROR_CODE, formatError } from "../constants/error-code.js"
import { agentLog } from "../lib/logger.js"
import { parseRouteWaypoints } from "../lib/waypoint.js"

/**
 * 天气 enrich 节点：
 * - 从 routeSkeleton 的 waypoints 提取城市候选
 * - 查询高德天气并映射到 IWeather[]
 * - 去重后写入 enrichedWeather
 */
export async function weatherEnricherNode(
  state: typeof TravelStateAnnotation.State,
) {
  const skeleton = state.routeSkeleton
  const intent = state.intent

  agentLog("天气增强", "开始进行天气增强", {
    routeDays: skeleton?.length ?? 0,
  })

  if (!skeleton || !intent) {
    agentLog("天气增强", "缺少 routeSkeleton 或 intent，跳过天气增强")
    return {}
  }

  const cityCandidates = new Set<string>()
  cityCandidates.add(intent.destination)

  for (const dayPlan of skeleton) {
    const waypoints = parseRouteWaypoints(dayPlan.waypoints, intent.destination)
    for (const point of waypoints.slice(0, 2)) {
      if (point.city) {
        cityCandidates.add(point.city)
      }
    }
  }

  const weatherList: IWeather[] = []
  const warnings: string[] = []

  for (const city of cityCandidates) {
    const snapshot = await getWeatherSnapshot(city)
    if (!snapshot) {
      warnings.push(formatError(ERROR_CODE.WEATHER_ENRICH, `天气查询失败 - ${city}`))
      continue
    }

    weatherList.push({
      area: snapshot.area,
      daytime: {
        tempMax: snapshot.tempMax,
        tempMin: snapshot.tempMin,
        weather: snapshot.dayWeather,
      },
      nighttime: {
        tempMax: snapshot.tempMax,
        tempMin: snapshot.tempMin,
        weather: snapshot.nightWeather,
      },
      clothing: snapshot.clothing,
    })
  }

  agentLog("天气增强", "天气增强成功", {
    cityCount: weatherList.length,
    warningCount: warnings.length,
  })

  return {
    enrichedWeather: weatherList,
    ...(warnings.length > 0 ? { warnings } : {}),
  }
}
