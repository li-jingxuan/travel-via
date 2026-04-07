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
import type { TravelStateAnnotation } from "../graph/state.js";
import type { RouteSkeletonDay } from "../types/internal.js";
/**
 * RoutePlanner 节点函数
 *
 * @param state - 当前 Graph 状态（必须包含 intent，否则抛出错误）
 * @returns 需要更新的 State 字段（routeSkeleton 和 messages）
 */
export declare function routePlannerNode(state: typeof TravelStateAnnotation.State): Promise<{
    routeSkeleton: RouteSkeletonDay[];
    messages: import("@langchain/core/messages").AIMessageChunk<import("@langchain/core/messages").MessageStructure<import("@langchain/core/messages").MessageToolSet>>[];
}>;
//# sourceMappingURL=route-planner-agent.d.ts.map