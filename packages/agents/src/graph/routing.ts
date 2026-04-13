import { agentLog } from "../lib/index.js"
import { ERROR_CODE, hasErrorCode } from "../constants/error-code.js"
import { MAX_RETRIES, ROUTE_PLANNER_MAX_RETRIES } from "./constants.js"
import type { TravelStateAnnotation } from "./state.js"

/**
 * 获取意图中缺失的必填字段。
 *
 * 当前在 route_planner 前强制要求：
 * - destination（必填）
 *
 * departurePoint 特殊规则：
 * - 允许为空
 * - 为空时视为与 destination 一致（不作为缺失字段）
 */
export function getMissingRequiredFields(
  state: typeof TravelStateAnnotation.State,
): string[] {
  const intent = state.intent
  if (!intent) return ["destination"]

  const missing: string[] = []
  if (!intent.destination?.trim()) {
    missing.push("destination")
  }

  return missing
}

/**
 * intent_agent 之后的路由：
 * - 信息完整：进入 route_planner
 * - 信息缺失：进入 ask_clarification
 */
export function routeAfterIntent(
  state: typeof TravelStateAnnotation.State,
): "ask_clarification" | "route_planner" {
  const missing = getMissingRequiredFields(state)
  return missing.length > 0 ? "ask_clarification" : "route_planner"
}

/**
 * route_planner 之后的路由：
 * - retry    : 骨架为空/无效，且未达重试上限
 * - continue : 骨架有效，进入 fan-out
 * - giveup   : 连续失败达到上限
 */
export function routeAfterRoutePlanner(
  state: typeof TravelStateAnnotation.State,
): "retry" | "continue" | "giveup" {
  const routeSkeleton = state.routeSkeleton
  const hasValidSkeleton = Array.isArray(routeSkeleton) && routeSkeleton.length > 0

  if (hasValidSkeleton) {
    return "continue"
  }

  if (state.routePlannerRetryCount < ROUTE_PLANNER_MAX_RETRIES) {
    return "retry"
  }

  return "giveup"
}

/**
 * validator 之后的路由：
 * - retry   : 结果缺失或新增校验错误且未超限
 * - success : 可结束
 */
export function shouldRetryOrEnd(
  state: typeof TravelStateAnnotation.State,
): "retry" | "success" {
  if (!state.finalPlan) return "retry"

  const hasValidationError = state.errors.some((err) =>
    hasErrorCode(err, ERROR_CODE.VALIDATION_ERROR),
  )

  if (hasValidationError && state.retryCount < MAX_RETRIES) {
    agentLog("validator", "发现致命校验错误，进入重试", {
      retryCount: state.retryCount,
      errorCount: state.errors.length,
    })
    return "retry"
  }

  return "success"
}
