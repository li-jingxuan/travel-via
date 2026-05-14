import { travelPlannerGraph } from "@repo/agents/src/index.js"
import { createDeepSeekReasoner } from "@repo/agents/src/lib/llm.js"
import { AGENT_STAGE, AGENT_STAGE_STATUS, type AgentStage } from "@repo/shared-types/agent-stream"
import {
  HISTORY_MESSAGE_KIND,
  HISTORY_MESSAGE_ROLE,
  HISTORY_STATUS,
  type ConversationRecord,
  type HistoryStatus,
} from "@repo/shared-types/history"
import type { ITravelPlan } from "@repo/shared-types/travel"
import { historyRepository } from "@repo/db/history-repository"
import { randomUUID } from "node:crypto"
import type { AgentStreamEvent, TravelClarificationResponse } from "../types/agent.js"
import { SUMMARY_MARKDOWN_SYSTEM_PROMPT } from "../prompts/summary.js"

/**
 * Graph 在 service 层可见的“聚合结果”。
 *
 * 说明：
 * - LangGraph 每个 node 只会返回 partial state
 * - service 侧在处理 stream 时，需要把多个 node 的 partial update 合并成一个可判断的最终态
 * - 这个接口不是 Graph 完整 state 的镜像，而是“本文件真正会消费到的字段子集”
 */
interface GraphInvokeResult {
  finalPlan?: ITravelPlan | null
  intent?: unknown
  collectedIntent?: unknown
  missingFields?: string[]
  needUserInput?: boolean
  conversationRecords?: ConversationRecord[]
  clarification?: TravelClarificationResponse | null
  issues?: Array<{ code?: string; message?: string }>
  errors?: string[]
}

/**
 * 非流式 `/plan` 接口对外返回的数据结构。
 *
 * 与 Graph state 的区别：
 * - 只保留接口消费者真正关心的结果字段
 * - 不暴露内部中间态（例如 routeSkeleton、retryCount 等）
 */
export interface CreatePlanServiceResult {
  finalPlan: ITravelPlan | null
  sessionId: string
  errors: string[]
  needUserInput: boolean
  missingFields?: string[]
  clarification?: TravelClarificationResponse | null
  collectedIntent?: unknown
  planSummary: string
  debugState?: unknown
}

const summaryLlm = createDeepSeekReasoner({ temperature: 0.4 })

// 规划阶段节点集合：用于把底层节点更新归一为“planning”语义事件。
const PLANNING_STAGE_NODE_SET = new Set([
  "route_planner",
  "route_enrich_entry",
  "driving_distance",
  "poi_enricher",
  "hotel_enricher",
  "pre_formatter_guard",
  "formatter",
  "validator",
])

const MAX_CONVERSATION_RECORDS = 16

/**
 * 统一生成/归一化会话 ID：
 * - 客户端传入非空 sessionId：沿用
 * - 未传或为空：服务端生成新的 UUID，作为首轮会话 ID
 */
function resolveSessionId(sessionId?: string): string {
  const normalized = sessionId?.trim() ?? ""
  return normalized || randomUUID()
}

/**
 * 将业务层 sessionId 映射为 LangGraph 的 thread_id。
 * 同一个 thread_id 会命中同一条 checkpoint 记忆链路。
 */
function buildGraphConfig(sessionId: string) {
  return {
    configurable: {
      thread_id: sessionId,
    },
  }
}

/**
 * 统一把 Graph 内部多种错误结构规整成 string[]。
 *
 * 历史原因：
 * - 旧链路里可能直接写 `errors`
 * - 新链路里更多通过 `issues` 传结构化问题项
 *
 * service 层对外输出、历史落库、状态判定都希望只面对一种简单结构，
 * 所以这里负责做最后一道归一化。
 */
function normalizeErrors(state: GraphInvokeResult): string[] {
  if (Array.isArray(state.errors)) {
    return state.errors
  }

  if (Array.isArray(state.issues)) {
    return state.issues
      .map((item) => item?.message)
      .filter((message): message is string => typeof message === "string")
  }

  return []
}

/**
 * 创建一条标准化的 conversation record。
 *
 * 这层小封装的价值在于：
 * - 避免各处手写时间戳和 role/kind 组合
 * - 保证写入 Graph state 与 history 消息表的 record 结构一致
 */
function createConversationRecord(
  role: ConversationRecord["role"],
  kind: ConversationRecord["kind"],
  content: string,
): ConversationRecord {
  return {
    role,
    kind,
    content,
    createdAt: Date.now(),
  }
}

