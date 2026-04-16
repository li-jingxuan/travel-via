import type { ApiResponse } from "@repo/shared-types/api"
import type { ITravelPlan } from "@repo/shared-types/travel"

export interface CreatePlanRequest {
  userInput: string
  debug?: boolean
}

export interface CreatePlanResponseData {
  finalPlan: ITravelPlan | null
  errors: string[]
  needUserInput: boolean
  planSummary: string
  debugState?: unknown
}

export type CreatePlanResponse = ApiResponse<CreatePlanResponseData>

export interface CreateChatStreamRequest {
  userInput: string
  debug?: boolean
}

export type AgentStreamEventName =
  | "start"
  | "state"
  | "plan_ready"
  | "summary_start"
  | "summary_delta"
  | "summary_done"
  | "done"
  | "error"
  | "heartbeat"

export interface AgentStreamEvent {
  event: AgentStreamEventName
  data: Record<string, unknown>
}
