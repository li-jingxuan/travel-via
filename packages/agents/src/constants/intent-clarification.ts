import type { IntentField } from "../types/internal.js"

/**
 * 软缺失推荐字段：
 * - 不属于硬性必填
 * - 但在规划质量上影响较大，适合持续追问直到用户明确拒绝补充
 */
export const SOFT_RECOMMENDED_FIELDS: readonly IntentField[] = [
  "days",
  "month",
  "departurePoint",
  "travelType",
] as const

/**
 * 用户“明确拒绝补充信息”关键词。
 *
 * 说明：
 * 这里只放高置信、强语义词，避免把普通寒暄误判为拒绝。
 */
export const DECLINE_SUPPLEMENT_KEYWORDS: readonly string[] = [
  "不补充",
  "不用补充",
  "不提供",
  "不想补充",
  "就这些",
  "先这样",
  "直接生成",
  "按现有信息生成",
] as const

/**
 * 正则补充规则：
 * - 覆盖“不要再问了/别问了/不用问了”等口语表达
 * - 与关键词一起使用，提升拒绝识别召回率
 */
export const DECLINE_SUPPLEMENT_REGEX_LIST: readonly RegExp[] = [
  /(不要|别)\s*再?问了?/i,
  /不用\s*问了?/i,
  /先按(这个|这样|目前)/i,
] as const

/**
 * 给软补问提示用的统一“跳过指令文案”。
 * 统一常量可避免在多个节点重复硬编码。
 */
export const SKIP_SUPPLEMENT_EXAMPLE = "不补充，直接生成"
