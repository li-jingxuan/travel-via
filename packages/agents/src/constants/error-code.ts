/**
 * 统一问题码定义（避免魔法字符串散落）。
 */
export const ERROR_CODE = {
  NEED_USER_INPUT: "NEED_USER_INPUT",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  POI_ENRICH: "POI_ENRICH",
  HOTEL_ENRICH: "HOTEL_ENRICH",
  WEATHER_ENRICH: "WEATHER_ENRICH",
} as const

export type ErrorCode = (typeof ERROR_CODE)[keyof typeof ERROR_CODE]

/**
 * 统一问题项结构：
 * - code: 稳定错误码（机器可读）
 * - message: 可读信息（人类可读）
 * - context: 可选上下文
 */
export interface IssueItem {
  code: ErrorCode
  message: string
  context?: string
}

/** 构造 issue 对象，减少散落对象字面量 */
export function createIssue(
  code: ErrorCode,
  message: string,
  context?: string,
): IssueItem {
  return { code, message, ...(context ? { context } : {}) }
}

/** 可触发流程重试的问题码集合（由最终路由判定使用） */
export const RETRYABLE_ISSUE_CODES: readonly ErrorCode[] = [
  ERROR_CODE.VALIDATION_ERROR,
]
