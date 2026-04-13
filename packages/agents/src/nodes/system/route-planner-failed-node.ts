/**
 * route_planner 连续失败后的兜底节点。
 *
 * 当骨架解析达到重试上限时，直接给用户明确提示，
 * 避免继续无效重试。
 */
import { agentLog } from "../../lib/logger.js"
import { ERROR_CODE, formatError } from "../../constants/error-code.js"

export async function routePlannerFailedNode() {
  agentLog("路线规划", "路线骨架生成失败", {
    reason: "达到最大重试次数，进入兜底分支",
  })
  return {
    errors: [
      formatError(
        ERROR_CODE.NEED_USER_INPUT,
        "路线骨架生成连续失败，请补充更明确的信息（如目的地城市、总天数、出发方式）后重试。",
      ),
    ],
  }
}
