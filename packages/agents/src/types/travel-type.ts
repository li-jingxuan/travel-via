/**
 * TravelType 常量源。
 *
 * 说明：
 * - 统一收敛 travelType 的枚举值，避免在 prompt、node、类型定义中散落魔法字符串
 * - LLM 负责把用户自然语言语义归一到这些枚举值
 * - 程序只负责校验输出是否合法，并在异常时做稳定兜底
 */
export const TRAVEL_TYPES = {
  SELF_DRIVING: "自驾",
  FREE_TRAVEL: "自由行",
  CYCLING: "骑行",
} as const

export type TravelType = (typeof TRAVEL_TYPES)[keyof typeof TRAVEL_TYPES]

export const TRAVEL_TYPE_VALUES: readonly TravelType[] = Object.values(TRAVEL_TYPES)

export const DEFAULT_TRAVEL_TYPE: TravelType = TRAVEL_TYPES.FREE_TRAVEL
