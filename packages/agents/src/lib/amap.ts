import { loadAgentsEnv } from "./env.js"
import { agentLog } from "./logger.js"

loadAgentsEnv()

const AMAP_BASE_URL = "https://restapi.amap.com"
const AMAP_TIMEOUT_MS = 8000

/** 高德地理编码接口响应（仅保留当前业务会用到的字段） */
interface AmapGeocodeResponse {
  status?: string
  info?: string
  geocodes?: Array<{ location?: string }>
}

/** 高德驾车路径接口响应（仅保留当前业务会用到的字段） */
interface AmapDrivingResponse {
  status?: string
  info?: string
  route?: {
    paths?: Array<{
      distance?: string
      duration?: string
    }>
  }
}

/** 高德 POI 文本搜索接口响应（仅保留当前业务会用到的字段） */
interface AmapPlaceTextResponse {
  status?: string
  info?: string
  pois?: Array<{
    name?: string
    address?: string
    type?: string
    biz_ext?: {
      rating?: string
      cost?: string
      open_time?: string
    }
    photos?: Array<{
      title?: string
      url?: string
    }>
  }>
}

/** 高德天气接口响应（仅保留当前业务会用到的字段） */
interface AmapWeatherResponse {
  status?: string
  info?: string
  forecasts?: Array<{
    city?: string
    casts?: Array<{
      dayweather?: string
      nightweather?: string
      daytemp?: string
      nighttemp?: string
    }>
  }>
}

/** 路径规划结果：统一输出为公里/小时，减少上游重复换算。 */
export interface DrivingMetrics {
  distanceKm: number
  drivingHours: number
}

/** POI 候选：景点与酒店检索共用的结构化输出。 */
export interface AmapPoiCandidate {
  name: string
  address: string
  rating: number | null
  avgCostCny: number | null
  openingHours: string | null
  type: string | null
  images: Array<{
    description: string
    imgSrc: string
  }>
}

/** 天气快照：用于行程展示和穿衣建议。 */
export interface AmapWeatherSnapshot {
  area: string
  dayWeather: string
  nightWeather: string
  tempMax: number
  tempMin: number
  clothing: string
}

/**
 * 高德 GET 请求封装：
 * 1. 自动注入 `AMAP_KEY`
 * 2. 内置超时控制，避免单请求拖慢整个 Graph
 * 3. 异常统一降级为 null，由上游决定 fallback
 */
async function fetchAmap(
  path: string,
  params: Record<string, string>,
): Promise<unknown> {
  const key = process.env.AMAP_KEY?.trim()
  if (!key) {
    agentLog("高德", "未配置 AMAP_KEY，跳过高德请求")
    return null
  }

  const query = new URLSearchParams({
    key,
    ...params,
  })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), AMAP_TIMEOUT_MS)

  try {
    const response = await fetch(`${AMAP_BASE_URL}${path}?${query.toString()}`, {
      method: "GET",
      signal: controller.signal,
    })

    if (!response.ok) {
      agentLog("高德", "HTTP 请求失败", path, response.status)
      return null
    }

    return await response.json()
  } catch (error) {
    agentLog("高德", "请求异常", path, (error as Error).message)
    return null
  } finally {
    clearTimeout(timeout)
  }
}

