import { finalizeTravelIntent } from "../../intent/index.js"
import { agentLog } from "../../lib/logger.js"
import type { TravelStateAnnotation } from "../../graph/state.js"

/**
 * 进入 route_planner 前的 intent 准备节点。
 *
 * 职责：
 * - 仅在“确定不再追问”后，把 collectedIntent 补齐为完整 intent
 * - 作为默认值注入的唯一入口，避免默认值污染需求收集与补问判定
 */
export async function preparePlannerIntentNode(
  state: typeof TravelStateAnnotation.State,
) {
  // collectedIntent 是“用户真实表达”的 patch；这里统一补齐默认值供规划消费。
  const finalizedIntent = finalizeTravelIntent(state.collectedIntent)

  agentLog("需求收集", "准备规划阶段 intent 完成", {
    collectedIntent: state.collectedIntent,
    finalizedIntent,
  })

  return {
    intent: finalizedIntent,
  }
}

