/**
 * IntentAgent — 意图理解节点
 *
 * ============================================================================
 * 职责
 * ============================================================================
 * 将用户的自然语言输入（如 "我想去新疆自驾游，大概15天，6月份去"）
 * 解析为结构化的 TravelIntent 对象（destination、days、month、travelType 等）。
 *
 * 这是整个管线的"入口翻译层"——后续所有 Agent 都依赖它输出的结构化数据。
 * 如果这里解析错了，后面的规划全都会偏。所以这个节点要求：
 * - 高准确性（temperature=0.3，低随机性）
 * - 容错处理（用户信息不全时给出合理默认值）
 * - 严格 JSON 输出（方便下游程序化消费）
 *
 * ============================================================================
 * 在 Graph 中的位置
 * ============================================================================
 *
 *   START → intent_agent → route_planner
 *            ↑            │
 *      userInput (读)    intent (写)
 *
 * - 输入：从 State 中读取 userInput
 * - 输出：向 State 写入 intentExtraction
 * - 模型：deepseek-v3（通用任务模型，不需要强推理能力）
 * - Tools：无（纯 LLM 推理，不需要调用外部 API）
 */

import { SystemMessage, HumanMessage } from "@langchain/core/messages"
import { createDeepSeekV3 } from "../lib/llm.js"
import { agentLog } from "../lib/logger.js"
import type { TravelStateAnnotation } from "../graph/state.js"
import type { TravelIntentExtraction } from "../types/internal.js"
import { INTENT_SYSTEM_PROMPT } from "../prompts/index.js"
import { normalizeIntentExtraction } from "../intent/travel-intent-schema.js"

/** 意图理解专用 LLM 实例 — 低温度保证输出稳定可预测 */
const llm = createDeepSeekV3({ temperature: 0.3 })
// 强制 LLM 输出纯 JSON，减少解析错误风险
llm.withConfig({ response_format: { type: "json_object" } })

/**
 * IntentAgent 节点函数
 *
 * LangGraph 调用约定：
 *   - 参数 state: 当前完整的 State 对象（所有字段都可访问）
 *   - 返回值: Partial<State> —— 只返回需要更新的字段，其余保持不变
 *
 * @param state - 当前 Graph 状态（至少包含 userInput）
 * @returns 需要更新的 State 字段（intentExtraction）
 */
export async function intentAgentNode(
  state: typeof TravelStateAnnotation.State,
) {
  agentLog("意图识别", "开始识别用户意图", {
    userInput: state.userInput,
  })

  // 构造 LLM 调用的消息序列：
  // 1. SystemMessage: 定义角色和输出格式规则
  // 2. HumanMessage: 用户的原始输入文本
  const response = await llm.invoke([
    new SystemMessage(INTENT_SYSTEM_PROMPT),
    new HumanMessage(state.userInput),
  ])

  // 从 LLM 返回的 content 中提取结构化 JSON
  const content = response.content as string
  let intentExtraction: TravelIntentExtraction

  try {
    // 清理可能的 markdown 代码块包裹（LLM 有时会在 JSON 外面包 ```json ... ```）
    const jsonStr = content.replace(/```json\n?|\n?```/g, "").trim()
    intentExtraction = normalizeIntentExtraction(JSON.parse(jsonStr))
  } catch {
    agentLog("意图识别", "识别失败，已降级为空意图", {
      reason: "模型输出 JSON 解析失败",
    })
    console.error("IntentAgent JSON parsing error. Raw output:", content)
    // JSON 解析失败时使用空增量，避免整个管线崩溃。
    // 这种情况通常是因为 LLM 输出了额外文字而非纯 JSON。
    // 缺失的必填字段会由 merge_collected_intent 节点继续触发追问。
    intentExtraction = normalizeIntentExtraction({})
  }

  agentLog("意图识别", "识别成功", {
    intentPatch: intentExtraction.intentPatch,
    explicitFields: intentExtraction.explicitFields,
  })

  // 返回部分更新 —— LangGraph 会用各字段的 reducer 合并到当前 State
  return {
    intentExtraction, // 写入本轮意图增量 → State.intentExtraction
  }
}
