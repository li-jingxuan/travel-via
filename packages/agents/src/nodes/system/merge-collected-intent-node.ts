import { agentLog } from "../../lib/logger.js"
import type { TravelStateAnnotation } from "../../graph/state.js"
import {
  getMissingRequiredIntentFields,
  inferExplicitIntentFields,
  mergeTravelIntent,
} from "../../intent/intent-collection.js"

/**
 * 合并多轮对话中收集到的旅行需求。
 */
export async function mergeCollectedIntentNode(
  state: typeof TravelStateAnnotation.State,
) {
  // intent 是本轮抽取结果，collectedIntent 是跨轮累计结果。
  // 这里把“用户刚补的一句话”并入历史需求，再决定是否可以进入规划。
  const explicitFields = state.intent
    ? inferExplicitIntentFields(state.userInput, state.intent)
    : []
  const collectedIntent = state.intent
    ? mergeTravelIntent(state.collectedIntent, state.intent, { explicitFields })
    : state.collectedIntent

  // 必要字段检查（目前只有 destination 目的地）
  const missingFields = getMissingRequiredIntentFields(collectedIntent)
  const needUserInput = missingFields.length > 0

  agentLog("需求收集", "旅行需求合并完成", {
    currentIntent: state.intent,
    explicitFields,
    collectedIntent,
    missingFields,
  })

  return {
    collectedIntent,
    // route_planner 仍读取 intent 字段，因此这里把合并后的完整需求同步回 intent。
    intent: collectedIntent,
    missingFields,
    needUserInput,
    // 用户补齐信息后要清掉上一轮追问，避免 API/Web 继续展示过期 prompt。
    clarification: null,
    // 新一轮需求可能改动目的地/天数，清掉旧 finalPlan，避免旧路线被误认为当前结果。
    finalPlan: null,
  }
}
