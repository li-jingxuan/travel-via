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
 *   enrichedAccommodation (读)
 *   intent (读)
 *
 * - 模型：deepseek-chat（优先速度，配合温度与重试策略保稳定）
 * - temperature=0：零随机性，最大化输出稳定性
 * - Tools：无（纯 LLM 推理 + 结构化输出）
 */

import { SystemMessage, HumanMessage } from "@langchain/core/messages"
import { createDeepSeekReasoner } from "../lib/llm.js"
import type { TravelStateAnnotation } from "../graph/state.js"
import type { ITravelPlan } from "@repo/shared-types/travel"
import { FORMATTER_SYSTEM_PROMPT } from "../prompts/index.js"
import { agentLog } from "../lib/logger.js"

/**
 * 格式化组装专用 LLM 实例
 *
 * temperature=0 是关键设置：
 * - 这个节点的任务是"按模板填空"，不需要任何创造性
 * - 温度为 0 时 LLM 输出最确定性，JSON 格式错误概率最低
 * - 如果温度 > 0，LLM 可能"自作主张"修改字段名或添加额外内容
 */
const llm = createDeepSeekReasoner({ temperature: 0.4 })
llm.withConfig({ response_format: { type: 'json_object' } })
/** 首次请求 + 2 次重试 */
const FORMATTER_MAX_ATTEMPTS = 3

/**
 * 判断 formatter 错误是否适合在节点内重试。
 *
 * 当前仅把“输出格式不可解析”视为可恢复错误；
 * 业务语义问题仍交给下游 validator 统一处理。
 */
function isRecoverableFormatterError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)

  return (
    message.includes("Unexpected token")
    || message.includes("JSON")
    || message.includes("code block")
    || message.includes("markdown")
    || message.includes("Unterminated string")
    || message.includes("truncated")
    || message.includes("finish_reason=length")
  )
}

/**
 * 将 LLM content 统一提取为文本。
 * 兼容：
 * - string
 * - LangChain content blocks（含 text 字段）
 */
function extractTextFromContent(content: unknown): string {
  if (typeof content === "string") {
    return content
  }

  if (!Array.isArray(content)) {
    return ""
  }

  let merged = ""
  for (const part of content) {
    if (typeof part === "string") {
      merged += part
      continue
    }

    if (
      part
      && typeof part === "object"
      && "text" in part
      && typeof (part as { text?: unknown }).text === "string"
    ) {
      merged += (part as { text: string }).text
    }
  }

  return merged
}

/**
 * 判断响应是否疑似被截断。
 * OpenAI 兼容接口一般会给 finish_reason，length 表示到达输出上限。
 */
function isResponseTruncated(response: unknown): boolean {
  if (!response || typeof response !== "object") return false
  if (!("response_metadata" in response)) return false

  const metadata = (response as { response_metadata?: unknown }).response_metadata
  if (!metadata || typeof metadata !== "object") return false

  const finishReason = (metadata as { finish_reason?: unknown }).finish_reason
  return finishReason === "length"
}

/**
 * 简单退避等待，避免连续瞬时重试导致同类错误高频复现。
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

const enrichedRouteSkeleton = (state: typeof TravelStateAnnotation.State) => {
  return state.routeSkeleton?.map((dayPlan) => {
    const {
      distance=0, drivingHours=0, day, title, waypoints, description,
      foodRecommendation, commentTips, accommodation, activities
    } = dayPlan

    const enrichedAccommodation = state.enrichedAccommodation.get(day - 1)
    const enrichedActivities = state.enrichedActivities.get(day - 1)

    return {
      distance,
      drivingHours,
      day,
      title,
      waypoints, description,
      foodRecommendation,
      commentTips,
      activities: (enrichedActivities || activities).map((c) => ({ ...c })),
      accommodation: enrichedAccommodation || accommodation
    }
  })
}

/**
 * Formatter 节点函数
 *
 * @param state - 当前 Graph 状态（必须包含 routeSkeleton 和 intent）
 * @returns 需要更新的 State 字段（finalPlan）
 * @throws 当 LLM 无法产出合法 JSON 时抛出错误（触发 Validator 重试机制）
 */
