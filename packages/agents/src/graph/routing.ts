import { agentLog } from "../lib/index.js"
import { MAX_RETRIES, ROUTE_PLANNER_MAX_RETRIES } from "./constants.js"
import type { TravelStateAnnotation } from "./state.js"
import { getMissingRequiredIntentFields } from "../intent/intent-collection.js"

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
  return getMissingRequiredIntentFields(state.collectedIntent ?? state.intent)
}

/**
 * requirement_guard 之后的路由：
 * - 信息完整：进入 route_planner
 * - 信息缺失：进入 ask_clarification
 */
export function routeAfterRequirementGuard(
  state: typeof TravelStateAnnotation.State,
): "ask_clarification" | "route_planner" {
  const missing = state.missingFields.length > 0
    ? state.missingFields
    : getMissingRequiredFields(state)

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
 * pre_formatter_guard 之后的路由：
 * - retry    : 命中可重试问题码，回退 route_planner
 * - continue : 进入 formatter
 */
export function routeAfterPreFormatterGuard(
  state: typeof TravelStateAnnotation.State,
): "retry" | "continue" {
  if (state.preFormatterIssueCursor > 0) {
    agentLog("routeAfterPreFormatterGuard", "preFormatterGuard issues: ", state.issues)
  }

  return state.preFormatterShouldRetry ? "retry" : "continue"
}

/**
 * validator 之后的路由：
 * - retry   : 结果缺失或新增校验错误且未超限
 * - success : 可结束
 */
export function shouldRetryOrEnd(
  state: typeof TravelStateAnnotation.State,
): "retry" | "success" {
  // 达到上限后不再重试，直接结束（降级返回）。
  if (state.retryCount >= MAX_RETRIES) return "success"

  // 兜底：finalPlan 为空时（例如 formatter 失败）继续重试。
  if (!state.finalPlan) return "retry"

  agentLog("shouldRetryOrEnd", "issues: ", state.issues)

  // finalPlan 存在时，再按可重试错误码做一层保护判断。
  // const hasRetryableIssue = state.issues.some((issue) =>
  //   RETRYABLE_ISSUE_CODES.includes(issue.code),
  // )

  // if (hasRetryableIssue) {
  //   agentLog("validator", "发现可重试问题，进入重试", {
  //     retryCount: state.retryCount,
  //     issueCount: state.issues.length,
  //     retryableCode: ERROR_CODE.VALIDATION_ERROR,
  //   })
  //   return "retry"
  // }

  return "success"
}
