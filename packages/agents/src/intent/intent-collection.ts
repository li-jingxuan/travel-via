import type {
  IntentField,
  TravelIntent,
  TravelIntentPatch,
} from "../types/internal.js"

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function mergeString(
  previous: string | undefined,
  current: string | undefined,
  allowCurrent: boolean,
): string | undefined {
  if (allowCurrent) {
    return hasText(current) ? current.trim() : undefined
  }

  return hasText(previous) ? previous.trim() : undefined
}

function mergePreferences(
  previous: string[] | undefined,
  current: string[] | undefined,
  allowCurrent: boolean,
): string[] | undefined {
  if (!allowCurrent) return previous

  const merged = [...(previous ?? []), ...(current ?? [])]
    .map((item) => item.trim())
    .filter(Boolean)

  const unique = Array.from(new Set(merged))
  return unique.length > 0 ? unique : undefined
}

function canUsePatchField(
  field: IntentField,
  explicitFields: readonly IntentField[],
): boolean {
  return explicitFields.includes(field)
}

/**
 * 合并多轮对话中抽取出的旅行意图增量。
 *
 * 合并原则很简单：只有 LLM 明确标记为本轮 explicitFields 的字段才允许覆盖历史。
 * 这里不再根据用户原文做二次推断，也不处理任何默认值，默认值统一延后到 finalizeTravelIntent。
 */
export function mergeTravelIntentPatch(
  previous: TravelIntentPatch | null | undefined,
  current: TravelIntentPatch,
  explicitFields: readonly IntentField[],
): TravelIntentPatch {
  const merged: TravelIntentPatch = {
    ...(previous ?? {}),
  }

  const destination = mergeString(
    previous?.destination,
    current.destination,
    canUsePatchField("destination", explicitFields),
  )
  if (destination) merged.destination = destination
  else delete merged.destination

  const departurePoint = mergeString(
    previous?.departurePoint,
    current.departurePoint,
    canUsePatchField("departurePoint", explicitFields),
  )
  if (departurePoint) merged.departurePoint = departurePoint
  else delete merged.departurePoint

  const month = mergeString(
    previous?.month,
    current.month,
    canUsePatchField("month", explicitFields),
  )
  if (month) merged.month = month
  else delete merged.month

  const budget = mergeString(
    previous?.budget,
    current.budget,
    canUsePatchField("budget", explicitFields),
  )
  if (budget) merged.budget = budget
  else delete merged.budget

  const travelers = mergeString(
    previous?.travelers,
    current.travelers,
    canUsePatchField("travelers", explicitFields),
  )
  if (travelers) merged.travelers = travelers
  else delete merged.travelers

  // 数字和枚举字段没有默认值保护逻辑；只看 explicitFields 是否允许本轮覆盖。
  if (canUsePatchField("days", explicitFields) && current.days) {
    merged.days = current.days
  }
  if (canUsePatchField("travelType", explicitFields) && current.travelType) {
    merged.travelType = current.travelType
  }

  const preferences = mergePreferences(
    previous?.preferences,
    current.preferences,
    canUsePatchField("preferences", explicitFields),
  )
  if (preferences) merged.preferences = preferences
  else delete merged.preferences

  return merged
}

export function getMissingRequiredIntentFields(
  intent: TravelIntentPatch | TravelIntent | null | undefined,
): IntentField[] {
  // 目前只强制目的地。天数/月份/出行方式会在进入规划前统一补默认值。
  if (!intent?.destination?.trim()) return ["destination"]
  return []
}
