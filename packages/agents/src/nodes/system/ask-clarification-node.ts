import { agentLog } from "../../lib/logger.js"
import type { TravelStateAnnotation } from "../../graph/state.js"
import { getMissingRequiredFields } from "../../graph/routing.js"

/**
 * 缺失必要信息时的追问节点。
 *
 * 行为：
 * - 生成用户可读的补充提示
 * - 写入 errors，交由 CLI/API 做结构化展示
 */
export async function askClarificationNode(
  state: typeof TravelStateAnnotation.State,
) {
  const missing = getMissingRequiredFields(state)

  agentLog("ask_clarification", state.userInput, missing)
  const readable = missing
    .map((field) =>
      field === "destination"
        ? "目的地（destination）"
        : "出发地（departurePoint）",
    )
    .join("、")

  return {
    errors: [
      `NEED_USER_INPUT: 缺少必要信息：${readable}。请补充后重新提交。`,
    ],
  }
}

