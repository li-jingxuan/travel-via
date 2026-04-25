import type { Context } from "koa"
import type { CreateChatStreamRequest, AgentStreamEvent } from "../types/agent.js"
import { streamTravelChat } from "../service/agentService.js"

function parseBody(body: unknown): CreateChatStreamRequest {
  if (!body || typeof body !== "object") {
    return { userInput: "" }
  }

  const input = body as Record<string, unknown>
  return {
    userInput: typeof input.userInput === "string" ? input.userInput : "",
    sessionId: typeof input.sessionId === "string" ? input.sessionId : undefined,
    debug: typeof input.debug === "boolean" ? input.debug : false,
  }
}

function writeSseEvent(ctx: Context, payload: AgentStreamEvent) {
  const eventId = Date.now()
  ctx.res.write(`id: ${eventId}\n`)
  ctx.res.write(`event: ${payload.event}\n`)
  ctx.res.write(`data: ${JSON.stringify(payload.data)}\n\n`)

  console.log(`[SSE] Sent: id: ${eventId}, event: ${payload.event}, data: ${JSON.stringify(payload.data)}`)
}

/**
 * POST + SSE 聊天接口。
 *
 * 说明：
 * - 仍然使用 POST 传请求体（便于传 userInput/debug/session 信息）
 * - 响应是 text/event-stream，前端按事件逐步消费
 */
export async function createChatStreamHandler(ctx: Context) {
  const payload = parseBody(ctx.request.body)
  const userInput = payload.userInput.trim()

  if (!userInput) {
    ctx.status = 400
    ctx.body = {
      code: 400,
      message: "`userInput` is required",
      data: null,
    }
    return
  }

  ctx.req.setTimeout(0)
  ctx.respond = false

  ctx.res.statusCode = 200
  ctx.res.setHeader("Content-Type", "text/event-stream; charset=utf-8")
  ctx.res.setHeader("Cache-Control", "no-cache, no-transform")
  ctx.res.setHeader("Connection", "keep-alive")
  ctx.res.setHeader("X-Accel-Buffering", "no")

  let closed = false
  const closeHandler = () => {
    closed = true
  }
  ctx.req.on("close", closeHandler)

  // 心跳避免连接在代理层被长期空闲关闭
  const heartbeat = setInterval(() => {
    if (!closed) {
      writeSseEvent(ctx, { event: "heartbeat", data: { ts: Date.now() } })
    }
  }, 15000)

  try {
    // sessionId 可选：未传则在 service 中自动生成，并在 start/done 事件回传。
    for await (const event of streamTravelChat(userInput, payload.sessionId, payload.debug)) {
      if (closed) break
      writeSseEvent(ctx, event)
    }
  } catch (error) {
    if (!closed) {
      writeSseEvent(ctx, {
        event: "error",
        data: {
          message: (error as Error).message || "Stream failed",
        },
      })
    }
  } finally {
    clearInterval(heartbeat)
    ctx.req.off("close", closeHandler)
    if (!closed) {
      ctx.res.end()
    }
  }
}