export async function formatterNode(
  state: typeof TravelStateAnnotation.State,
) {
  // 读取两个必需的输入源
  const skeleton = state.routeSkeleton
  const intent = state.intent

  agentLog("格式化", "开始组装最终行程", {
    routeDays: skeleton?.length ?? 0,
    enrichedActivityDays: state.enrichedActivities?.size ?? 0,
    enrichedAccommodationDays: state.enrichedAccommodation?.size ?? 0,
  })

  if (!skeleton || !intent) {
    agentLog("格式化", "组装失败", {
      reason: "缺少 routeSkeleton 或 intent",
    })
    throw new Error(
      "formatterNode: routeSkeleton or intent is null, cannot format",
    )
  }

  // 增强骨架
  const newSkeleton = enrichedRouteSkeleton(state)!

  // 构造完整的数据上下文对象，包含所有中间产物
  // Map 类型转为普通 Object 以便 JSON 序列化传给 LLM
  const contextData = {
    intent,                                    // 用户原始意图
    skeleton: newSkeleton,                   // 增强之后行程骨架
  }

  const contextDataJSONStr = JSON.stringify(contextData, null, 2)
  agentLog('contextData: ', contextDataJSONStr)

  // 固定主提示：每次重试都复用同一份输入上下文，避免重试时上下文漂移。
  const baseMessages = [
    new SystemMessage(FORMATTER_SYSTEM_PROMPT),
    new HumanMessage(
      `请根据提示词完成以下数据的填充 ITravelPlan JSON：\n\n${contextDataJSONStr}`,
    ),
  ]

  // 固定纠错提示：失败后附加同一条短提示，不做累积，避免重试输入不断膨胀。
  const retryHint = new HumanMessage(
    [
      "上次输出解析失败，请严格修正并重新输出：",
      "1. 只输出纯 JSON 对象",
      "2. 不要 markdown 代码块",
      "3. 字段名与结构必须完全匹配 ITravelPlan Schema",
    ].join("\n"),
  )
  let lastError: unknown = null

  // 节点内有限重试：只修复“输出格式问题”，避免整图回退带来的高成本。
  for (let attempt = 1; attempt <= FORMATTER_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await llm.invoke(
        attempt === 1 ? baseMessages : [...baseMessages, retryHint],
      )
      agentLog("格式化", "LLM 调用成功，输出: ", response.content)

      if (isResponseTruncated(response)) {
        throw new Error("formatter response truncated: finish_reason=length")
      }

      const content = extractTextFromContent(response.content)
      if (!content.trim()) {
        throw new Error("formatter response content is empty")
      }

      // 兼容模型偶发返回 markdown code fence 的情况。
      const jsonStr = content.replace(/```\w*\n?|\n?```/g, "").trim()
      const finalPlan: ITravelPlan = {
        ...JSON.parse(jsonStr),
        days: newSkeleton.map(c => ({ ...c }))
      }

      agentLog("格式化", "组装成功", {
        planName: finalPlan.planName,
        totalDays: finalPlan.totalDays,
        days: finalPlan.days.length,
        attempt,
      })

      return {
        finalPlan,       // 写入最终计划 → State.finalPlan
      }
    } catch (error) {
      lastError = error
      const recoverable = isRecoverableFormatterError(error)

      agentLog("格式化", "组装失败", {
        reason: "LLM 输出 JSON 解析失败",
        attempt,
        recoverable,
        error: error instanceof Error ? error.message : String(error),
      })

      // 不可恢复错误或已达上限时直接退出循环并抛错。
      if (!recoverable || attempt === FORMATTER_MAX_ATTEMPTS) {
        break
      }

      // 轻量线性退避：第 1 次 150ms，第 2 次 300ms。
      await sleep(150 * attempt)
    }
  }

  throw new Error(
    `Formatter failed after ${FORMATTER_MAX_ATTEMPTS} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  )
}
