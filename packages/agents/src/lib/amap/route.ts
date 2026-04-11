import { agentLog } from "../logger.js"
import { fetchAmap } from "./client.js"
import type {
  AmapDrivingResponse,
  AmapGeocodeResponse,
  DrivingMetrics,
} from "./types.js"

/**
 * 解析 geocode.location（lng,lat）为标准字符串。
 * 失败返回 null，交给上游做降级。
 */
function parseLocation(location: string | undefined): string | null {
  if (!location) return null
  const [lng, lat] = location.split(",")
  if (!lng || !lat) return null
  const lngNum = Number(lng)
  const latNum = Number(lat)
  if (!Number.isFinite(lngNum) || !Number.isFinite(latNum)) return null
  return `${lngNum},${latNum}`
}

/**
 * 驾车响应映射器：米/秒 -> 公里/小时。
 */
function mapDrivingResponse(raw: AmapDrivingResponse): DrivingMetrics | null {
  if (raw.status !== "1") return null
  const firstPath = raw.route?.paths?.[0]
  const distanceMeters = Number(firstPath?.distance ?? "0")
  const durationSeconds = Number(firstPath?.duration ?? "0")
  if (!Number.isFinite(distanceMeters) || !Number.isFinite(durationSeconds)) {
    return null
  }

  return {
    distanceKm: Number((distanceMeters / 1000).toFixed(1)),
    drivingHours: Number((durationSeconds / 3600).toFixed(1)),
  }
}

/**
 * 驾车参数构建器：
 * - origin/destination 必填
 * - waypoints 使用分号分隔（高德接口约定）
 */
function buildDrivingParams(
  origin: string,
  destination: string,
  waypoints: string[],
): Record<string, string> {
  return {
    origin,
    destination,
    ...(waypoints.length > 0 ? { waypoints: waypoints.join(";") } : {}),
  }
}

/**
 * 地址地理编码。
 * 说明：
 * - cityHint 用于提升命中率
 * - 失败不抛异常，返回 null 由调用方兜底
 */
async function geocodeAddress(
  address: string,
  cityHint?: string,
): Promise<string | null> {
  const data = await fetchAmap<AmapGeocodeResponse>("/v3/geocode/geo", {
    address,
    ...(cityHint ? { city: cityHint } : {}),
  })

  if (!data || data.status !== "1") {
    agentLog("高德", "地理编码失败", address, data?.info ?? "unknown")
    return null
  }

  return parseLocation(data.geocodes?.[0]?.location)
}

/**
 * 驾车路线查询：
 * 1. 地点文本 -> 坐标
 * 2. 坐标调用 driving 接口
 * 3. 输出公里/小时
 */
export async function planDrivingByLocations(
  locations: string[],
  cityHint?: string,
): Promise<DrivingMetrics | null> {
  // 至少需要起点和终点。
  if (locations.length < 2) return null

  const coordinateList: string[] = []
  for (const locationName of locations) {
    const coordinate = await geocodeAddress(locationName, cityHint)
    if (!coordinate) {
      agentLog("高德", "路径规划前置失败：地点无法地理编码", locationName)
      return null
    }
    coordinateList.push(coordinate)
  }

  const origin = coordinateList[0]
  const destination = coordinateList[coordinateList.length - 1]
  if (!origin || !destination) return null

  // 中间坐标作为 waypoints 参与路径规划。
  const data = await fetchAmap<AmapDrivingResponse>(
    "/v3/direction/driving",
    buildDrivingParams(origin, destination, coordinateList.slice(1, -1)),
  )

  if (!data) return null
  const mapped = mapDrivingResponse(data)
  if (!mapped) {
    agentLog("高德", "驾车路径规划失败", data.info ?? "unknown")
    return null
  }

  return mapped
}
