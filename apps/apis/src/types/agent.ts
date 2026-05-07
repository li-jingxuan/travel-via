import type { ApiResponse } from "@repo/shared-types/api"
import type { ITravelPlan } from "@repo/shared-types/travel"
import type {
  AgentStreamEvent as SharedAgentStreamEvent,
  AgentStreamEventName as SharedAgentStreamEventName,
  SharedTravelClarification,
} from "@repo/shared-types/agent-stream"

export type TravelClarificationResponse = SharedTravelClarification

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

export type AgentStreamEventName = SharedAgentStreamEventName
export type AgentStreamEvent = SharedAgentStreamEvent<
  ITravelPlan,
  TravelClarificationResponse | null,
  unknown
>
