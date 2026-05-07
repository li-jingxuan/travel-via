import type { IAccommodation, IActivityImage } from "@repo/shared-types/travel"
import type { TravelStateAnnotation } from "../graph/state.js"
import { searchHotels } from "../lib/amap/index.js"
import { ERROR_CODE, createIssue, type IssueItem } from "../constants/error-code.js"
import { agentLog } from "../lib/logger.js"

const normalizeText = (value: unknown) => typeof value === "string" ? value.trim() : ""
const EMPTY_IMAGES: IActivityImage[] = []

/**
 * 从地址中提取粗粒度 cityHint（如“成都市”“乌鲁木齐市”）。
 * 提取失败返回空字符串。
 */
const extractCityFromAddress = (address: string) => {
  const clean = normalizeText(address)
  if (!clean) return ""

  const cityMatch = clean.match(
    /([\u4e00-\u9fa5]{2,}(?:市|地区|自治州|盟|县))/,
  )
  return cityMatch?.[1] ?? ""
}

/**
 * 生成默认住宿对象，保证 IAccommodation 必填字段完整。
 */
function buildDefaultAccommodation(
  seed: { name?: string; address?: string; feature?: string },
): IAccommodation {
  const name = normalizeText(seed.name) || "无推荐住宿"

  return {
    name,
    address: normalizeText(seed.address) || "",
    feature: normalizeText(seed.feature) || "",
    // 兜底对象也保持 images 字段稳定存在，减少下游判空分支。
    images: EMPTY_IMAGES,
    price: 0,
    booking: ''
  }
}

/**
 * 清洗住宿图片列表：
 * - 仅保留合法的图片 URL
 * - 统一 description 文案兜底
 */
function normalizeAccommodationImages(value: unknown): IActivityImage[] {
  if (!Array.isArray(value)) return EMPTY_IMAGES

  return value
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const normalized = item as { description?: unknown; imgSrc?: unknown }
      return {
        description: normalizeText(normalized.description) || "酒店参考图片",
        imgSrc: normalizeText(normalized.imgSrc),
      }
    })
    .filter((item) => item.imgSrc.length > 0)
}

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

  agentLog("住宿增强", "开始进行住宿增强", {
    routeDays: skeleton?.length ?? 0,
  })

  if (!skeleton) {
    agentLog("住宿增强", "缺少 routeSkeleton，跳过住宿增强")
    return {}
  }

  const hotelMap = new Map<number, IAccommodation[]>()
  const issues: IssueItem[] = []

  for (const dayPlan of skeleton) {
    const dayIndex = Math.max(dayPlan.day - 1, 0)
    const seeds = dayPlan.accommodation || []
    const hotels: IAccommodation[] = []

    for (const seed of seeds) {
      const cityHint = normalizeText(seed.city)
        || extractCityFromAddress(seed.address)
      const seedHotelName = normalizeText(seed.name) || "住宿推荐无"

      if (!seedHotelName) {
        issues.push(
          createIssue(
            ERROR_CODE.HOTEL_ENRICH,
            `缺少 name - day${dayPlan.day} ${seedHotelName || "unknown"}`,
          ),
        )
        hotels.push(buildDefaultAccommodation(seed))
        continue
      }

      // cityHint 缺失时不再回退到 intent.destination，直接返回默认数据。
      if (!cityHint) {
        issues.push(
          createIssue(
            ERROR_CODE.HOTEL_ENRICH,
            `cityHint 缺失，使用默认数据 - day${dayPlan.day} ${seedHotelName}`,
          ),
        )
      }

      const candidates = await searchHotels(cityHint, seedHotelName, 3)
      if (candidates.length === 0 || !candidates[0]) {
        issues.push(
          createIssue(
            ERROR_CODE.HOTEL_ENRICH,
            `酒店检索无结果，使用默认数据 - day${dayPlan.day} ${seedHotelName}`,
          ),
        )
        hotels.push(buildDefaultAccommodation(seed))
        continue
      }

      const { rating, name, address, type, avgCostCny, images } = candidates[0]
      const hotelEnricher: IAccommodation = {
        name: normalizeText(name) || seedHotelName,
        address: normalizeText(address) || normalizeText(seed.address) || "地址待补充",
        feature: rating
          ? `${type ?? "酒店"}｜评分${rating}`
          : normalizeText(type) || normalizeText(seed.feature) || "酒店",
        images: normalizeAccommodationImages(images),
        price: avgCostCny ?? undefined,
      }

      console.log("[amap hotel]: ", hotelEnricher)
      hotels.push(hotelEnricher)
    }

    hotelMap.set(dayIndex, hotels)
    agentLog("住宿增强", `第${dayPlan.day}天完成`, `候选数=${hotels.length}`)
  }

  agentLog("住宿增强", "住宿增强完成", {
    dayCount: hotelMap.size,
    issueCount: issues.length,
  })

  return {
    enrichedAccommodation: hotelMap,
    ...(issues.length > 0 ? { issues } : {}),
  }
}
