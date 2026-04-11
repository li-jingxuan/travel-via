import { agentLog } from "../logger.js"
import { fetchAmap } from "./client.js"
import type { AmapWeatherResponse, AmapWeatherSnapshot } from "./types.js"

/** 安全数字转换：非法值转 null。 */
function toNumberOrNull(value: string | undefined): number | null {
  if (!value) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/** 温度区间到穿衣建议的简单规则映射。 */
function buildClothingAdvice(tempMax: number, tempMin: number): string {
  if (tempMax >= 32) return "天气炎热，建议短袖+防晒，及时补水。"
  if (tempMax >= 25) return "气温较高，建议轻薄透气着装。"
  if (tempMin <= 5) return "早晚偏冷，建议携带厚外套。"
  if (tempMin <= 12) return "温差较大，建议带薄外套分层穿搭。"
  return "体感舒适，建议常规出游着装。"
}

/**
 * 天气响应映射器：
 * - 从 forecast/casts 中提取首日信息
 * - 生成统一天气快照结构
 */
function mapWeatherResponse(
  raw: AmapWeatherResponse,
  fallbackCity: string,
): AmapWeatherSnapshot | null {
  if (raw.status !== "1") return null

  const firstForecast = raw.forecasts?.[0]
  const firstCast = firstForecast?.casts?.[0]
  if (!firstForecast || !firstCast) return null

  const tempMax = toNumberOrNull(firstCast.daytemp) ?? 26
  const tempMin = toNumberOrNull(firstCast.nighttemp) ?? 18

  return {
    area: firstForecast.city?.trim() || fallbackCity,
    dayWeather: firstCast.dayweather?.trim() || "晴",
    nightWeather: firstCast.nightweather?.trim() || "晴",
    tempMax,
    tempMin,
    clothing: buildClothingAdvice(tempMax, tempMin),
  }
}

/**
 * 城市天气快照查询。
 */
export async function getWeatherSnapshot(city: string): Promise<AmapWeatherSnapshot | null> {
  const data = await fetchAmap<AmapWeatherResponse>("/v3/weather/weatherInfo", {
    city,
    extensions: "all",
  })
  if (!data) return null

  const snapshot = mapWeatherResponse(data, city)
  if (!snapshot) {
    // 映射失败通常是响应缺字段或 city 不可识别。
    agentLog("高德", "天气查询失败", city, data.info ?? "unknown")
    return null
  }
  return snapshot
}
