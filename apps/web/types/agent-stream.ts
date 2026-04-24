import type { RawFinalPlan } from "./travel-plan";

export type AgentStreamEventName =
  | "start"
  | "heartbeat"
  | "state"
  | "plan_ready"
  | "summary_start"
  | "summary_delta"
  | "summary_done"
  | "done"
  | "error";

export interface AgentStreamEventMap {
  start: {
    message: string;
    sessionId?: string;
    startedAt: number;
  };
  heartbeat: {
    ts: number;
  };
  state: {
    updatedNodes: string[];
    chunk?: unknown;
  };
  plan_ready: {
    finalPlan: RawFinalPlan;
    emittedAt: number;
  };
  summary_start: {
    startedAt: number;
  };
  summary_delta: {
    delta: string;
  };
  summary_done: {
    planSummary: string;
    error?: string;
    finishedAt: number;
  };
  done: {
    sessionId?: string;
    finalPlan: RawFinalPlan | null;
    planSummary: string;
    errors: string[];
    needUserInput: boolean;
    finishedAt: number;
    state?: unknown;
  };
  error: {
    message: string;
  };
}

export type AgentStreamEvent = {
  [K in AgentStreamEventName]: {
    id?: string;
    event: K;
    data: AgentStreamEventMap[K];
  };
}[AgentStreamEventName];
