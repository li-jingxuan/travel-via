/**
 * TravelPlanner Graph — 主编排图定义
 *
 * ============================================================================
 * 架构总览
 * ============================================================================
 *
 * 本文件定义了 LangGraph StateGraph 的完整拓扑结构，包括：
 * 1. 节点注册（addNode）— 每个 Agent 对应一个节点
 * 2. 边定义（addEdge）— 固定的流转路径
 * 3. 条件边（addConditionalEdges）— 根据状态动态决定下一步
 * 4. 编译（compile）— 生成可执行的 Graph 实例
 *
 * MVP 阶段的拓扑（Phase 1，无 Tool Agent）：
 *
 *   START
 *     │
 *     ▼
 *   ┌──────────────┐
 *   │  intent_agent │  ← deepseek-v3, 用户文本 → TravelIntent
 *   └──────┬───────┘
 *          │
 *          ▼
 *   ┌───────────────┐
 *   │ route_planner │  ← deepseek-reasoner, intent → RouteSkeletonDay[]
 *   └───────┬───────┘
 *           │
 *           ▼
 *   ┌──────────────┐
 *   │   formatter   │  ← deepseek-reasoner, 所有中间数据 → ITravelPlan
 *   └──────┬───────┘
 *          │
 *          ▼
 *   ┌──────────────┐
 *   │   validator   │  ← Zod 校验 finalPlan 是否符合 Schema
 *   └──────┬───────┘
 *          │
 *     ┌────┴────┐
 *     ▼         ▼
 *   END    retry (回退到 route_planner，最多 2 次)
 *
 * ============================================================================
 * Phase 2 将扩展为 Fan-out/Fan-in 并行拓扑：
 *
 *   route_planner ──┬→ poi_agent      ─┐
 *                   ├→ weather_agent  ├──→ formatter → validator
 *                   └→ hotel_agent    ─┘
 *
 * ============================================================================
 * 核心概念说明
 * ============================================================================
 *
 * StateGraph vs 函数式调用：
 *   - 函数式：手动 A(B(args)) 传参，自己控制循环
 *   - StateGraph：声明式定义节点和边，框架控制流转
 *
 * 节点函数签名：
 *   async (state: typeof TravelStateAnnotation.State) => Promise<Partial<State>>
 *   - 输入：当前完整的 State
 *   - 返回：需要更新的字段（未返回的字段保持不变）
 *
 * compile() 之后：
 *   - graph.invoke(initialState)   — 同步执行，返回最终 State
 *   - graph.stream(initialState)  — 流式执行，逐 node 推送事件
 *   - graph.getState(config)      — 获取某个 checkpoint 的状态
 */
/**
 * 编译后的 TravelPlanner Graph 实例
 *
 * 使用方式：
 * ```ts
 * import { travelPlannerGraph } from "@repo/agents"
 *
 * const result = await travelPlannerGraph.invoke({
 *   userInput: "我想去新疆自驾游，15天，6月份",
 * })
 *
 * console.log(result.finalPlan)  // ITravelPlan | null
 * console.log(result.errors)     // string[] 错误日志
 * ```
 */
