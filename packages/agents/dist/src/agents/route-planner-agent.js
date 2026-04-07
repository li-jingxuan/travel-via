/**
 * RoutePlanner Agent — 行程骨架生成节点
 *
 * ============================================================================
 * 职责
 * ============================================================================
 * 基于 IntentAgent 输出的结构化意图（TravelIntent），生成完整的 N 天行程骨架。
 *
 * 这里的"骨架"指的是：每天的行程框架已经确定（去哪些景点、住哪里、吃什么），
 * 但缺少需要外部 API 查询的详细数据（门票价格、开放时间、经纬度等）。
 *
 * 为什么分两步（骨架 + 详情填充）而不是一步到位？
 * 1. 骨架生成是创造性工作（设计路线），适合 deepseek-reasoner 的强推理能力
 * 2. 详情填充是机械性工作（调 API 查数据），适合 deepseek-v3 + Tool Calling
 * 3. 分离后可以并行执行详情填充（Phase 2 的 Fan-out），大幅降低延迟
 *
 * ============================================================================
 * 在 Graph 中的位置
 * ============================================================================
 *
 *   intent_agent → route_planner → formatter (MVP) / fan-out agents (Phase 2)
 *                     ↑              │
 *               intent (读)    routeSkeleton (写)
 *
 * - 输入：从 State 中读取 intent（TravelIntent）
 * - 输出：向 State 写入 routeSkeleton + messages
 * - 模型：deepseek-reasoner（推理增强模型，需要多步逻辑规划路线）
 * - Tools：无（纯 LLM 推理，利用自身知识库设计路线）
 */
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { createDeepSeekReasoner } from "../lib/llm.js";
import { ROUTE_PLANNER_SYSTEM_PROMPT } from "../prompts/route-planner.js";
/** 行程规划专用 LLM 实例 — 较高温度允许一定创造性来设计有趣路线 */
const llm = createDeepSeekReasoner({ temperature: 0.7 });
/**
 * RoutePlanner 节点函数
 *
 * @param state - 当前 Graph 状态（必须包含 intent，否则抛出错误）
 * @returns 需要更新的 State 字段（routeSkeleton 和 messages）
 */
export async function routePlannerNode(state) {
    // 防御性检查：intent 应该由上游的 intent_agent 节点写入
    const intent = state.intent;
    if (!intent) {
        throw new Error("routePlannerNode: intent is null, cannot plan route");
    }
    // 将意图对象格式化为易读的 JSON 字符串传给 LLM
    // 使用 2 空格缩进让 LLM 更容易阅读和理解结构
    const userContext = JSON.stringify(intent, null, 2);
    // 动态替换 Prompt 模板中的占位符
    // 这里将 {totalDays} 替换为实际天数，让 Prompt 更具体
    const prompt = ROUTE_PLANNER_SYSTEM_PROMPT.replace("{totalDays}", String(intent.days));
    // 调用 LLM 生成行程骨架
    // SystemMessage 包含完整的规划规则和输出格式约束
    // HumanMessage 提供具体的用户需求上下文
    const response = await llm.invoke([
        new SystemMessage(prompt),
        new HumanMessage(`请为以下用户需求生成${intent.days}天行程：\n\n${userContext}`),
    ]);
    // 解析 LLM 返回的 JSON 数组
    const content = response.content;
    let routeSkeleton;
    try {
        // 清理 markdown 包裹后解析 JSON
        const jsonStr = content.replace(/```\w*\n?|\n?```/g, "").trim();
        routeSkeleton = JSON.parse(jsonStr);
        // 类型安全检查：确保解析结果是数组
        if (!Array.isArray(routeSkeleton)) {
            throw new Error("routeSkeleton is not an array");
        }
    }
    catch (parseError) {
        // 解析失败时记录错误日志并返回空数组
        // 后续 Formatter 会收到空的 skeleton，可能产生不完整的结果
        // 但不会导致整个 Graph 崩溃——这是降级策略
        console.error("RoutePlanner JSON parse failed:", parseError);
        console.error("Raw LLM output:", content);
        routeSkeleton = [];
    }
    return {
        routeSkeleton, // 写入行程骨架 → State.routeSkeleton
        messages: [response], // 追加到消息历史 → State.messages
    };
}
