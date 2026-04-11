import type { RouteWaypoint } from "../types/internal.js"

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

/**
 * 解析 routeSkeleton.day.waypoints。
 *
 * 支持两种输入：
 * - RouteWaypoint[]（新格式）
 * - JSON 字符串（兼容旧格式）
 */
export function parseRouteWaypoints(
  waypointsRaw: unknown,
  fallbackCity = "",
): RouteWaypoint[] {
  try {
    const parsed =
      typeof waypointsRaw === "string" ? JSON.parse(waypointsRaw) : waypointsRaw
    if (!Array.isArray(parsed)) return []

    const result: RouteWaypoint[] = []
    for (const item of parsed) {
      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>
        const alias = clean(record.alias)
        const name = clean(record.name) || alias
        if (!name) continue

        result.push({
          alias: alias || name,
          name,
          city: clean(record.city) || fallbackCity,
          province: clean(record.province),
        })
      }
    }
    return result
  } catch {
    return []
  }
}

/**
 * 将 waypoint 对象数组序列化为稳定 JSON 字符串。
 */
export function stringifyRouteWaypoints(waypoints: RouteWaypoint[]): string {
  return JSON.stringify(
    waypoints.map((item) => ({
      alias: item.alias.trim(),
      name: item.name.trim(),
      city: item.city.trim(),
      province: item.province.trim(),
    })),
  )
}
