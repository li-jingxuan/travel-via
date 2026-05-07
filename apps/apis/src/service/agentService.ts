import { travelPlannerGraph } from "@repo/agents/src/index.js"
import { createDeepSeekReasoner } from "@repo/agents/src/lib/llm.js"
import { AGENT_STAGE, AGENT_STAGE_STATUS, type AgentStage } from "@repo/shared-types/agent-stream"
import type { ITravelPlan } from "@repo/shared-types/travel"
import { randomUUID } from "node:crypto"
import type { AgentStreamEvent, TravelClarificationResponse } from "../types/agent.js"
import { SUMMARY_MARKDOWN_SYSTEM_PROMPT } from "../prompts/summary.js"

interface GraphInvokeResult {
  finalPlan?: ITravelPlan | null
  intent?: unknown
  collectedIntent?: unknown
  missingFields?: string[]
  needUserInput?: boolean
  clarification?: TravelClarificationResponse | null
  issues?: Array<{ code?: string; message?: string }>
  errors?: string[]
}

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

export async function createTravelPlan(
  userInput: string,
  sessionId?: string,
  debug = false,
): Promise<CreatePlanServiceResult> {
  const resolvedSessionId = resolveSessionId(sessionId)

  const state = (await travelPlannerGraph.invoke(
    { userInput },
    buildGraphConfig(resolvedSessionId),
  )) as GraphInvokeResult

  const errors = normalizeErrors(state)
  const needUserInput = hasNeedUserInput(state, errors)

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
 */
export async function* streamTravelChat(
  userInput: string,
  sessionId?: string,
  debug = false,
): AsyncGenerator<AgentStreamEvent> {
  const resolvedSessionId = resolveSessionId(sessionId)
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

  yield {
    event: "start",
    data: {
      message: "stream started",
      sessionId: resolvedSessionId,
      startedAt: Date.now(),
    },
  }
  yield* emitStageIfChanged(AGENT_STAGE.IntentCollecting, "stream_started")

  const stream = (await travelPlannerGraph.stream(
    { userInput },
    buildGraphConfig(resolvedSessionId),
  )) as AsyncIterable<Record<string, unknown>>
  const aggregatedState: GraphInvokeResult = {}
  let hasEmittedPlanReady = false
  let hasEmittedClarification = false
  let planSummary = ""

  for await (const chunk of stream) {
    const updatedNodes = Object.keys(chunk)

    // chunk 形态为 { nodeName: partialState }，这里将每个 partialState 合并到聚合对象中，
    // 方便在 stream 结束时拿到 finalPlan/errors 等最终结果，而无需再次 invoke。
    for (const nodeUpdate of Object.values(chunk)) {
      if (nodeUpdate && typeof nodeUpdate === "object") {
        Object.assign(aggregatedState, nodeUpdate)
      }
    }

    if (
      updatedNodes.includes("ask_clarification") &&
      !hasEmittedClarification &&
      aggregatedState.needUserInput
    ) {
      yield* emitStageIfChanged(AGENT_STAGE.Clarification, "ask_clarification_node")
      hasEmittedClarification = true
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
}
