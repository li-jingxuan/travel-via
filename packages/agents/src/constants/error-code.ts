/**
 * 统一错误码定义（避免魔法字符串散落）。
 *
 * 约定格式：
 *   <ERROR_CODE>: <人类可读消息>
 */
export const ERROR_CODE = {
  NEED_USER_INPUT: "NEED_USER_INPUT",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  POI_ENRICH: "POI_ENRICH",
  HOTEL_ENRICH: "HOTEL_ENRICH",
  WEATHER_ENRICH: "WEATHER_ENRICH",
} as const

export type ErrorCode = (typeof ERROR_CODE)[keyof typeof ERROR_CODE]

/** 将错误码和消息组合成统一文本格式 */
export function formatError(code: ErrorCode, message: string): string {
  return `${code}: ${message}`
}

/** 判断文本是否带指定错误码前缀 */
export function hasErrorCode(text: string, code: ErrorCode): boolean {
  return text.startsWith(`${code}:`)
}

