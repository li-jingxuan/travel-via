/**
 * DrivingDistance Agent — 驾车里程增强节点
 *
 * 作用：
 * - 读取 routeSkeleton 的 waypoints
 * - 调用高德路径规划补充 distance / drivingHours
 * - 写回更新后的 routeSkeleton
 *
 * 失败策略：
 * - 单天失败只影响当天，不中断全流程
 * - 整体失败返回原始 skeleton（可降级）
 */

import { planDrivingByLocations } from "../lib/amap/index.js"
import { agentLog } from "../lib/logger.js"
import type { TravelStateAnnotation } from "../graph/state.js"
import type { RouteSkeletonDay } from "../types/internal.js"

/**
 * 单独增强 routeSkeleton 的驾驶里程与时长字段。
 */
async function attachDrivingMetrics(
  routeSkeleton: RouteSkeletonDay[],
  departurePoint?: string,
): Promise<RouteSkeletonDay[]> {
  const enriched: RouteSkeletonDay[] = []

  for (const dayPlan of routeSkeleton) {
    const { waypoints, day } = dayPlan

    let waypointAddresses = waypoints
      .map((point) => point.address)
      .filter((addr): addr is string => typeof addr === "string" && addr.trim().length > 0)

    /**
     * 第一天补充“出发地 -> 首个落地点”里程计算：
     * - 仅在 departurePoint 非空时生效
     * - 若首个落地点与出发地同名则不重复插入
     */
    const departure = departurePoint?.trim()
    if (day === 1 && departure && waypointAddresses.length > 0) {
      const firstArrival = waypointAddresses[0]
      if (firstArrival && firstArrival.trim() !== departure) {
        waypointAddresses = [departure, ...waypointAddresses]
      }
    }

    // 仍不足两个地点则无法规划驾驶路线，保持原数据。
    if (waypointAddresses.length < 2) {
      enriched.push(dayPlan)
      continue
    }

    const cityHint = waypoints[0]?.city?.trim()

    const metrics = await planDrivingByLocations(waypointAddresses, cityHint)
    if (!metrics) {
      agentLog("驾驶里程增强", `第${dayPlan.day}天高德查询失败，保留原始骨架`)
      enriched.push(dayPlan)
      continue
    }

    agentLog(
      "驾驶里程增强",
      `第${dayPlan.day}天补充完成`,
      `里程${metrics.distanceKm}km`,
      `时长${metrics.drivingHours}h`,
    )

    const drivingEnricher = {
      ...dayPlan,
      distance: metrics.distanceKm,
      drivingHours: metrics.drivingHours,
    }
    console.log("[amap hotel]: ", drivingEnricher)
    enriched.push(drivingEnricher)
  }

  return enriched
}

/**
 * driving-distance-agent 节点函数。
 */
export async function drivingDistanceNode(
  state: typeof TravelStateAnnotation.State,
) {
  const routeSkeleton = state.routeSkeleton
  const intent = state.intent

  agentLog("驾驶里程增强", "开始进行驾驶里程增强", {
    routeDays: routeSkeleton?.length ?? 0,
    departurePoint: intent?.departurePoint ?? "",
  })

  if (!routeSkeleton || !intent) {
    agentLog("驾驶里程增强", "缺少 routeSkeleton 或 intent，跳过增强")
    return {}
  }

  const nextSkeleton = await attachDrivingMetrics(
    routeSkeleton,
    intent.departurePoint,
  )

  agentLog("驾驶里程增强", "驾驶里程增强完成", {
    dayCount: nextSkeleton.length,
  })
  return {
    routeSkeleton: nextSkeleton,
  }
}
