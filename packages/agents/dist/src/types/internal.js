/**
 * 内部类型定义 — Graph 中间数据结构
 *
 * 这些类型只在 Agent 内部流转，不会暴露给外部消费者。
 * 外部消费者看到的是 ITravelPlan（定义在 @repo/shared-types/travel.ts）。
 *
 * 设计思路：
 * - TravelIntent      : IntentAgent 的输出，用户原始需求的结构化表示
 * - RouteSkeletonDay  : RoutePlanner 的输出，每天的"骨架"数据（只有名称和描述）
 *                       后续 POI/Weather/Hotel Agent 会往里面填充详细数据
 *
 * 为什么不直接用 ITravel？
 * 因为 ITravel 是最终输出格式（含 ticketPriceCny、openingHours 等 API 数据），
 * 而 RouteSkeleton 是中间产物（这些字段在骨架阶段还不存在）。
 * 分开定义可以让每个 Agent 的职责更清晰：
 *   RoutePlanner 只负责"设计路线"，不用操心门票价格等细节
 *   POIAgent 只负责"填充景点详情"，不用重新设计路线
 */
export {};
