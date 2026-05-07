import {
  DECLINE_SUPPLEMENT_KEYWORDS,
  DECLINE_SUPPLEMENT_REGEX_LIST,
  SOFT_RECOMMENDED_FIELDS,
} from "../constants/intent-clarification.js"
import type {
  IntentField,
  TravelIntent,
  TravelIntentPatch,
} from "../types/internal.js"

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0
}

/**
 * 计算“软缺失字段”。
 *
 * 与硬缺失不同：这些字段不是必填，但缺失时会影响规划质量。
 * 业务规则要求：当 destination 已有且软缺失存在时，持续补问，直到用户明确拒绝。
 */
export function getMissingRecommendedIntentFields(
  intent: TravelIntentPatch | TravelIntent | null | undefined,
): IntentField[] {
  if (!intent) return [...SOFT_RECOMMENDED_FIELDS]

  return SOFT_RECOMMENDED_FIELDS.filter((field) => {
    if (field === "days") return !intent.days
    if (field === "travelType") return !intent.travelType
    if (field === "month") return !hasText(intent.month)
    if (field === "departurePoint") return !hasText(intent.departurePoint)
    return false
  })
}

/**
 * 判定用户是否明确表示“不再补充可选信息”。
 *
 * 判定原则：
 * - 优先命中强语义关键词
 * - 再用少量口语正则做兜底
 */
export function hasUserDeclinedSupplement(userInput: string): boolean {
  const normalizedInput = userInput.trim()

  if (!normalizedInput) return false

  if (
    DECLINE_SUPPLEMENT_KEYWORDS.some((keyword) =>
      normalizedInput.includes(keyword),
    )
  ) {
    return true
  }

  return DECLINE_SUPPLEMENT_REGEX_LIST.some((regex) =>
    regex.test(normalizedInput),
  )
}

/**
 * 当前轮是否明确提供了“软推荐字段”。
 *
 * 用途：
 * - 用户此前拒绝补充后，如果后续又主动提供了软字段，说明其态度有变化
 * - 此时可清除拒绝标记，恢复正常补问逻辑
 */
export function hasProvidedRecommendedFields(
  explicitFields: readonly IntentField[],
): boolean {
  return explicitFields.some((field) => SOFT_RECOMMENDED_FIELDS.includes(field))
}
