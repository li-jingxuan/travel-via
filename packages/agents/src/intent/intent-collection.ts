import {
  DEFAULT_TRAVEL_TYPE,
  TRAVEL_TYPE_VALUES,
  type TravelType,
} from "../constants/travel-type.js"
import type { TravelIntent } from "../types/internal.js"

export type IntentField =
  | "destination"
  | "departurePoint"
  | "days"
  | "month"
  | "travelType"
  | "budget"
  | "travelers"
  | "preferences"

interface MergeTravelIntentOptions {
  /**
   * 本轮用户明确说出的字段。
   *
   * IntentAgent 目前会给 days/month/travelType 注入默认值。多轮合并时，
   * 只有 explicitFields 中的字段可以覆盖历史值，避免模型默认值把用户上一轮
   * 明确说过的“5 天/自驾”等信息冲掉。
   */
  explicitFields?: readonly IntentField[]
}

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function mergeString(
  previous: string | undefined,
  current: string | undefined,
): string | undefined {
  return hasText(current) ? current.trim() : previous
}

function canUseCurrentField(
  field: IntentField,
  options: MergeTravelIntentOptions | undefined,
): boolean {
  return !options?.explicitFields || options.explicitFields.includes(field)
}

function mergeDays(
  previous: number | undefined,
  current: number,
  allowCurrent: boolean,
  hasExplicitFieldInfo: boolean,
): number {
  if (previous && !allowCurrent) return previous
  // 5 是 IntentAgent 的默认天数。若历史里已有用户明确天数，默认值不覆盖历史值。
  if (previous && current === 5 && !hasExplicitFieldInfo) return previous
  return current
}

function mergeMonth(
  previous: string | undefined,
  current: string,
  allowCurrent: boolean,
): string {
  if (previous && !allowCurrent) return previous
  // “未指定”是默认占位，不应覆盖上一轮用户已经提供的月份/季节。
  if (previous && current === "未指定") return previous
  return current
}

function mergeTravelType(
  previous: TravelType | undefined,
  current: TravelType,
  allowCurrent: boolean,
  hasExplicitFieldInfo: boolean,
): TravelType {
  if (previous && !allowCurrent) return previous
  // 自由行是默认出行方式。历史已有自驾/骑行时，不让默认值把它冲掉。
  if (previous && current === DEFAULT_TRAVEL_TYPE && !hasExplicitFieldInfo) {
    return previous
  }
  return current
}

function mergePreferences(
  previous: string[] | undefined,
  current: string[] | undefined,
): string[] | undefined {
  const merged = [...(previous ?? []), ...(current ?? [])]
    .map((item) => item.trim())
    .filter(Boolean)

  const unique = Array.from(new Set(merged))
  return unique.length > 0 ? unique : undefined
}

/**
 * 合并多轮对话中抽取出的旅行意图。
 *
 * IntentAgent 会给 days/month/travelType 注入默认值。为了避免用户第二轮只说
 * “新疆”时把第一轮的“15 天/自驾”覆盖掉，这里对默认值采取保守合并策略。
 */
export function mergeTravelIntent(
  previous: TravelIntent | null | undefined,
  current: TravelIntent,
  options?: MergeTravelIntentOptions,
): TravelIntent {
  const hasExplicitFieldInfo = Boolean(options?.explicitFields)
  const destination = canUseCurrentField("destination", options)
    ? mergeString(previous?.destination, current.destination) ?? ""
    : previous?.destination ?? ""

  // normalizeIntent 会把空 departurePoint 补成 destination。
  // 在多轮合并时要识别这种“自动补齐”的出发地，避免目的地从新疆改成云南后，
  // departurePoint 仍被旧的“新疆”锁住。
  const currentDeparturePoint =
    current.departurePoint === current.destination ? "" : current.departurePoint
  const previousDeparturePoint =
    previous?.departurePoint === previous?.destination ? "" : previous?.departurePoint
  const departurePoint =
    (
      canUseCurrentField("departurePoint", options)
        ? mergeString(previousDeparturePoint, currentDeparturePoint)
        : previousDeparturePoint
    ) || destination

  const budget = canUseCurrentField("budget", options)
    ? mergeString(previous?.budget, current.budget)
    : previous?.budget
  const travelers = canUseCurrentField("travelers", options)
    ? mergeString(previous?.travelers, current.travelers)
    : previous?.travelers
  const preferences = canUseCurrentField("preferences", options)
    ? mergePreferences(previous?.preferences, current.preferences)
    : previous?.preferences

  return {
    destination,
    departurePoint,
    days: mergeDays(
      previous?.days,
      current.days,
      canUseCurrentField("days", options),
      hasExplicitFieldInfo,
    ),
    month: mergeMonth(
      previous?.month,
      current.month,
      canUseCurrentField("month", options),
    ),
    travelType: mergeTravelType(
      previous?.travelType,
      current.travelType,
      canUseCurrentField("travelType", options),
      hasExplicitFieldInfo,
    ),
    ...(budget ? { budget } : {}),
    ...(travelers ? { travelers } : {}),
    ...(preferences ? { preferences } : {}),
  }
}

export function inferExplicitIntentFields(
  userInput: string,
  current: TravelIntent,
): IntentField[] {
  const fields = new Set<IntentField>()
  const input = userInput.trim()

  if (!input) return []

  if (current.destination && input.includes(current.destination)) {
    fields.add("destination")
  }
  if (current.departurePoint && input.includes(current.departurePoint)) {
    fields.add("departurePoint")
  }
  if (/(?:\d+|[一二两三四五六七八九十]+)\s*(?:天|日)/.test(input)) {
    fields.add("days")
  }
  if (
    /(?:\d{1,2}|[一二两三四五六七八九十]+)\s*(?:月|月份)|春季|夏季|秋季|冬季|春节|清明|五一|端午|暑假|国庆|中秋|元旦/.test(
      input,
    )
  ) {
    fields.add("month")
  }
  if (TRAVEL_TYPE_VALUES.some((value) => input.includes(value))) {
    fields.add("travelType")
  }
  if (/预算|人均|花费|费用|价格|块|元|万/.test(input)) {
    fields.add("budget")
  }
  if (/父母|孩子|情侣|朋友|同事|家人|一家|独自|一个人|老人|亲子/.test(input)) {
    fields.add("travelers")
  }
  if (/喜欢|偏好|想看|想玩|美食|摄影|徒步|露营|海边|山区|古城|避人流|博物馆/.test(input)) {
    fields.add("preferences")
  }

  return Array.from(fields)
}

export function getMissingRequiredIntentFields(
  intent: TravelIntent | null | undefined,
): IntentField[] {
  // 目前只强制目的地。天数/月份/出行方式都有可接受默认值，先不阻断规划。
  if (!intent?.destination?.trim()) return ["destination"]
  return []
}
