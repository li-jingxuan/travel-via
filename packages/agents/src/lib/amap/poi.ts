import { agentLog } from "../logger.js"
import { fetchAmap } from "./client.js"
import type { AmapPlaceTextResponseV5, AmapPoiCandidate } from "./types.js"

interface SearchPoiOptions {
  /** 高德 POI 类型码过滤（如酒店大类 100000） */
  types?: string
  /** 是否限制在当前 city/region 内检索 */
  cityLimit?: boolean
  /** 最低评分过滤（null 表示不过滤） */
  minRating?: number
  /** 类型文本必须包含的关键词（本地二次过滤） */
  includeTypeKeywords?: string[]
  /** 类型文本排除关键词（本地二次过滤） */
  excludeTypeKeywords?: string[]
}

/** 安全数字转换：非法值统一转 null。 */
function toNumberOrNull(value: string | undefined): number | null {
  if (!value) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/** 清洗关键词，避免空白或连续空格影响检索稳定性。 */
function normalizeKeyword(keyword: string): string {
  return keyword.trim().replace(/\s+/g, " ")
}

/**
 * v5 文本检索参数构建器。
 * 只负责参数拼装，不负责请求与错误处理。
 */
function buildPoiTextParams(
  city: string,
  keyword: string,
  limit: number,
  options: SearchPoiOptions,
): Record<string, string> {
  return {
    keywords: normalizeKeyword(keyword),
    region: city,
    page_size: String(limit),
    page_num: "1",
    show_fields: "business,photos",
    ...(options.types ? { types: options.types } : {}),
    ...(options.cityLimit ? { city_limit: "true" } : {}),
  }
}

/**
 * 响应映射器：将高德原始响应转为统一业务 DTO。
 * 只使用 v5 business 字段，不再兼容 v3 biz_ext。
 */
function mapPoiTextResponse(
  raw: AmapPlaceTextResponseV5,
  limit: number,
): AmapPoiCandidate[] {
  if (raw.status !== "1" || !Array.isArray(raw.pois)) return []

  return raw.pois
    .filter((poi) => typeof poi.name === "string" && poi.name.trim().length > 0)
    .slice(0, limit)
    .map((poi) => ({
      name: poi.name?.trim() ?? "未知景点",
      address: poi.address?.trim() ?? "地址待补充",
      rating: toNumberOrNull(poi.business?.rating),
      avgCostCny: toNumberOrNull(poi.business?.cost),
      openingHours: poi.business?.opentime_today?.trim() ?? null,
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
 * POI 本地过滤与排序：
 * - 过滤评分阈值
 * - 类型关键词包含/排除
 * - 名称+地址去重
 * - 按评分优先排序
 */
function filterAndSortCandidates(
  candidates: AmapPoiCandidate[],
  options: SearchPoiOptions,
): AmapPoiCandidate[] {
  const includeKeywords = options.includeTypeKeywords ?? []
  const excludeKeywords = options.excludeTypeKeywords ?? []

  const filtered = candidates.filter((item) => {
    if (options.minRating !== undefined && options.minRating !== null) {
      if ((item.rating ?? 0) < options.minRating) return false
    }

    const typeText = item.type ?? ""
    if (
      includeKeywords.length > 0 &&
      !includeKeywords.some((keyword) => typeText.includes(keyword))
    ) {
      return false
    }

    if (
      excludeKeywords.length > 0 &&
      excludeKeywords.some((keyword) => typeText.includes(keyword))
    ) {
      return false
    }
    return true
  })

  const deduped = new Map<string, AmapPoiCandidate>()
  for (const item of filtered) {
    const key = `${item.name}::${item.address}`
    if (!deduped.has(key)) {
      deduped.set(key, item)
    }
  }

  return [...deduped.values()].sort((a, b) => {
    const ratingA = a.rating ?? 0
    const ratingB = b.rating ?? 0
    if (ratingA !== ratingB) return ratingB - ratingA
    return a.name.localeCompare(b.name)
  })
}

/**
 * v5 POI 文本检索（景点）。
 */
export async function searchScenicPois(
  city: string,
  keyword: string,
  limit = 5,
): Promise<AmapPoiCandidate[]> {
  const options: SearchPoiOptions = {
    types: "110000",
    cityLimit: true,
    minRating: 3,
    // 景点检索排除明显住宿业态，减少噪音结果。
    excludeTypeKeywords: ["酒店", "宾馆", "民宿"],
  }

  const data = await fetchAmap<AmapPlaceTextResponseV5>(
    "/v5/place/text",
    buildPoiTextParams(city, keyword, limit, options),
  )
  if (!data) return []

  const candidates = filterAndSortCandidates(
    mapPoiTextResponse(data, limit),
    options,
  ).slice(0, limit)
  if (candidates.length === 0) {
    // 保留日志，便于排查 city/keyword 参数问题。
    agentLog("高德", "景点检索失败", city, keyword, data.info ?? "unknown")
  }
  return candidates
}

/**
 * 酒店检索：
 * 仍复用 v5 POI 文本检索，通过关键词约束到酒店语义。
 */
export async function searchHotels(
  city: string,
  keyword: string,
  limit = 3,
): Promise<AmapPoiCandidate[]> {
  const options: SearchPoiOptions = {
    // 酒店大类：100000
    types: "100000",
    cityLimit: true,
    minRating: 3,
    includeTypeKeywords: ["酒店", "宾馆", "民宿"],
  }

  const hotelKeyword = keyword.trim() ? `${keyword} 酒店` : `${city} 酒店`
  const data = await fetchAmap<AmapPlaceTextResponseV5>(
    "/v5/place/text",
    buildPoiTextParams(city, hotelKeyword, limit, options),
  )
  if (!data) return []

  const candidates = filterAndSortCandidates(
    mapPoiTextResponse(data, limit),
    options,
  ).slice(0, limit)

  if (candidates.length === 0) {
    agentLog("高德", "酒店检索失败", city, hotelKeyword, data.info ?? "unknown")
  }

  return candidates
}
