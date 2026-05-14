"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { TravelChatPanel } from "../components/TravelChatPanel";
import { TravelPlannerPanel } from "../components/TravelPlannerPanel";
import { useChatStream } from "../hooks/useChatStream";

const QUERY_KEY = { SessionId: "sid", } as const;

const DEFAULT_QUICK_PROMPTS = [
  "推荐美食",
  "必备物品",
  "天气如何",
  "入住建议",
] as const;

const HomePageClient: React.FC = () => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialSessionId = searchParams.get(QUERY_KEY.SessionId)?.trim() || undefined;

  // 输入框只维护当前草稿文本，消息与行程状态由 useChatStream 托管。
  const [inputValue, setInputValue] = useState("");
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  const {
    messages,
    progressNodes,
    plan,
    routePanelPhase,
    needUserInput,
    clarification,
    loading,
    sendMessage,
  } = useChatStream({
    initialSessionId,
    onSessionIdChange: (nextSessionId) => {
      if (!nextSessionId) return;

      // 将会话 ID 同步到地址栏，保证刷新后仍可延续同一会话上下文。
      const nextParams = new URLSearchParams(searchParams.toString());
      if (nextParams.get(QUERY_KEY.SessionId) === nextSessionId) return;
      nextParams.set(QUERY_KEY.SessionId, nextSessionId);
      router.replace(`${pathname}?${nextParams.toString()}`);
    },
  });

  // 新消息发送/接收后将滚动区域保持在底部，避免用户手动追踪。
  useEffect(() => {
    const node = chatScrollRef.current;
    if (!node) return;
    requestAnimationFrame(() => {
      node.scrollTop = node.scrollHeight;
    });
  }, [messages, progressNodes, needUserInput]);

  const promptSuggestions = useMemo(() => {
    if (needUserInput && clarification?.examples?.length) {
      return clarification.examples;
    }
    return [...DEFAULT_QUICK_PROMPTS];
  }, [clarification?.examples, needUserInput]);

  const handleSubmit = useCallback(async () => {
    const value = inputValue.trim();
    if (!value) return;

    // 先清空输入框再发送，提升交互响应感。
    setInputValue("");
    await sendMessage(value);
  }, [inputValue, sendMessage]);

  const handleSubmitVoid = useCallback(() => {
    // 将异步提交包装为稳定回调，避免子组件每次接收到新函数引用。
    void handleSubmit();
  }, [handleSubmit]);

  return (
    <>
      <TravelChatPanel
        chatScrollRef={chatScrollRef}
        messages={messages}
        progressNodes={progressNodes}
        promptSuggestions={promptSuggestions}
        inputValue={inputValue}
        loading={loading}
        onInputChange={setInputValue}
        onSuggestionClick={setInputValue}
        onSubmit={handleSubmitVoid}
      />

      <TravelPlannerPanel
        routePanelPhase={routePanelPhase}
        plan={plan}
      />
    </>
  );
};

export default HomePageClient;
