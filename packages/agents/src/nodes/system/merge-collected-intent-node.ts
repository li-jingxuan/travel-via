import { agentLog } from "../../lib/logger.js"
import type { TravelStateAnnotation } from "../../graph/state.js"
import {
  getMissingRecommendedIntentFields,
  getMissingRequiredIntentFields,
  hasProvidedRecommendedFields,
  hasUserDeclinedSupplement,
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

  // 必要字段检查（目前只有 destination 目的地）。
  const missingFields = getMissingRequiredIntentFields(collectedIntent)
  // 软缺失字段（影响规划质量但非必填），仅在硬缺失为空时才参与追问。
  const softMissingFields = missingFields.length > 0
    ? []
    : getMissingRecommendedIntentFields(collectedIntent)

  // 每轮都检测用户是否明确拒绝补充（例如“就这些，直接生成”）。
  const userDeclinedThisTurn = hasUserDeclinedSupplement(state.userInput)
  // 如果用户主动补了软字段，认为其愿意继续补充，清除历史拒绝状态。
  const hasProvidedSoftFieldThisTurn = hasProvidedRecommendedFields(
    state.intentExtraction?.explicitFields ?? [],
  )

  const userDeclinedOptionalInfo = userDeclinedThisTurn
    ? true
    : hasProvidedSoftFieldThisTurn
    ? false
    : state.userDeclinedOptionalInfo

  // 决策规则：
  // 1. 硬缺失存在 -> 必追问
  // 2. 无硬缺失且存在软缺失且用户未拒绝 -> 继续追问
  // 3. 其余情况 -> 进入规划
  const needUserInput = missingFields.length > 0 ||
    (softMissingFields.length > 0 && !userDeclinedOptionalInfo)

  agentLog("需求收集", "旅行需求合并完成", {
    intentExtraction: state.intentExtraction,
    collectedIntent,
    missingFields,
    softMissingFields,
    userDeclinedThisTurn,
    userDeclinedOptionalInfo,
    hasProvidedSoftFieldThisTurn,
    needUserInput,
  })

  return {
    collectedIntent,
    // 注意：这里刻意不写入 finalize 后的 intent。
    // 原因：默认值会掩盖“用户未提供”的事实，导致软补问无法持续触发。
    // 真正进入规划前再由 prepare_planner_intent 统一补齐默认值。
    intent: null,
    missingFields,
    softMissingFields,
    needUserInput,
    userDeclinedOptionalInfo,
    // 用户补齐信息后要清掉上一轮追问，避免 API/Web 继续展示过期 prompt。
    clarification: null,
    // 新一轮需求可能改动目的地/天数，清掉旧 finalPlan，避免旧路线被误认为当前结果。
    finalPlan: null,
  }
}
