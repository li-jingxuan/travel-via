import { travelPlannerGraph } from "@repo/agents/src/index.js"
import { createDeepSeekReasoner } from "@repo/agents/src/lib/llm.js"
import type { ITravelPlan } from "@repo/shared-types/travel"
import type { AgentStreamEvent } from "../types/agent.js"
import { SUMMARY_MARKDOWN_SYSTEM_PROMPT } from "../prompts/summary.js"

interface GraphInvokeResult {
  finalPlan?: ITravelPlan | null
  intent?: unknown
  issues?: Array<{ code?: string; message?: string }>
  errors?: string[]
}

export interface CreatePlanServiceResult {
  finalPlan: ITravelPlan | null
  errors: string[]
  needUserInput: boolean
  planSummary: string
  debugState?: unknown
}

const summaryLlm = createDeepSeekReasoner({ temperature: 0.4 })

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
  debug = false,
): Promise<CreatePlanServiceResult> {
  const state = (await travelPlannerGraph.invoke({
    userInput,
  })) as GraphInvokeResult

  const errors = normalizeErrors(state)
  const needUserInput = hasNeedUserInput(state, errors)

  return {
    finalPlan: state.finalPlan ?? null,
    errors,
    needUserInput,
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
  debug = false,
): AsyncGenerator<AgentStreamEvent> {
  yield {
    event: "start",
    data: {
      message: "stream started",
      startedAt: Date.now(),
    },
  }

  const stream = (await travelPlannerGraph.stream({
    userInput,
  })) as AsyncIterable<Record<string, unknown>>
  const aggregatedState: GraphInvokeResult = {}
  let hasEmittedPlanReady = false
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

  yield {
    event: "done",
    data: {
      finalPlan: finalState.finalPlan ?? null,
      planSummary,
      errors,
      needUserInput,
      finishedAt: Date.now(),
      ...(debug ? { state: finalState } : {}),
    },
  }
}
