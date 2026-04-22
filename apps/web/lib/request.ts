import { extractSseFrames, parseSseFrame, type ParsedSseEvent } from "./sse-parser";

export class RequestError extends Error {
  status: number;
  code?: string;
  raw?: unknown;

  constructor(message: string, status: number, code?: string, raw?: unknown) {
    super(message);
    this.name = "RequestError";
    this.status = status;
    this.code = code;
    this.raw = raw;
  }
}

export interface RequestOptions extends Omit<RequestInit, "body"> {
  baseURL?: string;
  timeoutMs?: number;
  body?: unknown;
}

export interface StreamRequestOptions extends RequestOptions {
  onEvent: (event: ParsedSseEvent) => void;
}

export type { ParsedSseEvent };

const normalizeBaseURLCandidate = (value: string | undefined) => value?.trim() || undefined;
const DEFAULT_REQUEST_TIMEOUT_MS = 90_000;
const DEFAULT_STREAM_TIMEOUT_MS = 15 * 60 * 1000;

// 默认读取环境变量：NEXT_PUBLIC_API_BASE_URL
function resolveDefaultBaseURL(): string | undefined {
  return normalizeBaseURLCandidate(process.env.NEXT_PUBLIC_API_BASE_URL);
}

// 支持通过环境变量统一拼接 API 前缀，也允许直接传完整 URL。
function withBaseUrl(url: string, baseURL?: string): string {
  const normalizedInputBase = normalizeBaseURLCandidate(baseURL);
  if (!normalizedInputBase) return url;
  if (/^https?:\/\//.test(url)) return url;

  const normalizedBase = normalizedInputBase.endsWith("/")
    ? normalizedInputBase.slice(0, -1)
    : normalizedInputBase;
  const normalizedPath = url.startsWith("/") ? url : `/${url}`;
  return `${normalizedBase}${normalizedPath}`;
}

// 将 body 归一为 fetch 可接受的格式。
// 这里不直接假设 JSON：字符串/FormData/URLSearchParams 都要原样透传。
function normalizeBody(body: unknown): BodyInit | undefined {
  if (body == null) return undefined;
  if (typeof body === "string" || body instanceof FormData || body instanceof URLSearchParams) {
    return body;
  }
  return JSON.stringify(body);
}

// 仅在对象 body 场景自动补 Content-Type，避免误伤 FormData 等请求。
function buildHeaders(headers: HeadersInit | undefined, body: unknown): Headers {
  const built = new Headers(headers);
  const isJsonBody = body != null && !(body instanceof FormData) && !(body instanceof URLSearchParams) && typeof body !== "string";

  if (isJsonBody && !built.has("Content-Type")) {
    built.set("Content-Type", "application/json");
  }

  return built;
}

// 合并外部 signal 与超时控制，任何一方触发都应中断请求。
function mergeSignal(signal?: AbortSignal | null, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS): AbortSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener("abort", () => controller.abort(), { once: true });
    }
  }

  controller.signal.addEventListener(
    "abort",
    () => {
      clearTimeout(timer);
    },
    { once: true },
  );

  return controller.signal;
}

// 尽量保留后端原始错误结构，便于上层展示与排查。
async function parseError(response: Response): Promise<never> {
  let raw: unknown;

  try {
    raw = await response.json();
  } catch {
    raw = await response.text();
  }

  const message =
    typeof raw === "object" && raw && "message" in raw && typeof (raw as { message?: unknown }).message === "string"
      ? (raw as { message: string }).message
      : `Request failed with status ${response.status}`;

  const code =
    typeof raw === "object" && raw && "code" in raw && typeof (raw as { code?: unknown }).code === "string"
      ? (raw as { code: string }).code
      : undefined;

  throw new RequestError(message, response.status, code, raw);
}

// 通用 JSON 请求封装。
export async function request<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const { baseURL, timeoutMs, body, headers, signal, ...rest } = options;
  const resolvedBaseURL = normalizeBaseURLCandidate(baseURL) ?? resolveDefaultBaseURL();

  const response = await fetch(withBaseUrl(url, resolvedBaseURL), {
    ...rest,
    headers: buildHeaders(headers, body),
    body: normalizeBody(body),
    signal: mergeSignal(signal, timeoutMs),
  });

  if (!response.ok) {
    await parseError(response);
  }

  return (await response.json()) as T;
}

// POST + SSE 流式读取：按 \n\n 分帧并逐条派发事件。
// 设计原则：
// 1. 网络层只做“传输 + 协议解析”，不掺业务语义
// 2. 业务 Hook 再按 event 名称映射到 UI 状态
// 3. 保持 onEvent 幂等，允许上层自行做去重/忽略
export async function requestStream(url: string, options: StreamRequestOptions): Promise<void> {
  const { onEvent, baseURL, timeoutMs, body, headers, signal, ...rest } = options;
  const resolvedBaseURL = normalizeBaseURLCandidate(baseURL) ?? resolveDefaultBaseURL();

  const response = await fetch(withBaseUrl(url, resolvedBaseURL), {
    ...rest,
    headers: buildHeaders(headers, body),
    body: normalizeBody(body),
    signal: mergeSignal(signal, timeoutMs ?? DEFAULT_STREAM_TIMEOUT_MS),
  });

  if (!response.ok) {
    await parseError(response);
  }

  if (!response.body) {
    throw new RequestError("Stream body is empty", 500);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  // buffer 存放跨 chunk 的残留文本，直到能组成完整帧。
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");

    // 先批量提取完整帧，再更新 buffer 剩余段，避免重复扫描字符串。
    const extracted = extractSseFrames(buffer);
    buffer = extracted.rest;

    for (const frame of extracted.frames) {
      const parsed = parseSseFrame(frame);
      if (parsed) {
        onEvent(parsed);
      }
    }
  }

  // 流结束后再尝试解析一次尾部，防止最后一帧丢失。
  const lastFrame = buffer.trim();
  if (lastFrame) {
    const parsed = parseSseFrame(lastFrame);
    if (parsed) {
      onEvent(parsed);
    }
  }
}
