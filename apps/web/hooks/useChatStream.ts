"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_TRAVEL_ASSISTANT_GREETING,
  HISTORY_STATUS,
  type HistoryDetail,
} from "@repo/shared-types/history";
import { requestStream, type ParsedSseEvent } from "../lib/request";
import { fetchHistoryDetail } from "../lib/history";
import { normalizeFinalPlanData } from "../lib/travel-plan/normalize-final-plan";
import { AGENT_STAGE } from "../types/agent-stream";
import type {
  AgentStage,
  AgentStreamEvent,
  AgentStreamEventMap,
  AgentStreamEventName,
  TravelClarification,
} from "../types/agent-stream";
import type { TravelPlanViewModel } from "../types/travel-plan";
import { useRequest } from "./useRequest";

export interface ChatMessage {
  id: string;
  role: "assistant" | "user" | "system" | "error";
  content: string;
  time: string;
  streaming?: boolean;
}

interface StreamParams {
  userInput: string;
  sessionId?: string;
}

export const ROUTE_PANEL_PHASE = {
  Empty: "empty",
  Skeleton: "skeleton",
  Plan: "plan",
} as const;

export type RoutePanelPhaseType = typeof ROUTE_PANEL_PHASE[keyof typeof ROUTE_PANEL_PHASE];

interface UseChatStreamOptions {
  initialSessionId?: string;
  onSessionIdChange?: (sessionId: string) => void;
}

const NODE_LABEL_MAP: Record<string, string> = {
  intent_agent: "正在理解你的需求",
  merge_collected_intent: "正在整理已补充的信息",
  ask_clarification: "正在生成补充问题",
  route_planner: "正在规划路线",
  route_planner_failed: "路线规划失败，正在结束本次尝试",
  route_enrich_entry: "正在准备补全路线信息",
  driving_distance: "正在计算驾车距离与时长",
  poi_enricher: "正在补全景点信息",
  hotel_enricher: "正在补全酒店建议",
  pre_formatter_guard: "正在检查数据完整性",
  formatter: "正在整理行程结果",
  validator: "正在完成最后整理",
  prepare_planner_intent: '正在整理已补充的信息',
};

const PLAN_READY_LABEL = "路径规划完成";
const supportedEvents: AgentStreamEventName[] = [
  "start",
  "heartbeat",
  "stage",
  "state",
  "clarification_required",
  "plan_ready",
  "summary_start",
  "summary_delta",
  "summary_done",
  "done",
  "error",
];

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createDefaultAssistantMessage(): ChatMessage {
  return {
    id: createId("assistant"),
    role: "assistant",
    content: DEFAULT_TRAVEL_ASSISTANT_GREETING,
    time: formatNow(),
  };
}

function formatNow(): string {
  return new Date().toTimeString().slice(0, 5);
}

function formatHistoryTime(value: number | string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return formatNow();
  }

  return date.toTimeString().slice(0, 5);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function mapUpdatedNodesToLabels(updatedNodes: string[] | undefined): string[] {
  if (!updatedNodes?.length) return [];

  const mapped = updatedNodes.map((node) => NODE_LABEL_MAP[node] ?? node);
  return Array.from(new Set(mapped));
}

function mapHistoryDetailToMessages(detail: HistoryDetail): ChatMessage[] {
  if (!detail.messages.length) {
    return [createDefaultAssistantMessage()];
  }

  return detail.messages.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    time: formatHistoryTime(message.createdAt),
  }));
}

function toAgentEvent(raw: ParsedSseEvent): AgentStreamEvent | null {
  const eventName = raw.event as AgentStreamEventName;

  // 忽略后端新增但前端暂未消费的事件，保证向前兼容。
  if (!supportedEvents.includes(eventName)) {
    return null;
  }

  if (!isObject(raw.data)) {
    return null;
  }

  // 这里做一次轻量 runtime 校验，避免异常帧污染 UI 状态。
  return {
    id: raw.id,
    event: eventName,
    data: raw.data as AgentStreamEventMap[typeof eventName],
  } as AgentStreamEvent;
}

