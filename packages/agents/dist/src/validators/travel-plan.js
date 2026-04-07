/**
 * SchemaValidator — ITravelPlan 校验节点
 *
 * ============================================================================
 * 职责
 * ============================================================================
 * 对 Formatter 输出的 finalPlan 进行字段级校验，确保其严格符合 ITravelPlan 接口定义。
 *
 * 为什么需要独立的校验节点而不是信任 LLM？
 * 1. LLM 输出的 JSON 可能缺少必填字段（如忘记填 ticketPriceCny）
 * 2. LLM 可能输出额外字段或类型不匹配（如 days 写成了字符串）
 * 3. 校验失败后可以通过条件边触发重试，自动修复问题
 *
 * ============================================================================
 * 校验策略
 * ============================================================================
 *
 * 采用 Zod runtime validation：
 * - 使用 Zod schema 描述 ITravelPlan 的完整字段结构
 * - 通过 safeParse 一次性完成类型+字段存在性校验
 * - 使用 strict() 拒绝额外未知字段
 * - 收集并格式化所有 issue 为错误列表
 *
 * ============================================================================
 * 在 Graph 中的位置与重试逻辑
 * ============================================================================
 *
 *   formatter → validator ──→ success → END（校验通过）
 *                    │
 *                    └──→ retry → route_planner（重新生成，最多 MAX_RETRIES 次）
 *
 * Validator 本身不修改 finalPlan，它只做两件事：
 * 1. 检查 finalPlan 是否合法
 * 2. 更新 retryCount 和 errors（供 shouldRetryOrEnd 条件路由函数判断）
 *
 * 注意：Validator 返回空对象 {} 表示"无状态更新"，这会让 LangGraph 保持 State 不变。
 * 只有在发现错误时才返回 { retryCount: n+1, errors: [...] } 触发重试。
 */
import { z } from "zod";
const activityImageSchema = z
    .object({
    description: z.string(),
    imgSrc: z.string(),
})
    .strict();
const activitySchema = z
    .object({
    name: z.string(),
    description: z.string(),
    suggestedHours: z.string(),
    ticketPriceCny: z.number(),
    openingHours: z.string(),
    images: z.array(activityImageSchema),
})
    .strict();
const accommodationSchema = z
    .object({
    name: z.string(),
    address: z.string(),
    feature: z.string(),
    booking: z.string().optional(),
    price: z.number().optional(),
})
    .strict();
const weatherDaySchema = z
    .object({
    tempMax: z.number(),
    tempMin: z.number(),
    weather: z.string(),
})
    .strict();
const weatherSchema = z
    .object({
    area: z.string(),
    daytime: weatherDaySchema,
    nighttime: weatherDaySchema,
    clothing: z.string(),
})
    .strict();
const travelDaySchema = z
    .object({
    day: z.number(),
    title: z.string(),
    waypoints: z.string(),
    description: z.string(),
    accommodation: z.array(accommodationSchema),
    foodRecommendation: z.array(z.string()),
    commentTips: z.string().optional(),
    activities: z.array(activitySchema),
    distance: z.number(),
    drivingHours: z.number(),
})
    .strict();
const travelPlanSchema = z
    .object({
    planName: z.string(),
    totalDays: z.number(),
    totalDistance: z.number(),
    vehicleType: z.string(),
    vehicleAdvice: z.string(),
    bestSeason: z.string(),
    essentialItems: z.array(z.string()),
    weather: z.array(weatherSchema),
    days: z.array(travelDaySchema).nonempty("days 必须是非空数组"),
})
    .strict();
/**
 * 核心校验函数 — 使用 Zod 对 ITravelPlan 做运行时校验
 *
 * @param plan - 待校验的 ITravelPlan 对象
 * @returns 校验结果（valid=true 表示全部通过）
 */
function validateITravelPlan(plan) {
    const parseResult = travelPlanSchema.safeParse(plan);
    if (parseResult.success) {
        return { valid: true, errors: [] };
    }
    const errors = parseResult.error.issues.map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join(".") : "root";
        return `字段校验失败 (${path}): ${issue.message}`;
    });
    return { valid: false, errors };
}
/**
 * Validator 节点函数
 *
 * @param state - 当前 Graph 状态（应包含 finalPlan、retryCount、errors）
 * @returns 需要更新的 State 字段（retryCount 和/或 errors）
 *
 * 返回值的含义：
 * - {}                    → 校验通过，不做任何更新（shouldRetryOrEnd 返回 "success"）
 * - { retryCount: n+1 }   → 发现错误，增加重试计数（shouldRetryOrEnd 返回 "retry"）
 * - { errors: [...] }     → 追加新的错误描述
 */
export async function validatorNode(state) {
    const plan = state.finalPlan;
    // finalPlan 为 null 说明 Formatter 失败了，直接标记重试
    if (!plan) {
        return {
            retryCount: state.retryCount + 1,
            errors: [...(state.errors ?? []), "Validator: finalPlan is null"],
        };
    }
    // 执行字段级校验
    const result = validateITravelPlan(plan);
    if (result.valid) {
        // 校验通过 → 返回空对象（不更新任何 State 字段）
        // LangGraph 会保持现有 State 不变，条件路由将走向 END
        return {};
    }
    // 校验失败 → 更新 retryCount 和 errors
    // shouldRetryOrEnd 会根据 retryCount 决定是否继续重试
    return {
        retryCount: state.retryCount + 1,
        errors: [...(state.errors ?? []), ...result.errors],
    };
}
