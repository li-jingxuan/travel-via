import { z } from "zod"
import {
  DEFAULT_TRAVEL_TYPE,
  TRAVEL_TYPE_VALUES,
  type TravelType,
} from "../constants/travel-type.js"
import type {
  IntentField,
  TravelIntent,
  TravelIntentExtraction,
  TravelIntentPatch,
} from "../types/internal.js"

const INTENT_FIELD_VALUES = [
  "destination",
  "departurePoint",
  "days",
  "month",
  "travelType",
  "budget",
  "travelers",
  "preferences",
] as const satisfies readonly IntentField[]

// LLM 输出是 unknown 边界数据；字符串字段统一 trim，非字符串按“未提供”处理。
const cleanStringSchema = z.unknown().transform((value) =>
  typeof value === "string" ? value.trim() : "",
)

// patch 阶段只保留用户明确说出的有效天数，不再在这里补 5 天默认值。
const optionalDaysSchema = z.unknown().transform((value) => {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.round(value)
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }

  return undefined
})

// 非枚举出行方式直接丢弃，避免无效值参与多轮覆盖。
const optionalTravelTypeSchema = z.unknown().transform((value): TravelType | undefined => {
  if (
    typeof value === "string" &&
    TRAVEL_TYPE_VALUES.includes(value as TravelType)
  ) {
    return value as TravelType
  }

  return undefined
})

// preferences 是列表型字段，清洗后为空就不写入 patch。
const preferencesSchema = z.unknown().transform((value) => {
  if (!Array.isArray(value)) return undefined

  const preferences = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)

  return preferences.length > 0 ? preferences : undefined
})

const explicitFieldsSchema = z.unknown().transform((value): IntentField[] => {
  if (!Array.isArray(value)) return []

  const fields = value.filter((item): item is IntentField =>
    INTENT_FIELD_VALUES.includes(item as IntentField),
  )

  return Array.from(new Set(fields))
})

const travelIntentPatchSchema = z
  .object({
    destination: cleanStringSchema.optional(),
    departurePoint: cleanStringSchema.optional(),
    days: optionalDaysSchema.optional(),
    month: cleanStringSchema.optional(),
    travelType: optionalTravelTypeSchema.optional(),
    budget: cleanStringSchema.optional(),
    travelers: cleanStringSchema.optional(),
    preferences: preferencesSchema.optional(),
  })
  .transform((value): TravelIntentPatch => {
    const patch: TravelIntentPatch = {}

    // 这里只写入“确实有值”的字段，确保 patch 不携带任何默认值。
    if (value.destination) patch.destination = value.destination
    if (value.departurePoint) patch.departurePoint = value.departurePoint
    if (value.days) patch.days = value.days
    if (value.month) patch.month = value.month
    if (value.travelType) patch.travelType = value.travelType
    if (value.budget) patch.budget = value.budget
    if (value.travelers) patch.travelers = value.travelers
    if (value.preferences) patch.preferences = value.preferences

    return patch
  })

const intentExtractionSchema = z
  .object({
    intentPatch: travelIntentPatchSchema.optional(),
    explicitFields: explicitFieldsSchema.optional(),
  })
  .transform((value): TravelIntentExtraction => {
    const intentPatch = value.intentPatch ?? {}
    const patchFields = new Set(Object.keys(intentPatch) as IntentField[])

    // explicitFields 只保留 patch 中存在且已通过校验的字段，防止空值/非法值覆盖历史。
    const explicitFields = (value.explicitFields ?? []).filter((field) =>
      patchFields.has(field),
    )

    return {
      intentPatch,
      explicitFields,
    }
  })

/**
 * 标准化 IntentAgent 的本轮输出。
 *
 * 这里不会补齐 days/month/travelType 默认值。
 * 默认值只在进入正式规划前通过 finalizeTravelIntent 统一补齐。
 */
export function normalizeIntentExtraction(raw: unknown): TravelIntentExtraction {
  const source = typeof raw === "object" && raw !== null ? raw : {}
  
  return intentExtractionSchema.parse(source)
}

/**
 * 将已累计的意图 patch 补齐为 route_planner 可直接消费的完整 TravelIntent。
 *
 * 这里是默认值的唯一入口：
 * - days 缺失时默认 5 天
 * - month 缺失时默认“未指定”
 * - travelType 缺失时默认自由行
 * - departurePoint 缺失时跟随 destination
 */
export function finalizeTravelIntent(raw: TravelIntentPatch | null | undefined): TravelIntent {
  const patch = travelIntentPatchSchema.parse(raw ?? {})
  const destination = patch.destination ?? ""
  const departurePoint = patch.departurePoint || destination

  return {
    destination,
    departurePoint,
    days: patch.days ?? 5,
    month: patch.month || "未指定",
    travelType: patch.travelType ?? DEFAULT_TRAVEL_TYPE,
    ...(patch.budget ? { budget: patch.budget } : {}),
    ...(patch.travelers ? { travelers: patch.travelers } : {}),
    ...(patch.preferences ? { preferences: patch.preferences } : {}),
  }
}