function toNumberOrNull(value: string | undefined): number | null {
  if (!value) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * 解析高德 `location`（lng,lat）并做合法性校验。
 * 返回标准化坐标字符串，失败则返回 null。
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
 * 地址转经纬度：
 * - 输入：地址 + 可选城市提示（提高命中率）
 * - 输出：`lng,lat`；失败时返回 null（不抛错）
 */
async function geocodeAddress(
  address: string,
  cityHint?: string,
): Promise<string | null> {
  const data = (await fetchAmap("/v3/geocode/geo", {
    address,
    ...(cityHint ? { city: cityHint } : {}),
  })) as AmapGeocodeResponse | null

  if (!data || data.status !== "1") {
    agentLog("高德", "地理编码失败", address, data?.info ?? "unknown")
    return null
  }

  return parseLocation(data.geocodes?.[0]?.location)
}

/** 根据高低温生成简单穿衣建议。 */
function buildClothingAdvice(tempMax: number, tempMin: number): string {
  if (tempMax >= 32) return "天气炎热，建议短袖+防晒，及时补水。"
  if (tempMax >= 25) return "气温较高，建议轻薄透气着装。"
  if (tempMin <= 5) return "早晚偏冷，建议携带厚外套。"
  if (tempMin <= 12) return "温差较大，建议带薄外套分层穿搭。"
  return "体感舒适，建议常规出游着装。"
}

/**
 * 根据地点名称列表规划驾车路线，返回距离与时长（公里/小时）。
 */
export async function planDrivingByLocations(
  locations: string[],
  cityHint?: string,
): Promise<DrivingMetrics | null> {
  // 至少要有起点和终点，否则无法规划驾车路径。
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
  // 中间点通过 waypoints（a|b|c）传给高德。
  const midPoints = coordinateList.slice(1, -1)

  const data = (await fetchAmap("/v3/direction/driving", {
    origin,
    destination,
    ...(midPoints.length > 0 ? { waypoints: midPoints.join("|") } : {}),
  })) as AmapDrivingResponse | null

  if (!data || data.status !== "1") {
    agentLog("高德", "驾车路径规划失败", data?.info ?? "unknown")
    return null
  }

  const firstPath = data.route?.paths?.[0]
  // 高德返回单位：distance=米，duration=秒。
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
 * 景点搜索：按关键词 + 城市检索候选 POI。
 */
export async function searchScenicPois(
  city: string,
  keyword: string,
  limit = 5,
): Promise<AmapPoiCandidate[]> {
  const data = (await fetchAmap("/v3/place/text", {
    city,
    keywords: keyword,
    extensions: "all",
    offset: String(limit),
    page: "1",
  })) as AmapPlaceTextResponse | null

  if (!data || data.status !== "1" || !Array.isArray(data.pois)) {
    agentLog("高德", "景点检索失败", city, keyword, data?.info ?? "unknown")
    // 检索失败时返回空数组，避免影响主流程可用性。
    return []
  }

  // 统一做字段清洗，图片最多保留 3 张，控制输出体积。
  return data.pois
    .filter((poi) => typeof poi.name === "string" && poi.name.trim().length > 0)
    .slice(0, limit)
    .map((poi) => ({
      name: poi.name?.trim() ?? "未知景点",
      address: poi.address?.trim() ?? "地址待补充",
      rating: toNumberOrNull(poi.biz_ext?.rating),
      avgCostCny: toNumberOrNull(poi.biz_ext?.cost),
      openingHours: poi.biz_ext?.open_time?.trim() ?? null,
      type: poi.type?.trim() ?? null,
      images:
        poi.photos
          ?.filter((photo) => typeof photo.url === "string")
          .slice(0, 3)
          .map((photo) => ({
            description: photo.title?.trim() || "高德参考图片",
            imgSrc: photo.url as string,
          })) ?? [],
    }))
}

/**
 * 酒店搜索：复用 POI 文本检索，按酒店关键词筛选。
 */
export async function searchHotels(
  city: string,
  keyword: string,
  limit = 3,
): Promise<AmapPoiCandidate[]> {
  // 酒店检索复用 POI 文本搜索，通过关键词约束到酒店语义。
  const hotelKeyword = keyword.trim() ? `${keyword} 酒店` : `${city} 酒店`
  return searchScenicPois(city, hotelKeyword, limit)
}

/**
 * 天气查询：返回城市当日简版天气快照。
 */
export async function getWeatherSnapshot(city: string): Promise<AmapWeatherSnapshot | null> {
  const data = (await fetchAmap("/v3/weather/weatherInfo", {
    city,
    extensions: "all",
  })) as AmapWeatherResponse | null

  if (!data || data.status !== "1") {
    agentLog("高德", "天气查询失败", city, data?.info ?? "unknown")
    return null
  }

  const firstForecast = data.forecasts?.[0]
  const firstCast = firstForecast?.casts?.[0]
  // 若缺少核心天气数据，交给上游做降级策略。
  if (!firstForecast || !firstCast) return null

  // 缺值时给温和默认值，保证穿衣建议始终可生成。
  const tempMax = toNumberOrNull(firstCast.daytemp) ?? 26
  const tempMin = toNumberOrNull(firstCast.nighttemp) ?? 18

  return {
    area: firstForecast.city?.trim() || city,
    dayWeather: firstCast.dayweather?.trim() || "晴",
    nightWeather: firstCast.nightweather?.trim() || "晴",
    tempMax,
    tempMin,
    clothing: buildClothingAdvice(tempMax, tempMin),
  }
}
