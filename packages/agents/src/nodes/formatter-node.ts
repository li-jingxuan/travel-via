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
const llm = createDeepSeekReasoner({ temperature: 0 })

/**
 * Formatter 节点函数
 *
 * @param state - 当前 Graph 状态（必须包含 routeSkeleton 和 intent）
 * @returns 需要更新的 State 字段（finalPlan 和 messages）
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
    enrichedWeatherCount: state.enrichedWeather?.length ?? 0,
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

  // 构造完整的数据上下文对象，包含所有中间产物
  // Map 类型转为普通 Object 以便 JSON 序列化传给 LLM
  const contextData = {
    intent,                                    // 用户原始意图
    routeSkeleton: skeleton,                   // 行程骨架
    enrichedActivities: Object.fromEntries(    // POI 丰富数据（Map→Object）
      state.enrichedActivities ?? [],
    ),
    enrichedWeather: state.enrichedWeather ?? [],       // 天气数据
    enrichedAccommodation: Object.fromEntries(          // 酒店数据（Map→Object）
      state.enrichedAccommodation ?? [],
    ),
  }

  // 调用 LLM 执行格式化组装
  // SystemMessage 包含完整的 ITravelPlan Schema 定义和填充规则
  // HumanMessage 提供所有待组装的原始数据
  const response = await llm.invoke([
    new SystemMessage(FORMATTER_SYSTEM_PROMPT),
    new HumanMessage(
      `请将以下数据组装为完整的 ITravelPlan JSON：\n\n${JSON.stringify(contextData, null, 2)}`,
    ),
  ])

  // 解析最终的 ITravelPlan JSON
  const content = response.content as string
  let finalPlan: ITravelPlan

  try {
    const jsonStr = content.replace(/```\w*\n?|\n?```/g, "").trim()
    finalPlan = JSON.parse(jsonStr)
  } catch (parseError) {
    agentLog("格式化", "组装失败", {
      reason: "LLM 输出 JSON 解析失败",
      error: parseError instanceof Error ? parseError.message : String(parseError),
    })
    // Formatter 的 JSON 解析失败是不可接受的
    // 抛出错误让外层处理（Graph 会继续运行但 finalPlan 为 null，
    // 然后 Validator 会检测到 null 并触发重试）
    console.error("Formatter JSON parse failed:", parseError)
    console.error("Raw LLM output:", content)
    throw new Error(`Formatter failed to produce valid ITravelPlan: ${parseError}`)
  }

  agentLog("格式化", "组装成功", {
    planName: finalPlan.planName,
    totalDays: finalPlan.totalDays,
    dayCount: finalPlan.days.length,
  })

  return {
    finalPlan,          // 写入最终计划 → State.finalPlan
    messages: [response], // 追加到消息历史 → State.messages
  }
}
