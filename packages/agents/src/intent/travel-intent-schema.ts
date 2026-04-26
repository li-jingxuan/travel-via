import { z } from "zod"
import {
  DEFAULT_TRAVEL_TYPE,
  TRAVEL_TYPE_VALUES,
  type TravelType,
} from "../types/index.js"
import type { TravelIntent } from "../types/internal.js"

// LLM 输出是 unknown 边界数据；字符串字段统一 trim，非字符串按“未提供”处理。
const cleanStringSchema = z.unknown().transform((value) =>
  typeof value === "string" ? value.trim() : "",
)

// 这里保留当前 IntentAgent 的默认天数策略：解析不到有效天数时回退 5 天。
// 后续如果拆 TravelIntentPatch，默认值应只在进入正式规划前补齐。
const daysSchema = z.unknown().transform((value) => {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.round(value)
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }

  return 5
})

// travelType 只接受项目枚举值；模型输出其它说法时统一回退到默认出行方式。
const travelTypeSchema = z.unknown().transform((value): TravelType => {
  if (
    typeof value === "string" &&
    TRAVEL_TYPE_VALUES.includes(value as TravelType)
  ) {
    return value as TravelType
  }

  return DEFAULT_TRAVEL_TYPE
})

// preferences 是列表型可选字段，清洗后为空就不写入，避免污染多轮合并。
const preferencesSchema = z.unknown().transform((value) => {
  if (!Array.isArray(value)) return undefined

  const preferences = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)

  return preferences.length > 0 ? preferences : undefined
})

const travelIntentSchema = z
  .object({
    destination: cleanStringSchema.optional(),
    departurePoint: cleanStringSchema.optional(),
    days: daysSchema.optional(),
    month: cleanStringSchema.optional(),
    travelType: travelTypeSchema.optional(),
    budget: cleanStringSchema.optional(),
    travelers: cleanStringSchema.optional(),
    preferences: preferencesSchema.optional(),
  })
  .transform((value): TravelIntent => {
    const destination = value.destination ?? ""
    // 出发地允许用户不填；下游按“目的地本地游/目的地集合点”处理。
    const departurePoint = value.departurePoint || destination

    return {
      destination,
      departurePoint,
      days: value.days ?? 5,
      month: value.month || "未指定",
      travelType: value.travelType ?? DEFAULT_TRAVEL_TYPE,
      ...(value.budget ? { budget: value.budget } : {}),
      ...(value.travelers ? { travelers: value.travelers } : {}),
      ...(value.preferences ? { preferences: value.preferences } : {}),
    }
  })

/**
 * 将 LLM 输出标准化为 TravelIntent，保证字段类型稳定。
 *
 * 注意：destination 允许为空字符串。缺少目的地不是解析错误，
 * 而是后续澄清流程需要处理的合法中间状态。
 */
export function normalizeIntent(raw: unknown): TravelIntent {
  const source = typeof raw === "object" && raw !== null ? raw : {}
  return travelIntentSchema.parse(source)
}
