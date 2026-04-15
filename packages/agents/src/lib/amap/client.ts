import { loadAgentsEnv } from "../env.js"
import { agentLog } from "../logger.js"

// 确保在模块加载阶段就完成 .env 注入，避免运行时 key 缺失。
loadAgentsEnv()

const AMAP_BASE_URL = "https://restapi.amap.com"
const AMAP_TIMEOUT_MS = 8000
// 高德免费配额为每个 path 3次 / 秒
const AMAP_QPS_LIMIT_PER_PATH = 3
// 高德的免费配额是按照接口 path 来限制的，每个 path 独立计算 QPS。
const AMAP_QPS_WINDOW_MS = 1000
// 增加安全缓冲，降低边界抖动导致的偶发 CUQPS 超限（尤其在高并发时更明显）。
const AMAP_QPS_SAFETY_BUFFER_MS = 120
// 平滑发包：限制同 path 相邻请求的最小间隔，避免“1 秒内突发 3 个”。
const AMAP_MIN_SPACING_MS = Math.ceil(
  (AMAP_QPS_WINDOW_MS + AMAP_QPS_SAFETY_BUFFER_MS) / AMAP_QPS_LIMIT_PER_PATH,
)
// 业务态限流时的最多重试次数（总请求次数 = 1 + 重试次数）。
const AMAP_THROTTLE_MAX_RETRIES = 2
const AMAP_THROTTLE_BACKOFF_MS = [300, 800, 1600]

interface PathRateLimiter {
  // 1 秒窗口内的请求时间戳（毫秒）。
  timestamps: number[]
  // 同 path 的串行队列，保证限流判定顺序一致。
  queue: Promise<void>
  // 上一次放行时间戳，用于平滑发包。
  lastGrantedAt: number
}

const pathRateLimiters = new Map<string, PathRateLimiter>()

interface PathRateMetric {
  requests: number
  throttledByBusiness: number
  limiterWaitMs: number
  retries: number
}

const pathRateMetrics = new Map<string, PathRateMetric>()

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}

function buildRequestMeta(path: string, params: Record<string, string>) {
  return { path, params }
}

function getPathMetric(path: string): PathRateMetric {
  const metric = pathRateMetrics.get(path) ?? {
    requests: 0,
    throttledByBusiness: 0,
    limiterWaitMs: 0,
    retries: 0,
  }
  pathRateMetrics.set(path, metric)
  return metric
}