/**
 * 将 Graph.stream() 返回的增量 chunk 合并到聚合 state。
 *
 * 这里不能直接无脑 `Object.assign`，原因是不同字段的合并语义不同：
 * - `issues` 需要累积，不能覆盖
 * - `conversationRecords` 需要追加后截断成最近窗口
 * - `finalPlan / clarification / needUserInput` 等字段则应以最新值覆盖
 *
 * 这个函数本质上是“Graph 原始增量状态”到“service 可消费聚合状态”的桥接层。
 */
function mergeStateChunk(target: GraphInvokeResult, chunk: Record<string, unknown>) {
  for (const nodeUpdate of Object.values(chunk)) {
    if (!nodeUpdate || typeof nodeUpdate !== "object") {
      continue
    }

    const partial = nodeUpdate as GraphInvokeResult

    if (Array.isArray(partial.issues) && partial.issues.length > 0) {
      target.issues = [...(target.issues ?? []), ...partial.issues]
    }

    if (Array.isArray(partial.conversationRecords) && partial.conversationRecords.length > 0) {
      target.conversationRecords = [
        ...(target.conversationRecords ?? []),
        ...partial.conversationRecords,
      ].slice(-MAX_CONVERSATION_RECORDS)
    }

    Object.assign(target, {
      ...partial,
      issues: target.issues,
      conversationRecords: target.conversationRecords,
    })
  }
}

/**
 * 基于当前轮的执行结果推导 history 主表状态。
 *
 * 优先级：
 * 1. 还需要补问 -> needs_input
 * 2. 有错误     -> failed
 * 3. 有最终计划 -> completed
 * 4. 其他情况   -> active
 *
 * 这里刻意不直接复用 Graph stage，是因为 history 状态是产品语义，
 * 目标是让列表页能一眼看懂“这条会话现在处于什么业务阶段”。
 */
function resolveHistoryStatus(
  needUserInput: boolean,
  errors: string[],
  finalPlan: ITravelPlan | null | undefined,
): HistoryStatus {
  if (needUserInput) {
    return HISTORY_STATUS.NeedsInput
  }

  if (errors.length > 0) {
    return HISTORY_STATUS.Failed
  }

  if (finalPlan) {
    return HISTORY_STATUS.Completed
  }

  return HISTORY_STATUS.Active
}

/**
 * 把本轮聚合后的最新状态回写到 history 主表。
 *
 * 设计上这里不负责写消息明细：
 * - 消息在事件发生时立即 append，保证可回放性
 * - 主表则只记录当前会话的“最新摘要态”
 *
 * 这样拆分后：
 * - 历史详情页依赖消息表拿完整对话
 * - 列表页依赖主表拿最新摘要与状态
 */
async function persistHistoryState(
  sessionId: string,
  state: GraphInvokeResult,
  planSummary: string,
) {
  const errors = normalizeErrors(state)
  const needUserInput = hasNeedUserInput(state, errors)
  const status = resolveHistoryStatus(needUserInput, errors, state.finalPlan)
  const conversationSnapshot = await historyRepository.getConversationSnapshot(sessionId)
  const collectedIntent =
    state.collectedIntent && typeof state.collectedIntent === "object"
      ? (state.collectedIntent as Record<string, unknown>)
      : null
  const destination =
    typeof collectedIntent?.destination === "string"
      ? collectedIntent.destination
      : ""
  const collectedDays =
    typeof collectedIntent?.days === "number"
      ? collectedIntent.days
      : 0
  const collectedTravelType =
    typeof collectedIntent?.travelType === "string"
      ? collectedIntent.travelType
      : ""

  await historyRepository.upsertHistoryState(sessionId, {
    status,
    title: state.finalPlan?.planName ?? "",
    destination,
    travelDays: state.finalPlan?.totalDays ?? collectedDays,
    travelType: state.finalPlan?.vehicleType ?? collectedTravelType,
    latestSummary: planSummary,
    finalPlan: state.finalPlan ?? null,
    collectedIntent: state.collectedIntent ?? null,
    clarification: state.clarification ?? null,
    conversationSnapshot,
    errors,
  })
}

/**
 * 统一判断当前是否需要用户继续补充信息。
 *
 * 兼容策略：
 * - 优先相信显式布尔字段 `needUserInput`
 * - 没有时再从 `issues / errors` 中兜底推导
 *
 * 这样能兼容不同 node、不同阶段的历史输出风格，避免 service 漏判。
 */
