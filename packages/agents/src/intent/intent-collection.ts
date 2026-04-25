import {
  DEFAULT_TRAVEL_TYPE,
  type TravelType,
} from "../constants/travel-type.js"
import type { TravelIntent } from "../types/internal.js"

export type IntentField = "destination"

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function mergeString(
  previous: string | undefined,
  current: string | undefined,
): string | undefined {
  return hasText(current) ? current.trim() : previous
}

function mergeDays(previous: number | undefined, current: number): number {
  if (previous && current === 5) return previous
  return current
}

function mergeMonth(previous: string | undefined, current: string): string {
  if (previous && current === "未指定") return previous
  return current
}

function mergeTravelType(
  previous: TravelType | undefined,
  current: TravelType,
): TravelType {
  if (previous && current === DEFAULT_TRAVEL_TYPE) return previous
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
): TravelIntent {
  const destination = mergeString(previous?.destination, current.destination) ?? ""

  const currentDeparturePoint =
    current.departurePoint === current.destination ? "" : current.departurePoint
  const previousDeparturePoint =
    previous?.departurePoint === previous?.destination ? "" : previous?.departurePoint
  const departurePoint =
    mergeString(previousDeparturePoint, currentDeparturePoint) || destination

  const budget = mergeString(previous?.budget, current.budget)
  const travelers = mergeString(previous?.travelers, current.travelers)
  const preferences = mergePreferences(previous?.preferences, current.preferences)

  return {
    destination,
    departurePoint,
    days: mergeDays(previous?.days, current.days),
    month: mergeMonth(previous?.month, current.month),
    travelType: mergeTravelType(previous?.travelType, current.travelType),
    ...(budget ? { budget } : {}),
    ...(travelers ? { travelers } : {}),
    ...(preferences ? { preferences } : {}),
  }
}

export function getMissingRequiredIntentFields(
  intent: TravelIntent | null | undefined,
): IntentField[] {
  if (!intent?.destination?.trim()) return ["destination"]
  return []
}
