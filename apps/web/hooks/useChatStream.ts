"use client";

import { useMemo, useRef, useState } from "react";
import { requestStream, type ParsedSseEvent } from "../lib/request";
import { normalizeFinalPlanData } from "../lib/travel-plan/normalize-final-plan";
import type { AgentStreamEvent, AgentStreamEventMap, AgentStreamEventName } from "../types/agent-stream";
import type { TravelPlanViewModel } from "../types/travel-plan";
import { useRequest } from "./useRequest";

interface ChatMessage {
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

interface UseChatStreamOptions {
  initialSessionId?: string;
  onSessionIdChange?: (sessionId: string) => void;
}

const NODE_LABEL_MAP: Record<string, string> = {
  intent_agent: "正在理解你的需求",
  ask_clarification: "正在生成补充问题",
  route_planner: "正在规划路线",
  route_planner_failed: "路线规划失败，正在结束本次尝试",
  route_enrich_entry: "正在准备补全路线信息",
  driving_distance: "正在计算驾车距离与时长",
  poi_enricher: "正在补全景点信息",
  hotel_enricher: "正在补全酒店建议",
  pre_formatter_guard: "正在检查数据完整性",
  formatter: "正在整理行程结果",
  validator: "正在校验最终方案",
};

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatNow(): string {
  return new Date().toTimeString().slice(0, 5);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function mapUpdatedNodesToLabels(updatedNodes: string[] | undefined): string[] {
  if (!updatedNodes?.length) return [];

  const mapped = updatedNodes.map((node) => NODE_LABEL_MAP[node] ?? node);
  return Array.from(new Set(mapped));
}

function toAgentEvent(raw: ParsedSseEvent): AgentStreamEvent | null {
  const eventName = raw.event as AgentStreamEventName;
  const supportedEvents: AgentStreamEventName[] = [
    "start",
    "heartbeat",
    "state",
    "plan_ready",
    "summary_start",
    "summary_delta",
    "summary_done",
    "done",
    "error",
  ];

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
    {
      id: createId("assistant"),
      role: "assistant",
      content: "告诉我你的出发地、目的地和出行方式，我会实时规划您的旅行路线。",
      time: formatNow(),
    },
  ]);
  const [progressNodes, setProgressNodes] = useState<string[]>([]);
  const [plan, setPlan] = useState<TravelPlanViewModel | null>(null);
  const [needUserInput, setNeedUserInput] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>(options.initialSessionId);

  const activeAssistantIdRef = useRef<string | null>(null);

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
    },
    onEvent: (event) => {
      if (event.event === "start" && event.data.sessionId) {
        // 以服务端返回为准，避免前后端 session 认知不一致。
        setSessionId(event.data.sessionId);
        options.onSessionIdChange?.(event.data.sessionId);
        return;
      }

      // state 事件只用于显示当前工作节点，不写入聊天消息。
      if (event.event === "state") {
        setProgressNodes(mapUpdatedNodesToLabels(event.data.updatedNodes));
        return;
      }

      if (event.event === "plan_ready" && event.data.finalPlan) {
        // 先行渲染路线，用户能更早看到结构化结果。
        setPlan(normalizeFinalPlanData(event.data.finalPlan));
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

  return {
    messages,
    progressNodes,
    plan,
    needUserInput,
    loading: streamRequest.loading,
    error: streamRequest.error,
    statusLabel,
    sessionId,
    sendMessage,
    stop: streamRequest.cancel,
  };
}