function hasNeedUserInput(state: GraphInvokeResult, errors: string[]): boolean {
  if (typeof state.needUserInput === "boolean") {
    return state.needUserInput
  }

  const fromIssues = Array.isArray(state.issues)
    ? state.issues.some((item) => item?.code === "NEED_USER_INPUT")
    : false

  const fromErrors = errors.some((item) => item.startsWith("NEED_USER_INPUT:"))

  return fromIssues || fromErrors
}

/**
 * 从 LangChain/LLM chunk 中提取纯文本。
 *
 * 由于 stream chunk 既可能是 string，也可能是 block 数组，
 * 所以这里做一层统一提取，供摘要流式拼接复用。
 */
function extractTextFromChunk(chunk: unknown): string {
  if (!chunk || typeof chunk !== "object") return ""
  const content = (chunk as { content?: unknown }).content

  if (typeof content === "string") {
    return content
  }

  if (Array.isArray(content)) {
    let merged = ""
    for (const part of content) {
      if (typeof part === "string") {
        merged += part
        continue
      }
      if (
        part &&
        typeof part === "object" &&
        "text" in part &&
        typeof (part as { text?: unknown }).text === "string"
      ) {
        merged += (part as { text: string }).text
      }
    }
    return merged
  }

  return ""
}

/**
 * 基于最终规划结果生成“给用户看的总结文案”。
 *
 * 它与路线规划本身解耦：
 * - finalPlan 是否成功，和 summary 是否成功分开判断
 * - 即使 summary 失败，也不应影响 finalPlan 的交付与 history 归档
 */
async function* streamPlanSummaryText(
  finalPlan: ITravelPlan,
  intent?: unknown,
  issues?: Array<{ code?: string; message?: string }>,
): AsyncGenerator<string> {
  const payload = {
    finalPlan,
    intent: intent ?? null,
    issues: issues ?? [],
  }

  const prompt = `${SUMMARY_MARKDOWN_SYSTEM_PROMPT}\n\n输入数据：\n${JSON.stringify(payload)}`
  const stream = await summaryLlm.stream(prompt)

  for await (const chunk of stream) {
    const delta = extractTextFromChunk(chunk)
    if (delta) {
      yield delta
    }
  }
}

/**
 * 非流式生成入口。
 *
 * 这条链路适合“一次拿最终结果”的场景：
 * - 仍然会维护 history 和 conversationRecords
 * - 但不会像 SSE 接口那样逐步推送中间节点
 */
export async function createTravelPlan(
  userInput: string,
  sessionId?: string,
  debug = false,
): Promise<CreatePlanServiceResult> {
  const resolvedSessionId = resolveSessionId(sessionId)
  const userRecord = createConversationRecord(
    HISTORY_MESSAGE_ROLE.User,
    HISTORY_MESSAGE_KIND.UserInput,
    userInput,
  )

  // 非流式接口与流式接口共享同一套历史事实源：
  // 先确保主记录存在，再把本轮用户输入作为消息明细落库。
  await historyRepository.ensureHistory(resolvedSessionId)
  await historyRepository.appendMessage(resolvedSessionId, userRecord)

  const state = (await travelPlannerGraph.invoke(
    {
      userInput,
      // 这里显式注入本轮 user record，使 Graph 在恢复历史 thread 后，
      // 仍能立刻拿到“这次新输入”对应的最新语境。
      conversationRecords: [userRecord],
    },
    buildGraphConfig(resolvedSessionId),
  )) as GraphInvokeResult

  const errors = normalizeErrors(state)
  const needUserInput = hasNeedUserInput(state, errors)

  const clarificationPrompt = state.clarification?.prompt?.trim()
  if (needUserInput && clarificationPrompt) {
    // 非流式接口没有 clarification_required SSE 事件，
    // 因此这里直接把追问写入 history，保证详情页仍能回放完整上下文。
    await historyRepository.appendMessage(
      resolvedSessionId,
      createConversationRecord(
        HISTORY_MESSAGE_ROLE.Assistant,
        HISTORY_MESSAGE_KIND.Clarification,
        clarificationPrompt,
      ),
    )
  }

  await persistHistoryState(resolvedSessionId, state, "")

  return {
    finalPlan: state.finalPlan ?? null,
    sessionId: resolvedSessionId,
    errors,
    needUserInput,
    missingFields: state.missingFields,
    clarification: state.clarification ?? null,
    collectedIntent: state.collectedIntent,
    planSummary: "",
    debugState: debug ? state : undefined,
  }
}

