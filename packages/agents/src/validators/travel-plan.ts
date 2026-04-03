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
 * 采用"字段存在性检查"策略（非 Zod runtime validation）：
 * - 检查顶层 9 个必填字段是否都存在且非 null
 * - 检查 days 数组中每一天的所有必填字段
 * - 检查每天 activities 数组中每个活动的所有必填字段
 * - 收集所有缺失字段为错误列表
 *
 * 未来可升级为使用 z.inferFromSchema() 从 travel-plan.schema.json 自动生成
 * Zod schema 进行更严格的类型+格式双重校验。
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

import type { ITravelPlan } from "@repo/shared-types/travel"
import type { TravelStateAnnotation } from "../graph/state.js"

// ==================== 校验规则定义 ====================
// 这些常量数组定义了每一层级的必填字段名
// 与 ITravelPlan / ITravel / IActivity 接口定义保持同步

/** ITravelPlan 顶层必填字段 */
const REQUIRED_TOP_LEVEL_FIELDS = [
  "planName",
  "totalDays",
  "totalDistance",
  "vehicleType",
  "vehicleAdvice",
  "bestSeason",
  "essentialItems",
  "weather",
  "days",
] as const

/** ITravel（单日行程）必填字段 */
const REQUIRED_DAY_FIELDS = [
  "day",
  "title",
  "waypoints",
  "description",
  "accommodation",
  "foodRecommendation",
  "activities",
  "distance",
  "drivingHours",
] as const

/** IActivity（景点活动）必填字段 */
const REQUIRED_ACTIVITY_FIELDS = [
  "name",
  "description",
  "suggestedHours",
  "ticketPriceCny",
  "openingHours",
  "images",
] as const

/** 校验结果类型 */
interface ValidationResult {
  valid: boolean
  /** 收集到的所有错误描述 */
  errors: string[]
}

/**
 * 核心校验函数 — 逐层检查 ITravelPlan 的字段完整性
 *
 * 校验层级（从外到内）：
 *   Level 1: 顶层字段（planName, totalDays 等 9 个）
 *   Level 2: days[] 数组非空检查
 *   Level 3: 每个 day 的字段（day, title, waypoints 等 9 个）
 *   Level 4: 每个 day.activities[] 数组检查
 *   Level 5: 每个 activity 的字段（name, ticketPriceCny 等 6 个）
 *
 * @param plan - 待校验的 ITravelPlan 对象
 * @returns 校验结果（valid=true 表示全部通过）
 */
function validateITravelPlan(plan: ITravelPlan): ValidationResult {
  const errors: string[] = []

  // --- Level 1: 顶层字段检查 ---
  for (const field of REQUIRED_TOP_LEVEL_FIELDS) {
    if (plan[field] === undefined || plan[field] === null) {
      errors.push(`缺少必填字段: ${field}`)
    }
  }

  // --- Level 2: days 数组非空 ---
  if (!Array.isArray(plan.days) || plan.days.length === 0) {
    errors.push("days 必须是非空数组")
  } else {
    // --- Level 3-5: 逐天逐活动递归检查 ---
    for (let i = 0; i < plan.days.length; i++) {
      const day = plan.days[i]

      // 防御性空值检查（TypeScript strictNullChecks 要求）
      if (!day) {
        errors.push(`days[${i}] 为空`)
        continue
      }

      // Level 3: 单日字段检查
      for (const field of REQUIRED_DAY_FIELDS) {
        if (day[field] === undefined || day[field] === null) {
          errors.push(`days[${i}] 缺少必填字段: ${field}`)
        }
      }

      // Level 4: activities 数组检查
      if (!Array.isArray(day.activities)) {
        errors.push(`days[${i}].activities 必须是数组`)
      } else {
        for (let j = 0; j < day.activities.length; j++) {
          const activity = day.activities[j]

          if (!activity) {
            errors.push(`days[${i}].activities[${j}] 为空`)
            continue
          }

          // Level 5: 单个活动字段检查
          for (const field of REQUIRED_ACTIVITY_FIELDS) {
            if (activity[field] === undefined || activity[field] === null) {
              errors.push(
                `days[${i}].activities[${j}] 缺少必填字段: ${field}`,
              )
            }
          }
        }
      }
    }
  }

  return { valid: errors.length === 0, errors }
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
export async function validatorNode(
  state: typeof TravelStateAnnotation.State,
) {
  const plan = state.finalPlan

  // finalPlan 为 null 说明 Formatter 失败了，直接标记重试
  if (!plan) {
    return {
      retryCount: state.retryCount + 1,
      errors: [...(state.errors ?? []), "Validator: finalPlan is null"],
    }
  }

  // 执行字段级校验
  const result = validateITravelPlan(plan)

  if (result.valid) {
    // 校验通过 → 返回空对象（不更新任何 State 字段）
    // LangGraph 会保持现有 State 不变，条件路由将走向 END
    return {}
  }

  // 校验失败 → 更新 retryCount 和 errors
  // shouldRetryOrEnd 会根据 retryCount 决定是否继续重试
  return {
    retryCount: state.retryCount + 1,
    errors: [...(state.errors ?? []), ...result.errors],
  }
}
