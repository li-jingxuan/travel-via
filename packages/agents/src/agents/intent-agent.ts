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
 * - 输出：向 State 写入 intent + messages
 * - 模型：deepseek-v3（通用任务模型，不需要强推理能力）
 * - Tools：无（纯 LLM 推理，不需要调用外部 API）
 */

import { SystemMessage, HumanMessage } from "@langchain/core/messages"
import { createDeepSeekV3 } from "../lib/llm.js"
import type { TravelStateAnnotation } from "../graph/state.js"
import type { TravelIntent } from "../types/internal.js"
import { INTENT_SYSTEM_PROMPT } from "../prompts/intent.js"

/** 意图理解专用 LLM 实例 — 低温度保证输出稳定可预测 */
const llm = createDeepSeekV3({ temperature: 0.3 })

/**
 * 将 LLM 输出标准化为 TravelIntent，保证字段类型稳定：
 * - 必填字符串字段缺失时返回空字符串（交由 graph 分流到补充信息节点）
 * - days 非法时回退为 5
 * - 可选字段仅在类型匹配时保留
 */
function normalizeIntent(raw: unknown): TravelIntent {
  const obj = (typeof raw === "object" && raw !== null
    ? raw
    : {}) as Record<string, unknown>

  const toCleanString = (value: unknown): string =>
    typeof value === "string" ? value.trim() : ""

  const toDays = (value: unknown): number => {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return Math.round(value)
    }
    if (typeof value === "string") {
      const parsed = Number.parseInt(value, 10)
      if (Number.isFinite(parsed) && parsed > 0) return parsed
    }
    return 5
  }

  const normalized: TravelIntent = {
    destination: toCleanString(obj.destination),
    departurePoint: toCleanString(obj.departurePoint),
    days: toDays(obj.days),
    month: toCleanString(obj.month) || "未指定",
    travelType: toCleanString(obj.travelType) || "自由行",
  }

  if (typeof obj.budget === "string" && obj.budget.trim()) {
    normalized.budget = obj.budget.trim()
  }
  if (typeof obj.travelers === "string" && obj.travelers.trim()) {
    normalized.travelers = obj.travelers.trim()
  }
  if (Array.isArray(obj.preferences)) {
    const prefs = obj.preferences
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)

    if (prefs.length > 0) {
      normalized.preferences = prefs
    }
  }

  return normalized
}

/**
 * IntentAgent 节点函数
 *
 * LangGraph 调用约定：
 *   - 参数 state: 当前完整的 State 对象（所有字段都可访问）
 *   - 返回值: Partial<State> —— 只返回需要更新的字段，其余保持不变
 *
 * @param state - 当前 Graph 状态（至少包含 userInput）
 * @returns 需要更新的 State 字段（intent 和 messages）
 */
export async function intentAgentNode(
  state: typeof TravelStateAnnotation.State,
) {
  // 构造 LLM 调用的消息序列：
  // 1. SystemMessage: 定义角色和输出格式规则
  // 2. HumanMessage: 用户的原始输入文本
  const response = await llm.invoke([
    new SystemMessage(INTENT_SYSTEM_PROMPT),
    new HumanMessage(state.userInput),
  ])

  // 从 LLM 返回的 content 中提取结构化 JSON
  const content = response.content as string
  let intent: TravelIntent

  try {
    // 清理可能的 markdown 代码块包裹（LLM 有时会在 JSON 外面包 ```json ... ```）
    const jsonStr = content.replace(/```json\n?|\n?```/g, "").trim()
    intent = normalizeIntent(JSON.parse(jsonStr))
  } catch {
    // JSON 解析失败时使用兜底默认值，避免整个管线崩溃
    // 这种情况通常是因为 LLM 输出了额外文字而非纯 JSON。
    // 注意必填字段使用空字符串，后续由 graph 分流给用户补充信息。
    intent = normalizeIntent({})
  }

  // 返回部分更新 —— LangGraph 会用各字段的 reducer 合并到当前 State
  return {
    intent,           // 写入意图结果 → State.intent
    messages: [response], // 追加 AI 回复到消息历史 → State.messages
  }
}
