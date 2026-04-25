import { agentLog } from "../../lib/logger.js"
import type { TravelStateAnnotation } from "../../graph/state.js"
import {
  getMissingRequiredIntentFields,
  mergeTravelIntent,
} from "../../intent/intent-collection.js"

/**
 * 合并多轮对话中收集到的旅行需求。
 */
export async function mergeCollectedIntentNode(
  state: typeof TravelStateAnnotation.State,
) {
  const collectedIntent = state.intent
    ? mergeTravelIntent(state.collectedIntent, state.intent)
    : state.collectedIntent

  const missingFields = getMissingRequiredIntentFields(collectedIntent)
  const needUserInput = missingFields.length > 0

  agentLog("需求收集", "旅行需求合并完成", {
    currentIntent: state.intent,
    collectedIntent,
    missingFields,
  })

  return {
    collectedIntent,
    intent: collectedIntent,
    missingFields,
    needUserInput,
    clarification: null,
    finalPlan: null,
  }
}