declare const travelPlannerGraph: import("@langchain/langgraph").CompiledStateGraph<{
    userInput: string;
    intent: import("../index.js").TravelIntent | null;
    routeSkeleton: import("../index.js").RouteSkeletonDay[] | null;
    enrichedActivities: Map<number, import("@repo/shared-types/travel").IActivity[]>;
    enrichedWeather: import("@repo/shared-types/travel").IWeather[];
    enrichedAccommodation: Map<number, import("@repo/shared-types/travel").IAccommodation[]>;
    finalPlan: import("@repo/shared-types/travel").ITravelPlan | null;
    retryCount: number;
    errors: string[];
    messages: import("@langchain/core/messages").BaseMessage<import("@langchain/core/messages").MessageStructure<import("@langchain/core/messages").MessageToolSet>, import("@langchain/core/messages").MessageType>[];
}, {
    userInput?: string | import("@langchain/langgraph").OverwriteValue<string> | undefined;
    intent?: import("../index.js").TravelIntent | import("@langchain/langgraph").OverwriteValue<import("../index.js").TravelIntent | null> | null | undefined;
    routeSkeleton?: import("../index.js").RouteSkeletonDay[] | import("@langchain/langgraph").OverwriteValue<import("../index.js").RouteSkeletonDay[] | null> | null | undefined;
    enrichedActivities?: Map<number, import("@repo/shared-types/travel").IActivity[]> | import("@langchain/langgraph").OverwriteValue<Map<number, import("@repo/shared-types/travel").IActivity[]>> | undefined;
    enrichedWeather?: import("@repo/shared-types/travel").IWeather[] | import("@langchain/langgraph").OverwriteValue<import("@repo/shared-types/travel").IWeather[]> | undefined;
    enrichedAccommodation?: Map<number, import("@repo/shared-types/travel").IAccommodation[]> | import("@langchain/langgraph").OverwriteValue<Map<number, import("@repo/shared-types/travel").IAccommodation[]>> | undefined;
    finalPlan?: import("@repo/shared-types/travel").ITravelPlan | import("@langchain/langgraph").OverwriteValue<import("@repo/shared-types/travel").ITravelPlan | null> | null | undefined;
    retryCount?: number | import("@langchain/langgraph").OverwriteValue<number> | undefined;
    errors?: string[] | import("@langchain/langgraph").OverwriteValue<string[]> | undefined;
    messages?: import("@langchain/core/messages").BaseMessage<import("@langchain/core/messages").MessageStructure<import("@langchain/core/messages").MessageToolSet>, import("@langchain/core/messages").MessageType>[] | import("@langchain/langgraph").OverwriteValue<import("@langchain/core/messages").BaseMessage<import("@langchain/core/messages").MessageStructure<import("@langchain/core/messages").MessageToolSet>, import("@langchain/core/messages").MessageType>[]> | undefined;
}, "__start__" | "intent_agent" | "ask_clarification" | "route_planner" | "formatter" | "validator", {
    userInput: import("@langchain/langgraph").BaseChannel<string, string | import("@langchain/langgraph").OverwriteValue<string>, unknown>;
    intent: import("@langchain/langgraph").BaseChannel<import("../index.js").TravelIntent | null, import("../index.js").TravelIntent | import("@langchain/langgraph").OverwriteValue<import("../index.js").TravelIntent | null> | null, unknown>;
    routeSkeleton: import("@langchain/langgraph").BaseChannel<import("../index.js").RouteSkeletonDay[] | null, import("../index.js").RouteSkeletonDay[] | import("@langchain/langgraph").OverwriteValue<import("../index.js").RouteSkeletonDay[] | null> | null, unknown>;
    enrichedActivities: import("@langchain/langgraph").BaseChannel<Map<number, import("@repo/shared-types/travel").IActivity[]>, Map<number, import("@repo/shared-types/travel").IActivity[]> | import("@langchain/langgraph").OverwriteValue<Map<number, import("@repo/shared-types/travel").IActivity[]>>, unknown>;
    enrichedWeather: import("@langchain/langgraph").BaseChannel<import("@repo/shared-types/travel").IWeather[], import("@repo/shared-types/travel").IWeather[] | import("@langchain/langgraph").OverwriteValue<import("@repo/shared-types/travel").IWeather[]>, unknown>;
    enrichedAccommodation: import("@langchain/langgraph").BaseChannel<Map<number, import("@repo/shared-types/travel").IAccommodation[]>, Map<number, import("@repo/shared-types/travel").IAccommodation[]> | import("@langchain/langgraph").OverwriteValue<Map<number, import("@repo/shared-types/travel").IAccommodation[]>>, unknown>;
    finalPlan: import("@langchain/langgraph").BaseChannel<import("@repo/shared-types/travel").ITravelPlan | null, import("@repo/shared-types/travel").ITravelPlan | import("@langchain/langgraph").OverwriteValue<import("@repo/shared-types/travel").ITravelPlan | null> | null, unknown>;
    retryCount: import("@langchain/langgraph").BaseChannel<number, number | import("@langchain/langgraph").OverwriteValue<number>, unknown>;
    errors: import("@langchain/langgraph").BaseChannel<string[], string[] | import("@langchain/langgraph").OverwriteValue<string[]>, unknown>;
    messages: import("@langchain/langgraph").BaseChannel<import("@langchain/core/messages").BaseMessage<import("@langchain/core/messages").MessageStructure<import("@langchain/core/messages").MessageToolSet>, import("@langchain/core/messages").MessageType>[], import("@langchain/core/messages").BaseMessage<import("@langchain/core/messages").MessageStructure<import("@langchain/core/messages").MessageToolSet>, import("@langchain/core/messages").MessageType>[] | import("@langchain/langgraph").OverwriteValue<import("@langchain/core/messages").BaseMessage<import("@langchain/core/messages").MessageStructure<import("@langchain/core/messages").MessageToolSet>, import("@langchain/core/messages").MessageType>[]>, unknown>;
}, {
    userInput: import("@langchain/langgraph").BaseChannel<string, string | import("@langchain/langgraph").OverwriteValue<string>, unknown>;
    intent: import("@langchain/langgraph").BaseChannel<import("../index.js").TravelIntent | null, import("../index.js").TravelIntent | import("@langchain/langgraph").OverwriteValue<import("../index.js").TravelIntent | null> | null, unknown>;
    routeSkeleton: import("@langchain/langgraph").BaseChannel<import("../index.js").RouteSkeletonDay[] | null, import("../index.js").RouteSkeletonDay[] | import("@langchain/langgraph").OverwriteValue<import("../index.js").RouteSkeletonDay[] | null> | null, unknown>;
    enrichedActivities: import("@langchain/langgraph").BaseChannel<Map<number, import("@repo/shared-types/travel").IActivity[]>, Map<number, import("@repo/shared-types/travel").IActivity[]> | import("@langchain/langgraph").OverwriteValue<Map<number, import("@repo/shared-types/travel").IActivity[]>>, unknown>;
    enrichedWeather: import("@langchain/langgraph").BaseChannel<import("@repo/shared-types/travel").IWeather[], import("@repo/shared-types/travel").IWeather[] | import("@langchain/langgraph").OverwriteValue<import("@repo/shared-types/travel").IWeather[]>, unknown>;
    enrichedAccommodation: import("@langchain/langgraph").BaseChannel<Map<number, import("@repo/shared-types/travel").IAccommodation[]>, Map<number, import("@repo/shared-types/travel").IAccommodation[]> | import("@langchain/langgraph").OverwriteValue<Map<number, import("@repo/shared-types/travel").IAccommodation[]>>, unknown>;
    finalPlan: import("@langchain/langgraph").BaseChannel<import("@repo/shared-types/travel").ITravelPlan | null, import("@repo/shared-types/travel").ITravelPlan | import("@langchain/langgraph").OverwriteValue<import("@repo/shared-types/travel").ITravelPlan | null> | null, unknown>;
    retryCount: import("@langchain/langgraph").BaseChannel<number, number | import("@langchain/langgraph").OverwriteValue<number>, unknown>;
    errors: import("@langchain/langgraph").BaseChannel<string[], string[] | import("@langchain/langgraph").OverwriteValue<string[]>, unknown>;
    messages: import("@langchain/langgraph").BaseChannel<import("@langchain/core/messages").BaseMessage<import("@langchain/core/messages").MessageStructure<import("@langchain/core/messages").MessageToolSet>, import("@langchain/core/messages").MessageType>[], import("@langchain/core/messages").BaseMessage<import("@langchain/core/messages").MessageStructure<import("@langchain/core/messages").MessageToolSet>, import("@langchain/core/messages").MessageType>[] | import("@langchain/langgraph").OverwriteValue<import("@langchain/core/messages").BaseMessage<import("@langchain/core/messages").MessageStructure<import("@langchain/core/messages").MessageToolSet>, import("@langchain/core/messages").MessageType>[]>, unknown>;
}, import("@langchain/langgraph").StateDefinition, {
    intent_agent: {
        intent: import("../index.js").TravelIntent;
        messages: import("@langchain/core/messages").AIMessageChunk<import("@langchain/core/messages").MessageStructure<import("@langchain/core/messages").MessageToolSet>>[];
    };
    ask_clarification: {
        errors: string[];
    };
    route_planner: {
        routeSkeleton: import("../index.js").RouteSkeletonDay[];
        messages: import("@langchain/core/messages").AIMessageChunk<import("@langchain/core/messages").MessageStructure<import("@langchain/core/messages").MessageToolSet>>[];
    };
    formatter: {
        finalPlan: import("@repo/shared-types/travel").ITravelPlan;
        messages: import("@langchain/core/messages").AIMessageChunk<import("@langchain/core/messages").MessageStructure<import("@langchain/core/messages").MessageToolSet>>[];
    };
    validator: {
        retryCount: number;
        errors: string[];
    } | {
        retryCount?: undefined;
        errors?: undefined;
    };
}, unknown, unknown>;
export { travelPlannerGraph };
//# sourceMappingURL=index.d.ts.map