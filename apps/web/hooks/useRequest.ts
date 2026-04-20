"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface RunnerContext<TEvent> {
  signal: AbortSignal;
  emit: (event: TEvent) => void;
}

interface UseRequestOptions<TData, TParams, TEvent> {
  mode?: "json" | "stream";
  request: (params: TParams, context: RunnerContext<TEvent>) => Promise<TData | void>;
  onStart?: () => void;
  onEvent?: (event: TEvent) => void;
  onSuccess?: (data: TData | undefined) => void;
  onError?: (error: Error) => void;
  onFinally?: () => void;
}

// 通用请求状态机：统一处理 loading/error/取消与事件分发。
// 适用场景：
// - 普通 JSON 请求（一次完成）
// - 流式请求（多次事件 + 最终完成）
export function useRequest<TData, TParams, TEvent = never>(
  options: UseRequestOptions<TData, TParams, TEvent>,
) {
  const optionsRef = useRef(options);
  const abortRef = useRef<AbortController | null>(null);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<TData | undefined>(undefined);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // 通过 ref 持有最新 options，避免 run/cancel 频繁重建。
    optionsRef.current = options;
  }, [options]);

  const cancel = useCallback(() => {
    // 取消当前请求并立即同步 UI 状态，防止“假加载”残留。
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
  }, []);

  const reset = useCallback(() => {
    // reset 用于“重新开始一次会话”，与 cancel（中断当前请求）语义不同。
    setData(undefined);
    setError(null);
    setLoading(false);
  }, []);

  const run = useCallback(
    async (params: TParams): Promise<TData | undefined> => {
      // 新请求开始前先中断旧请求，避免竞态覆盖。
      cancel();
      const controller = new AbortController();
      abortRef.current = controller;

      const currentOptions = optionsRef.current;
      setLoading(true);
      setError(null);
      currentOptions.onStart?.();

      const emit = (event: TEvent) => {
        // 所有流式事件统一从这里透传，方便后续接埋点或调试。
        currentOptions.onEvent?.(event);
      };

      try {
        const result = await currentOptions.request(params, {
          signal: controller.signal,
          emit,
        });

        if (!controller.signal.aborted) {
          const typedResult = result as TData | undefined;
          // stream 模式通常没有最终 data，避免用 undefined 覆盖已有有效值。
          if (typedResult !== undefined || currentOptions.mode !== "stream") {
            setData(typedResult);
          }
          currentOptions.onSuccess?.(typedResult);
          return typedResult;
        }

        return undefined;
      } catch (unknownError) {
        // 主动 abort 不视为业务错误，直接静默退出。
        if (controller.signal.aborted) {
          return undefined;
        }

        const normalizedError =
          unknownError instanceof Error ? unknownError : new Error("Unknown request error");
        setError(normalizedError);
        currentOptions.onError?.(normalizedError);
        return undefined;
      } finally {
        // 只清理当前这一轮 controller，避免误伤新请求。
        if (abortRef.current === controller) {
          abortRef.current = null;
        }

        if (!controller.signal.aborted) {
          setLoading(false);
        }

        currentOptions.onFinally?.();
      }
    },
    [cancel],
  );

  return {
    loading,
    data,
    error,
    run,
    cancel,
    reset,
  };
}