interface AmapBaseResponse {
  status?: string
  info?: string
  infocode?: string
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function toAmapBaseResponse(value: unknown): AmapBaseResponse | null {
  if (!isObjectRecord(value)) return null
  return {
    status: typeof value.status === "string" ? value.status : undefined,
    info: typeof value.info === "string" ? value.info : undefined,
    infocode: typeof value.infocode === "string" ? value.infocode : undefined,
  }
}

function isBusinessRateLimited(payload: AmapBaseResponse | null): boolean {
  if (!payload) return false
  const joined = `${payload.info ?? ""} ${payload.infocode ?? ""}`.toUpperCase()
  return (
    payload.status === "0" &&
    (joined.includes("CUQPS") ||
      joined.includes("QPS") ||
      joined.includes("TOO FREQUENT") ||
      joined.includes("RATE LIMIT") ||
      joined.includes("频率"))
  )
}

function calcThrottleBackoffMs(retryIndex: number): number {
  const base =
    AMAP_THROTTLE_BACKOFF_MS[retryIndex] ??
    AMAP_THROTTLE_BACKOFF_MS[AMAP_THROTTLE_BACKOFF_MS.length - 1] ??
    1600
  const jitter = Math.floor(Math.random() * 120)
  return base + jitter
}

/**
 * 按接口 path 做滑动窗口限流（每个 path 独立 3 req/s）。
 *
 * 实现原理：
 * 1. `timestamps` 记录该 path 最近 1 秒内的放行时间
 * 2. 每次请求先清理“窗口外”的旧时间戳
 * 3. 若窗口内请求数 < 上限，立即放行并写入当前时间戳
 * 4. 若达到上限，则等待到“最早一次请求出窗”后再重试
 *
 * 为什么还要 `queue`：
 * - Node.js 是并发异步执行，如果没有 queue，同一时刻多个请求可能同时判断“未超限”
 *   从而导致超发（竞态条件）
 * - queue 让同一 path 的限流检查串行化，保证每次判断都基于最新状态
 *
 * 示例：
 * - /v5/place/text 与 /v3/geocode/geo 各自独立计数，不互相抢配额
 * - 同一路径超限时进入等待队列，不会直接失败
 */
async function acquirePathRateLimit(path: string) {
  // 获取当前 path 的限流器；若不存在则初始化。
  const limiter = pathRateLimiters.get(path) ?? {
    timestamps: [],
    queue: Promise.resolve(),
    lastGrantedAt: 0,
  }
  pathRateLimiters.set(path, limiter)
  const startedAt = Date.now()

  // 把当前请求挂到该 path 的队列尾部，确保串行执行限流判断。
  const task = limiter.queue.then(async () => {
    while (true) {
      const now = Date.now()
      // 只保留 1 秒窗口内的时间戳（滑动窗口）。
      limiter.timestamps = limiter.timestamps.filter(
        (timestamp) => now - timestamp < AMAP_QPS_WINDOW_MS,
      )

      // 未超限：立即放行，并记录当前放行时间。
      if (limiter.timestamps.length < AMAP_QPS_LIMIT_PER_PATH) {
        const smoothWaitMs = Math.max(
          limiter.lastGrantedAt + AMAP_MIN_SPACING_MS - now,
          0,
        )
        if (smoothWaitMs > 0) {
          await sleep(smoothWaitMs)
        }

        const grantedAt = Date.now()
        limiter.timestamps.push(grantedAt)
        limiter.lastGrantedAt = grantedAt
        return
      }

      // 已超限：找到窗口内最早一次请求，等它“出窗”。
      const earliest = limiter.timestamps[0]
      if (earliest === undefined) {
        // 理论上很少出现，兜底避免异常状态导致死循环。
        await sleep(1)
        continue
      }

      // 计算最短等待时间：最早请求时间 + 窗口长度 - 当前时间。
      // 额外增加安全缓冲，降低边界抖动导致的偶发 CUQPS 超限。
      const waitMs = Math.max(
        earliest + AMAP_QPS_WINDOW_MS - now + AMAP_QPS_SAFETY_BUFFER_MS,
        1,
      )
      agentLog("高德限流", `接口 ${path} 达到QPS上限，等待 ${waitMs}ms`)
      await sleep(waitMs)
    }
  })

  // 即使 task 出错也不能阻塞后续队列，故用 catch 吞掉并回填空 Promise。
  limiter.queue = task.catch(() => undefined)
  // 当前请求必须等待自己的限流任务完成后才能继续发请求。
  await task
  return Date.now() - startedAt
}

/**
 * 高德通用请求入口：
 * - 自动注入 key
 * - 按接口 path 做限流
 * - 超时控制 + 异常降级
 */
export async function fetchAmap<T>(
  path: string,
  params: Record<string, string>,
): Promise<T | null> {
  const key = process.env.AMAP_KEY?.trim()
  if (!key) {
    agentLog("高德", "未配置 AMAP_KEY，跳过高德请求", buildRequestMeta(path, params))
    return null
  }

  const query = new URLSearchParams({
    key,
    ...params,
  })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), AMAP_TIMEOUT_MS)
  const metric = getPathMetric(path)
  metric.requests += 1

  try {
    // 请求真正发出前先经过限流闸门。
    const limiterWaitMs = await acquirePathRateLimit(path)
    metric.limiterWaitMs += limiterWaitMs

    for (let attempt = 0; attempt <= AMAP_THROTTLE_MAX_RETRIES; attempt += 1) {
      const response = await fetch(`${AMAP_BASE_URL}${path}?${query.toString()}`, {
        method: "GET",
        signal: controller.signal,
      })

      if (!response.ok) {
        agentLog("高德", "HTTP 请求失败", {
          ...buildRequestMeta(path, params),
          status: response.status,
          attempt: attempt + 1,
        })
        return null
      }

      const payload = (await response.json()) as T
      const meta = toAmapBaseResponse(payload)

      // 高德限流常见表现是 HTTP 200 + status=0 + info/infocode。
      if (isBusinessRateLimited(meta) && attempt < AMAP_THROTTLE_MAX_RETRIES) {
        const waitMs = calcThrottleBackoffMs(attempt)
        metric.throttledByBusiness += 1
        metric.retries += 1
        agentLog("高德限流", "命中业务态限流，执行退避重试", {
          ...buildRequestMeta(path, params),
          attempt: attempt + 1,
          nextWaitMs: waitMs,
          info: meta?.info ?? "unknown",
          infocode: meta?.infocode ?? "unknown",
        })
        await sleep(waitMs)
        continue
      }

      if (attempt > 0 || limiterWaitMs > 0) {
        agentLog("高德监控", "请求完成", {
          path,
          attempts: attempt + 1,
          limiterWaitMs,
          throttledByBusinessTotal: metric.throttledByBusiness,
          retriesTotal: metric.retries,
          requestsTotal: metric.requests,
          avgLimiterWaitMs: Number((metric.limiterWaitMs / metric.requests).toFixed(1)),
        })
      }

      return payload
    }
    return null
  } catch (error) {
    agentLog("高德", "请求异常", {
      ...buildRequestMeta(path, params),
      error: (error as Error).message,
    })
    return null
  } finally {
    clearTimeout(timeout)
  }
}
