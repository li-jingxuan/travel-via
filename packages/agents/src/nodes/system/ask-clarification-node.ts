import { agentLog } from "../../lib/logger.js"
import { ERROR_CODE, formatError } from "../../constants/error-code.js"
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

  agentLog("补充信息", "开始生成补充信息提示", {
    userInput: state.userInput,
    missing,
  })
  const readable = missing
    .map((field) =>
      field === "destination"
        ? "目的地（destination）"
        : "出发地（departurePoint）",
    )
    .join("、")

  agentLog("补充信息", "补充信息提示生成成功", {
    missing,
  })
  return {
    errors: [
      formatError(
        ERROR_CODE.NEED_USER_INPUT,
        `缺少必要信息：${readable}。请补充后重新提交。`,
      ),
    ],
  }
}
