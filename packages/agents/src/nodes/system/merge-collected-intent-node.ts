import { agentLog } from "../../lib/logger.js"
import type { TravelStateAnnotation } from "../../graph/state.js"
import {
  finalizeTravelIntent,
  getMissingRequiredIntentFields,
  mergeTravelIntentPatch,
} from "../../intent/index.js"

/**
 * 合并多轮对话中收集到的旅行需求。
 */
export async function mergeCollectedIntentNode(
  state: typeof TravelStateAnnotation.State,
) {
  /**
   * intentExtraction 是本轮增量
   * 只有 explicitFields 中的字段允许覆盖历史值，彻底避免默认值误覆盖。
   * collectedIntent 是跨轮累计 patch。
  */
  const collectedIntent = state.intentExtraction
    ? mergeTravelIntentPatch(
      state.collectedIntent,
      state.intentExtraction.intentPatch,
      state.intentExtraction.explicitFields,
    )
    : state.collectedIntent

  // route_planner 读取完整 intent；默认值只在这里统一补齐。
  const finalizedIntent = finalizeTravelIntent(collectedIntent)

  // 必要字段检查（目前只有 destination 目的地）。
  const missingFields = getMissingRequiredIntentFields(collectedIntent)
  const needUserInput = missingFields.length > 0

  agentLog("需求收集", "旅行需求合并完成", {
    intentExtraction: state.intentExtraction,
    collectedIntent,
    finalizedIntent,
    missingFields,
  })

  return {
    collectedIntent,
    // route_planner 仍读取 intent 字段，因此这里写入补齐后的完整需求。
    intent: finalizedIntent,
    missingFields,
    needUserInput,
    // 用户补齐信息后要清掉上一轮追问，避免 API/Web 继续展示过期 prompt。
    clarification: null,
    // 新一轮需求可能改动目的地/天数，清掉旧 finalPlan，避免旧路线被误认为当前结果。
    finalPlan: null,
  }
}
