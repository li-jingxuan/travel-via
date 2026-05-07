import {
  AGENT_STAGE,
  type AgentStage,
  type AgentStageEventData,
  type AgentStreamEvent as SharedAgentStreamEvent,
  type AgentStreamEventMap as SharedAgentStreamEventMap,
  type AgentStreamEventName as SharedAgentStreamEventName,
  type SharedTravelClarification,
} from "@repo/shared-types/agent-stream";
import type { RawFinalPlan } from "./travel-plan";

export { AGENT_STAGE };
export type { AgentStage, AgentStageEventData };
export type AgentStreamEventName = SharedAgentStreamEventName;

export type TravelClarification = SharedTravelClarification;

export type AgentStreamEventMap = SharedAgentStreamEventMap<
  RawFinalPlan,
  TravelClarification | null,
  unknown
>;

export type AgentStreamEvent = SharedAgentStreamEvent<
  RawFinalPlan,
  TravelClarification | null,
  unknown
>;
