import { travelPlannerGraph } from "@repo/agents/src/index.js"
import type { ITravelPlan } from "@repo/shared-types/travel"
import type { AgentStreamEvent } from "../types/agent.js"

interface GraphInvokeResult {
  finalPlan?: ITravelPlan | null
  errors?: string[]
}

export interface CreatePlanServiceResult {
  finalPlan: ITravelPlan | null
  errors: string[]
  needUserInput: boolean
  debugState?: unknown
}

export async function createTravelPlan(
  userInput: string,
  debug = false,
): Promise<CreatePlanServiceResult> {
  const state = (await travelPlannerGraph.invoke({
    userInput,
  })) as GraphInvokeResult

  const errors = Array.isArray(state.errors) ? state.errors : []
  const needUserInput = errors.some((item) =>
    item.startsWith("NEED_USER_INPUT:"),
  )

  return {
    finalPlan: state.finalPlan ?? null,
    errors,
    needUserInput,
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

  for await (const chunk of stream) {
    const updatedNodes = Object.keys(chunk)

    // chunk 形态为 { nodeName: partialState }，这里将每个 partialState 合并到聚合对象中，
    // 方便在 stream 结束时拿到 finalPlan/errors 等最终结果，而无需再次 invoke。
    for (const nodeUpdate of Object.values(chunk)) {
      if (nodeUpdate && typeof nodeUpdate === "object") {
        Object.assign(aggregatedState, nodeUpdate)
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
  const errors = Array.isArray(finalState.errors) ? finalState.errors : []
  const needUserInput = errors.some((item) => item.startsWith("NEED_USER_INPUT:"))

  yield {
    event: "done",
    data: {
      finalPlan: finalState.finalPlan ?? null,
      errors,
      needUserInput,
      finishedAt: Date.now(),
      ...(debug ? { state: finalState } : {}),
    },
  }
}
