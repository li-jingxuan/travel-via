import { agentLog } from "../logger.js"
import { fetchAmap } from "./client.js"
import type { AmapPlaceTextResponseV5, AmapPoiCandidate } from "./types.js"

const AMAP_SUCCESS_STATUS = "1"
const POI_QUERY_MAX_RETRY_COUNT = 3
const POI_RETRY_DELAY_MIN_MS = 500
const POI_RETRY_DELAY_MAX_MS = 1000

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

/**
 * 生成重试等待时间（500-1000ms 随机抖动）。
 * 通过随机抖动降低并发场景下的同频重试冲突。
 */
function randomRetryDelayMs(): number {
  const delayRange = POI_RETRY_DELAY_MAX_MS - POI_RETRY_DELAY_MIN_MS
  return POI_RETRY_DELAY_MIN_MS + Math.floor(Math.random() * (delayRange + 1))
}

/**
 * 重试触发条件：
 * 1. 接口 status 异常
 * 2. pois 不是数组或长度 <= 0
 */
function resolvePoiRetryReason(
  data: AmapPlaceTextResponseV5 | null,
): { shouldRetry: boolean; reason: string } {
  if (!data) {
    return { shouldRetry: true, reason: "响应为空" }
  }
  if (data.status !== AMAP_SUCCESS_STATUS) {
    return { shouldRetry: true, reason: `status异常(${data.status ?? "unknown"})` }
  }
  if (!Array.isArray(data.pois)) {
    return { shouldRetry: true, reason: "pois 非数组" }
  }
  if (data.pois.length <= 0) {
    return { shouldRetry: true, reason: "pois 为空" }
  }
  return { shouldRetry: false, reason: "" }
}

/**
 * 带重试的 POI 文本检索请求。
 * 仅在“status 异常 / pois 为空”时重试，最多重试 3 次。
 */
async function fetchPoiTextWithRetry(
  requestPath: string,
  requestParams: Record<string, string>,
  sceneLabel: "景点检索" | "酒店检索",
): Promise<AmapPlaceTextResponseV5 | null> {
  let lastData: AmapPlaceTextResponseV5 | null = null

  for (let attempt = 0; attempt <= POI_QUERY_MAX_RETRY_COUNT; attempt += 1) {
    const data = await fetchAmap<AmapPlaceTextResponseV5>(
      requestPath,
      requestParams,
    )
    lastData = data

    const { shouldRetry, reason } = resolvePoiRetryReason(data)
    if (!shouldRetry) {
      return data
    }

    if (attempt >= POI_QUERY_MAX_RETRY_COUNT) {
      agentLog("高德", `${sceneLabel}重试耗尽`, {
        path: requestPath,
        params: requestParams,
        attempt: attempt + 1,
        reason,
      })
      return data
    }

    const waitMs = randomRetryDelayMs()
    agentLog("高德", `${sceneLabel}触发重试`, {
      path: requestPath,
      params: requestParams,
      attempt: attempt + 1,
      nextAttempt: attempt + 2,
      reason,
      waitMs,
    })
    await sleep(waitMs)
  }

  return lastData
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
  const params: Record<string, string> = {
    keywords: normalizeKeyword(keyword),
    page_size: String(limit),
    page_num: "1",
    show_fields: "business,photos",
    ...(options.types ? { types: options.types } : {}),
    ...(options.cityLimit ? { city_limit: "true" } : {}),
  }
  if (city) {
    params.region = city
  }

  return params
}

/**
 * 响应映射器：将高德原始响应转为统一业务 DTO。
 * 只使用 v5 business 字段，不再兼容 v3 biz_ext。
 */
function mapPoiTextResponse(
  raw: AmapPlaceTextResponseV5,
  limit: number,
): AmapPoiCandidate[] {
  if (raw.status !== AMAP_SUCCESS_STATUS || !Array.isArray(raw.pois)) return []

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
          .slice(0, 5)
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
  const filtered = candidates.filter((item) => {
    if (options.minRating !== undefined && options.minRating !== null) {
      if ((item.rating ?? 0) < options.minRating) return false
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
    // types: "110000",
    cityLimit: true,
    minRating: 3
  }

  const requestPath = "/v5/place/text"
  const requestParams = buildPoiTextParams(city, keyword, limit, options)
  const data = await fetchPoiTextWithRetry(
    requestPath,
    requestParams,
    "景点检索",
  )
  if (!data) return []

  const candidates = filterAndSortCandidates(
    mapPoiTextResponse(data, limit),
    options,
  ).slice(0, limit)
  // 保留日志，便于排查 city/keyword 参数问题。
  agentLog("高德", candidates.length === 0 ? "景点检索失败" : '景点检索成功', {
    path: requestPath,
    params: requestParams,
    info: data.info ?? "unknown",
  })
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
    minRating: 3
  }

  const hotelKeyword = keyword.trim() ? `${keyword}` : `${city}`
  const requestPath = "/v5/place/text"
  const requestParams = buildPoiTextParams(city, hotelKeyword, limit, options)
  const data = await fetchPoiTextWithRetry(
    requestPath,
    requestParams,
    "酒店检索",
  )
  if (!data) return []

  const candidates = filterAndSortCandidates(
    mapPoiTextResponse(data, limit),
    options,
  ).slice(0, limit)

  if (candidates.length === 0) {
    agentLog("高德", "酒店检索失败, 源数据", data)
    agentLog("高德", "酒店检索失败", {
      path: requestPath,
      params: requestParams,
      info: data.info ?? "unknown",
    })
  }

  return candidates
}