// 业务层 Hook：将流式事件映射为“消息列表 + 行程 + 进度”三类状态。
export function useChatStream(options: UseChatStreamOptions = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    createDefaultAssistantMessage(),
  ]);
  const [progressNodes, setProgressNodes] = useState<string[]>([]);
  const [plan, setPlan] = useState<TravelPlanViewModel | null>(null);
  const [needUserInput, setNeedUserInput] = useState(false);
  // 记录后端当前阶段语义，右侧面板状态切换优先依据该字段。
  const [streamStage, setStreamStage] = useState<AgentStage | null>(null);
  // 保存当前追问信息，用于页面展示快捷示例；prompt 本身会进入聊天消息流。
  const [clarification, setClarification] = useState<TravelClarification | null>(null);
  const [sessionId, setSessionId] = useState<string | undefined>(options.initialSessionId);

  const activeAssistantIdRef = useRef<string | null>(null);
  // SSE 的 clarification_required 和 done 都可能携带 prompt，用 ref 避免重复插入同一条追问。
  const lastClarificationPromptRef = useRef<string | null>(null);
  const hydratedSessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!options.initialSessionId) {
      hydratedSessionIdRef.current = null;
      return;
    }

    if (hydratedSessionIdRef.current === options.initialSessionId) {
      return;
    }

    hydratedSessionIdRef.current = options.initialSessionId;
    let cancelled = false;

    void fetchHistoryDetail(options.initialSessionId)
      .then((detail) => {
        if (cancelled) return;
        setMessages(mapHistoryDetailToMessages(detail));
        setPlan(detail.finalPlan ? normalizeFinalPlanData(detail.finalPlan) : null);
        setProgressNodes([]);
        setNeedUserInput(detail.status === HISTORY_STATUS.NeedsInput);
        setStreamStage(null);
        setClarification(null);
      })
      .catch(() => {
        if (cancelled) return;
        // 若历史详情不存在或拉取失败，则退回默认欢迎语，不阻塞用户继续新建会话。
        setMessages([createDefaultAssistantMessage()]);
        setPlan(null);
        setNeedUserInput(false);
      });

    return () => {
      cancelled = true;
    };
  }, [options.initialSessionId]);

  const streamRequest = useRequest<void, StreamParams, AgentStreamEvent>({
    mode: "stream",
    request: async (params, context) => {
      // 这里固定走 stream 接口，保持与后端 /chat/stream 协议一致。
      await requestStream("/api/agent/chat/stream", {
        method: "POST",
        body: {
          userInput: params.userInput,
          sessionId: params.sessionId,
          debug: false,
        },
        signal: context.signal,
        onEvent: (rawEvent) => {
          const parsed = toAgentEvent(rawEvent);
          if (parsed) {
            // 将网络层事件交给 useRequest，再由 onEvent 统一消费。
            context.emit(parsed);
          }
        },
      });
    },
    onStart: () => {
      // 每次新问题开始时重置“过程态”，但保留历史消息与当前 plan。
      setProgressNodes([]);
      setNeedUserInput(false);
      setStreamStage(null);
      setClarification(null);
      lastClarificationPromptRef.current = null;
    },
    onEvent: (event) => {
      if (event.event === "start" && event.data.sessionId) {
        // 以服务端返回为准，避免前后端 session 认知不一致。
        setSessionId(event.data.sessionId);
        options.onSessionIdChange?.(event.data.sessionId);
        return;
      }

      if (event.event === "stage") {
        // 统一使用后端 stage 事件驱动业务阶段，避免前端反推节点语义。
        setStreamStage(event.data.stage);
        return;
      }

      // state 事件只用于显示当前工作节点，不写入聊天消息。
      if (event.event === "state") {
        setProgressNodes(mapUpdatedNodesToLabels(event.data.updatedNodes));
        return;
      }

      if (event.event === "clarification_required") {
        const nextClarification = event.data.clarification;

        setNeedUserInput(true);
        setClarification(nextClarification);

        // 追问是对话内容的一部分，直接追加为 AI 消息，比放在临时提示条里更容易追溯上下文。
        const prompt = nextClarification?.prompt?.trim();
        if (prompt && lastClarificationPromptRef.current !== prompt) {
          lastClarificationPromptRef.current = prompt;
          setMessages((prev) => [
            ...prev,
            {
              id: createId("assistant"),
              role: "assistant",
              content: prompt,
              time: formatNow(),
            },
          ]);
        }

        return;
      }

      if (event.event === "plan_ready" && event.data.finalPlan) {
        // 先行渲染路线，用户能更早看到结构化结果。
        setPlan(normalizeFinalPlanData(event.data.finalPlan));
        // validator 是内部校验节点；用户侧在计划可渲染时展示明确的完成态。
        setProgressNodes([PLAN_READY_LABEL]);
        return;
      }

      if (event.event === "summary_start") {
        // 为本次回答创建独立气泡，后续 delta 只写入这一条。
        const nextId = createId("assistant");
        activeAssistantIdRef.current = nextId;
        setMessages((prev) => [
          ...prev,
          {
            id: nextId,
            role: "assistant",
            content: "",
            time: formatNow(),
            streaming: true,
          },
        ]);
        return;
      }

      if (event.event === "summary_delta") {
        const currentId = activeAssistantIdRef.current;
        if (!currentId) return;

        // 增量拼接总结文本，实现“打字机”效果。
        setMessages((prev) =>
          prev.map((item) =>
            item.id === currentId
              ? {
                  ...item,
                  content: `${item.content}${event.data.delta}`,
                }
              : item,
          ),
        );
        return;
      }

      if (event.event === "summary_done") {
        const currentId = activeAssistantIdRef.current;
        if (!currentId) return;

        setMessages((prev) =>
          prev.map((item) =>
            item.id === currentId
              ? {
                  ...item,
                  streaming: false,
                  content: item.content || event.data.planSummary || "本次总结为空。",
                }
              : item,
          ),
        );
        return;
      }

      if (event.event === "done") {
        // done 才是最终态：这里做兜底覆盖，确保数据一致。
        if (event.data.sessionId) {
          setSessionId(event.data.sessionId);
          options.onSessionIdChange?.(event.data.sessionId);
        }
        setNeedUserInput(Boolean(event.data.needUserInput));
        setClarification(event.data.clarification ?? null);

        // 流结束时再兜底一次完成态，覆盖未收到 plan_ready 但最终成功的场景。
        if (!event.data.needUserInput && !event.data.errors?.length && event.data.finalPlan) {
          setProgressNodes([PLAN_READY_LABEL]);
        }

        // done 事件保留一层兜底：如果前面的 clarification_required 丢失，仍能展示追问。
        if (event.data.clarification?.prompt && !event.data.errors?.length) {
          const prompt = event.data.clarification.prompt.trim();
          if (prompt && lastClarificationPromptRef.current !== prompt) {
            lastClarificationPromptRef.current = prompt;
            setMessages((prev) => [
              ...prev,
              {
                id: createId("assistant"),
                role: "assistant",
                content: prompt,
                time: formatNow(),
              },
            ]);
          }
        }

        // TODO 异常信息输出就可以了，不要在 UI 里暴露过多技术细节。
        if (event.data.errors?.length) {
          setMessages((prev) => [
            ...prev,
            {
              id: createId("error"),
              role: "error",
              content: event.data.errors.join("；"),
              time: formatNow(),
            },
          ]);
        }

        return;
      }

      if (event.event === "error") {
        // error 事件是服务端主动推送的失败信息（与 onError 不同来源）。
        setMessages((prev) => [
          ...prev,
          {
            id: createId("error"),
            role: "error",
            content: event.data.message || "流式请求失败",
            time: formatNow(),
          },
        ]);
      }
    },
    onError: (error) => {
      // onError 主要覆盖网络失败/解析异常等“链路级”错误。
      setMessages((prev) => [
        ...prev,
        {
          id: createId("error"),
          role: "error",
          content: error.message,
          time: formatNow(),
        },
      ]);
    },
  });

  const sendMessage = async (userInput: string) => {
    const trimmed = userInput.trim();
    if (!trimmed) return;

    setMessages((prev) => [
      ...prev,
      {
        id: createId("user"),
        role: "user",
        content: trimmed,
        time: formatNow(),
      },
    ]);

    // 真正发起流式请求。
    await streamRequest.run({ userInput: trimmed, sessionId });
  };

  // 顶部状态文案聚合，避免页面层写重复判断逻辑。
  const statusLabel = useMemo(() => {
    if (streamRequest.loading) return "生成中";
    if (streamRequest.error) return "出错";
    return "就绪";
  }, [streamRequest.error, streamRequest.loading]);

  // 右侧路线面板展示态：
  // - plan: 已有可渲染计划
  // - skeleton: 已进入 route_planner 及后续阶段，且仍在生成中
  // - empty: 其余情况（包括需求理解/追问阶段）
  const routePanelPhase = useMemo<RoutePanelPhaseType>(() => {
    if (plan) return ROUTE_PANEL_PHASE.Plan;
    if (
      streamRequest.loading
      && !needUserInput
      && streamStage === AGENT_STAGE.Planning
    ) {
      return ROUTE_PANEL_PHASE.Skeleton;
    }
    return ROUTE_PANEL_PHASE.Empty;
  }, [needUserInput, plan, streamRequest.loading, streamStage]);

  return {
    messages,
    progressNodes,
    plan,
    routePanelPhase,
    needUserInput,
    clarification,
    loading: streamRequest.loading,
    error: streamRequest.error,
    statusLabel,
    sessionId,
    sendMessage,
    stop: streamRequest.cancel,
  };
}
