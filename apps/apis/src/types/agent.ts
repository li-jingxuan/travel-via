import type { ApiResponse } from "@repo/shared-types/api"
import type { ITravelPlan } from "@repo/shared-types/travel"

export interface TravelClarificationResponse {
  prompt: string
  missingFields: string[]
  examples?: string[]
}

export interface CreatePlanRequest {
  userInput: string
  sessionId?: string
  debug?: boolean
}

export interface CreatePlanResponseData {
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

export type CreatePlanResponse = ApiResponse<CreatePlanResponseData>

export interface CreateChatStreamRequest {
  userInput: string
  sessionId?: string
  debug?: boolean
}

export type AgentStreamEventName =
  | "start"
  | "state"
  | "clarification_required"
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
