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
import { parseRouteWaypoints } from "../lib/waypoint.js"
import type { TravelStateAnnotation } from "../graph/state.js"
import type { RouteSkeletonDay } from "../types/internal.js"

/**
 * 单独增强 routeSkeleton 的驾驶里程与时长字段。
 */
async function attachDrivingMetrics(
  routeSkeleton: RouteSkeletonDay[],
  destinationHint: string,
): Promise<RouteSkeletonDay[]> {
  const enriched: RouteSkeletonDay[] = []

  for (const dayPlan of routeSkeleton) {
    const waypoints = parseRouteWaypoints(dayPlan.waypoints, destinationHint)
    const waypointNames = waypoints.map((point) => point.name || point.alias)
    const cityHint = waypoints[0]?.city || destinationHint

    // 少于两个地点无法规划驾驶路线，保持原数据。
    if (waypointNames.length < 2) {
      enriched.push(dayPlan)
      continue
    }

    const metrics = await planDrivingByLocations(waypointNames, cityHint)
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

    enriched.push({
      ...dayPlan,
      distance: metrics.distanceKm,
      drivingHours: metrics.drivingHours,
    })
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

  if (!routeSkeleton || !intent) {
    agentLog("驾驶里程增强", "缺少 routeSkeleton 或 intent，跳过增强")
    return {}
  }

  const nextSkeleton = await attachDrivingMetrics(routeSkeleton, intent.destination)
  return {
    routeSkeleton: nextSkeleton,
  }
}
