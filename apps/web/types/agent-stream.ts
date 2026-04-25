import type { RawFinalPlan } from "./travel-plan";

export type AgentStreamEventName =
  | "start"
  | "heartbeat"
  | "state"
  | "clarification_required"
  | "plan_ready"
  | "summary_start"
  | "summary_delta"
  | "summary_done"
  | "done"
  | "error";

export interface TravelClarification {
  /** agents 层生成的自然语言追问，前端会作为 AI 消息展示 */
  prompt: string;
  /** 当前仍缺失的结构化字段，便于后续做表单化补充 */
  missingFields: string[];
  /** 可作为快捷输入按钮展示的示例答案 */
  examples?: string[];
}

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
  clarification_required: {
    /** 缺少必要信息时的追问内容；为空时前端仍可用 missingFields 做兜底 */
    clarification: TravelClarification | null;
    missingFields: string[];
    collectedIntent: unknown | null;
    emittedAt: number;
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
    missingFields?: string[];
    clarification?: TravelClarification | null;
    collectedIntent?: unknown;
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
