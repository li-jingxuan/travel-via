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
import type { TravelStateAnnotation } from "../graph/state.js";
import type { TravelIntent } from "../types/internal.js";
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
export declare function intentAgentNode(state: typeof TravelStateAnnotation.State): Promise<{
    intent: TravelIntent;
    messages: import("@langchain/core/messages").AIMessageChunk<import("@langchain/core/messages").MessageStructure<import("@langchain/core/messages").MessageToolSet>>[];
}>;
//# sourceMappingURL=intent-agent.d.ts.map