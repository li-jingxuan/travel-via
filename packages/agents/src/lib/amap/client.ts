import { loadAgentsEnv } from "../env.js"
import { agentLog } from "../logger.js"

// 确保在模块加载阶段就完成 .env 注入，避免运行时 key 缺失。
loadAgentsEnv()

const AMAP_BASE_URL = "https://restapi.amap.com"
const AMAP_TIMEOUT_MS = 8000
const AMAP_QPS_LIMIT_PER_PATH = 3
const AMAP_QPS_WINDOW_MS = 1000
const AMAP_QPS_SAFETY_BUFFER_MS = 100

interface PathRateLimiter {
  // 1 秒窗口内的请求时间戳（毫秒）。
  timestamps: number[]
  // 同 path 的串行队列，保证限流判定顺序一致。
  queue: Promise<void>
}

const pathRateLimiters = new Map<string, PathRateLimiter>()

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
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
  }
  pathRateLimiters.set(path, limiter)

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
        limiter.timestamps.push(now)
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
    agentLog("高德", "未配置 AMAP_KEY，跳过高德请求")
    return null
  }

  const query = new URLSearchParams({
    key,
    ...params,
  })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), AMAP_TIMEOUT_MS)

  try {
    // 请求真正发出前先经过限流闸门。
    await acquirePathRateLimit(path)
    const response = await fetch(`${AMAP_BASE_URL}${path}?${query.toString()}`, {
      method: "GET",
      signal: controller.signal,
    })

    if (!response.ok) {
      agentLog("高德", "HTTP 请求失败", path, response.status)
      return null
    }

    return (await response.json()) as T
  } catch (error) {
    agentLog("高德", "请求异常", path, (error as Error).message)
    return null
  } finally {
    clearTimeout(timeout)
  }
}
