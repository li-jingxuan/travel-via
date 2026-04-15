import { RETRYABLE_ISSUE_CODES } from "../../constants/error-code.js"
import type { TravelStateAnnotation } from "../../graph/state.js"
import { agentLog } from "../../lib/logger.js"

/**
 * formatter 前置守卫：
 * - 只检查“新增 issues”
 * - 命中 RETRYABLE_ISSUE_CODES 时回退 route_planner
 */
export async function preFormatterGuardNode(
  state: typeof TravelStateAnnotation.State,
) {
  const issues = state.issues ?? []
  const cursor = Math.max(state.preFormatterIssueCursor ?? 0, 0)
  const newIssues = issues.slice(cursor)
  const hasRetryableIssue = newIssues.some((issue) =>
    RETRYABLE_ISSUE_CODES.includes(issue.code),
  )

  agentLog("前置守卫", "完成 issues 检查", {
    totalIssues: issues.length,
    newIssueCount: newIssues.length,
    hasRetryableIssue,
  })

  return {
    preFormatterIssueCursor: issues.length,
    preFormatterShouldRetry: hasRetryableIssue,
  }
}
