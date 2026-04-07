/**
 * Formatter Agent — 最终组装节点
 *
 * ============================================================================
 * 职责
 * ============================================================================
 * 将管线中收集到的所有中间数据组装成严格符合 ITravelPlan Schema 的最终 JSON。
 *
 * 这是整个流程的最后一步，也是质量把关最严格的一步：
 * - 输入数据来源多样（skeleton 来自 RoutePlanner，POI/天气/酒店来自各自的 Agent）
 * - 输出格式要求严格（必须符合 travel-plan.schema.json 的每个字段）
 * - 一旦出错会导致前端渲染失败或 Validator 重试
 *
 * ============================================================================
 * 数据组装映射关系
 * ============================================================================
 *
 *   ITravelPlan.planName        ← 根据 destination + days 生成
 *   ITravelPlan.totalDays       ← intent.days
 *   ITravelPlan.totalDistance   ← 所有 days.distance 的累加
 *   ITravelPlan.weather         ← enrichedWeather（MVP阶段为空则估算）
 *   ITravelPlan.days[i]         ← routeSkeleton[i] 作为基础框架
 *     .activities               ← enrichedActivities[i] 或 skeleton 原始数据
 *     .accommodation            ← enrichedAccommodation[i] 或 skeleton 原始数据
 *
 * ============================================================================
 * 在 Graph 中的位置
 * ============================================================================
 *
 *   route_planner → formatter → validator
 *                      ↑          │
 *   routeSkeleton (读)           finalPlan (写)
 *   enrichedActivities (读)
 *   enrichedWeather (读)
 *   enrichedAccommodation (读)
 *   intent (读)
 *
 * - 模型：deepseek-reasoner（需要严格按照 Schema 组装，不能有格式错误）
 * - temperature=0：零随机性，最大化输出稳定性
 * - Tools：无（纯 LLM 推理 + 结构化输出）
 */
import type { TravelStateAnnotation } from "../graph/state.js";
import type { ITravelPlan } from "@repo/shared-types/travel";
/**
 * Formatter 节点函数
 *
 * @param state - 当前 Graph 状态（必须包含 routeSkeleton 和 intent）
 * @returns 需要更新的 State 字段（finalPlan 和 messages）
 * @throws 当 LLM 无法产出合法 JSON 时抛出错误（触发 Validator 重试机制）
 */
export declare function formatterNode(state: typeof TravelStateAnnotation.State): Promise<{
    finalPlan: ITravelPlan;
    messages: import("@langchain/core/messages").AIMessageChunk<import("@langchain/core/messages").MessageStructure<import("@langchain/core/messages").MessageToolSet>>[];
}>;
//# sourceMappingURL=formatter-agent.d.ts.map