/**
 * 将 Graph 的执行过程转换为可消费的流式事件。
 *
 * 说明：
 * - 这里使用 `graph.stream(..., { streamMode: "values" })`，逐步拿到当前 state 快照
 * - 每次 state 更新都产出一个 `state` 事件，便于前端展示阶段进度
 * - 最后产出一个 `done` 事件，包含最终 finalPlan/errors
 *
 * 附加职责：
 * - 在事件流推进过程中同步维护 history
 * - 把最近语境写入 conversationRecords，增强续聊能力
 * - 做“前端可消费事件”与“后端可归档状态”之间的时序协调
 */
export async function* streamTravelChat(
  userInput: string,
  sessionId?: string,
  debug = false,
): AsyncGenerator<AgentStreamEvent> {
  const resolvedSessionId = resolveSessionId(sessionId)
  const userRecord = createConversationRecord(
    HISTORY_MESSAGE_ROLE.User,
    HISTORY_MESSAGE_KIND.UserInput,
    userInput,
  )
  let currentStage: AgentStage | null = null

  function createStageEvent(
    stage: AgentStage,
    status: "start" | "progress" | "end",
    reason: string,
  ): AgentStreamEvent {
    return {
      event: "stage",
      data: {
        stage,
        status,
        at: Date.now(),
        reason,
      },
    }
  }

  function* emitStageIfChanged(stage: AgentStage, reason: string): Generator<AgentStreamEvent> {
    if (currentStage === stage) {
      return
    }
    currentStage = stage
    yield createStageEvent(stage, AGENT_STAGE_STATUS.Start, reason)
  }

  // 流式接口也遵循“先建主记录，再落第一条用户消息”的顺序，
  // 这样即使 Graph 中途异常，history 里也至少能看到本轮输入。
  await historyRepository.ensureHistory(resolvedSessionId)
  await historyRepository.appendMessage(resolvedSessionId, userRecord)

  yield {
    event: "start",
    data: {
      message: "stream started",
      sessionId: resolvedSessionId,
      startedAt: Date.now(),
    },
  }
  yield* emitStageIfChanged(AGENT_STAGE.IntentCollecting, "stream_started")

  const aggregatedState: GraphInvokeResult = {
    // 预先把本轮用户消息塞进聚合态，避免 Graph 尚未返回任何 chunk 前，
    // conversationRecords 为空，导致续聊语境丢失。
    conversationRecords: [userRecord],
  }
  let hasEmittedPlanReady = false
  let hasEmittedClarification = false
  let persistedClarificationPrompt: string | null = null
  let planSummary = ""

  try {
    const stream = (await travelPlannerGraph.stream(
      {
        userInput,
        conversationRecords: [userRecord],
      },
      buildGraphConfig(resolvedSessionId),
    )) as AsyncIterable<Record<string, unknown>>

    for await (const chunk of stream) {
      const updatedNodes = Object.keys(chunk)

      // 这里把 Graph 的原始增量更新合并成 service 可消费的聚合态。
      mergeStateChunk(aggregatedState, chunk)

      if (
        updatedNodes.includes("ask_clarification") &&
        !hasEmittedClarification &&
        aggregatedState.needUserInput
      ) {
        yield* emitStageIfChanged(AGENT_STAGE.Clarification, "ask_clarification_node")
        hasEmittedClarification = true

        const clarificationPrompt = aggregatedState.clarification?.prompt?.trim() ?? ""
        if (clarificationPrompt && persistedClarificationPrompt !== clarificationPrompt) {
          persistedClarificationPrompt = clarificationPrompt
          // 同一轮流里 ask_clarification 节点理论上可能被多次看到，
          // 这里做去重，避免把同一条追问重复写进 history。
          await historyRepository.appendMessage(
            resolvedSessionId,
            createConversationRecord(
              HISTORY_MESSAGE_ROLE.Assistant,
              HISTORY_MESSAGE_KIND.Clarification,
              clarificationPrompt,
            ),
          )
        }

        yield {
          event: "clarification_required",
          data: {
            clarification: aggregatedState.clarification ?? null,
            missingFields: aggregatedState.missingFields ?? [],
            collectedIntent: aggregatedState.collectedIntent ?? null,
            emittedAt: Date.now(),
          },
        }
      }

      const touchedValidator = updatedNodes.includes("validator")
      if (
        touchedValidator &&
        !hasEmittedPlanReady &&
        aggregatedState.finalPlan
      ) {
        hasEmittedPlanReady = true
        // plan_ready 比 done 更早，用于让前端右侧规划面板提前可渲染。
        yield {
          event: "plan_ready",
          data: {
            finalPlan: aggregatedState.finalPlan,
            emittedAt: Date.now(),
          },
        }
      }

      const hasPlanningNodeUpdated = updatedNodes.some((node) => PLANNING_STAGE_NODE_SET.has(node))
      if (hasPlanningNodeUpdated) {
        yield* emitStageIfChanged(AGENT_STAGE.Planning, "planning_node_updated")
      }

      yield {
        event: "state",
        data: {
          updatedNodes,
          ...(debug ? { chunk } : {}),
        },
      }
    }

    const finalState = aggregatedState
    const errors = normalizeErrors(finalState)
    const needUserInput = hasNeedUserInput(finalState, errors)

    if (finalState.finalPlan) {
      yield* emitStageIfChanged(AGENT_STAGE.Summarizing, "summary_started")
      yield {
        event: "summary_start",
        data: { startedAt: Date.now() },
      }

      try {
        for await (const delta of streamPlanSummaryText(
          finalState.finalPlan,
          finalState.intent,
          finalState.issues,
        )) {
          planSummary += delta
          yield {
            event: "summary_delta",
            data: { delta },
          }
        }

        if (planSummary.trim()) {
          // 摘要只以“完整一条 assistant 消息”落库，
          // 不逐 delta 落库，避免历史详情里出现碎片化消息。
          await historyRepository.appendMessage(
            resolvedSessionId,
            createConversationRecord(
              HISTORY_MESSAGE_ROLE.Assistant,
              HISTORY_MESSAGE_KIND.Summary,
              planSummary,
            ),
          )
        }

        yield {
          event: "summary_done",
          data: {
            planSummary,
            finishedAt: Date.now(),
          },
        }
      } catch (error) {
        yield {
          event: "summary_done",
          data: {
            planSummary,
            error: (error as Error).message || "summary stream failed",
            finishedAt: Date.now(),
          },
        }
      }
    }

    // 过程流全部结束后，再统一把主表摘要态落盘。
    // 到这里 finalPlan / summary / clarification / errors 都已经收敛完成。
    await persistHistoryState(resolvedSessionId, finalState, planSummary)

    // done 前补发一次阶段结束语义，便于前端/埋点明确本轮的收敛结果。
    const doneStage = needUserInput
      ? AGENT_STAGE.Clarification
      : (errors.length > 0 ? AGENT_STAGE.Failed : AGENT_STAGE.Completed)
    currentStage = doneStage
    yield createStageEvent(doneStage, AGENT_STAGE_STATUS.End, "stream_done")

    yield {
      event: "done",
      data: {
        sessionId: resolvedSessionId,
        finalPlan: finalState.finalPlan ?? null,
        planSummary,
        errors,
        needUserInput,
        missingFields: finalState.missingFields ?? [],
        clarification: finalState.clarification ?? null,
        collectedIntent: finalState.collectedIntent ?? null,
        finishedAt: Date.now(),
        ...(debug ? { state: finalState } : {}),
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    // 异常同样要进入消息历史，这样详情页可以完整解释本轮失败原因。
    await historyRepository.appendMessage(
      resolvedSessionId,
      createConversationRecord(
        HISTORY_MESSAGE_ROLE.Error,
        HISTORY_MESSAGE_KIND.Error,
        message,
      ),
    )

    await historyRepository.upsertHistoryState(resolvedSessionId, {
      status: HISTORY_STATUS.Failed,
      title: "",
      destination: "",
      travelDays: 0,
      travelType: "",
      latestSummary: planSummary,
      finalPlan: aggregatedState.finalPlan ?? null,
      collectedIntent: aggregatedState.collectedIntent ?? null,
      clarification: aggregatedState.clarification ?? null,
      conversationSnapshot: await historyRepository.getConversationSnapshot(resolvedSessionId),
      errors: [message],
    })

    // 继续向上抛，让 controller 按 SSE error 语义对外输出；
    // service 这里的职责是先把历史与状态归档完整。
    throw error
  }
}
