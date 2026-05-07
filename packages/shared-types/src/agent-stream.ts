export const AGENT_STAGE = {
  IntentCollecting: "intent_collecting",
  Clarification: "clarification",
  Planning: "planning",
  Summarizing: "summarizing",
  Completed: "completed",
  Failed: "failed",
} as const

export type AgentStage = typeof AGENT_STAGE[keyof typeof AGENT_STAGE]

export const AGENT_STAGE_STATUS = {
  Start: "start",
  Progress: "progress",
  End: "end",
} as const

export type AgentStageStatus = typeof AGENT_STAGE_STATUS[keyof typeof AGENT_STAGE_STATUS]

export interface AgentStageEventData {
  stage: AgentStage
  status: AgentStageStatus
  at: number
  reason?: string
}

export interface SharedTravelClarification {
  prompt: string
  missingFields: string[]
  examples?: string[]
}

export interface AgentStreamEventMap<
  TPlan = unknown,
  TClarification = SharedTravelClarification | null,
  TCollectedIntent = unknown,
> {
  start: {
    message: string
    sessionId?: string
    startedAt: number
  }
  heartbeat: {
    ts: number
  }
  stage: AgentStageEventData
  state: {
    updatedNodes: string[]
    chunk?: unknown
  }
  clarification_required: {
    clarification: TClarification
    missingFields: string[]
    collectedIntent: TCollectedIntent | null
    emittedAt: number
  }
  plan_ready: {
    finalPlan: TPlan
    emittedAt: number
  }
  summary_start: {
    startedAt: number
  }
  summary_delta: {
    delta: string
  }
  summary_done: {
    planSummary: string
    error?: string
    finishedAt: number
  }
  done: {
    sessionId?: string
    finalPlan: TPlan | null
    planSummary: string
    errors: string[]
    needUserInput: boolean
    missingFields?: string[]
    clarification?: TClarification
    collectedIntent?: TCollectedIntent
    finishedAt: number
    state?: unknown
  }
  error: {
    message: string
  }
}

export type AgentStreamEventName = keyof AgentStreamEventMap

export type AgentStreamEvent<
  TPlan = unknown,
  TClarification = SharedTravelClarification | null,
  TCollectedIntent = unknown,
> = {
  [K in AgentStreamEventName]: {
    id?: string
    event: K
    data: AgentStreamEventMap<TPlan, TClarification, TCollectedIntent>[K]
  }
}[AgentStreamEventName]
