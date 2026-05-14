import type { Context } from "koa"
import type { DeleteHistoryRequest } from "@repo/shared-types"
import {
  deleteHistoryBySessionId,
  getHistoryDetail,
  listHistories,
} from "../service/historyService.js"

function parsePositiveInteger(value: unknown, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function parseDeleteBody(body: unknown): DeleteHistoryRequest {
  if (!body || typeof body !== "object") {
    return { sessionId: "" }
  }

  const input = body as Record<string, unknown>
  return {
    sessionId: typeof input.sessionId === "string" ? input.sessionId.trim() : "",
  }
}

export async function getHistoryListHandler(ctx: Context) {
  const page = parsePositiveInteger(ctx.query.page, 1)
  const pageSize = parsePositiveInteger(ctx.query.pageSize, 20)
  const data = await listHistories({ page, pageSize })

  ctx.body = {
    code: 0,
    message: "ok",
    data,
  }
}

export async function getHistoryDetailHandler(ctx: Context) {
  const sessionId = String(ctx.params.sessionId ?? "").trim()
  if (!sessionId) {
    ctx.status = 400
    ctx.body = {
      code: 400,
      message: "`sessionId` is required",
      data: null,
    }
    return
  }

  const detail = await getHistoryDetail(sessionId)
  if (!detail) {
    ctx.status = 404
    ctx.body = {
      code: 404,
      message: "History not found",
      data: null,
    }
    return
  }

  ctx.body = {
    code: 0,
    message: "ok",
    data: detail,
  }
}

export async function deleteHistoryHandler(ctx: Context) {
  const payload = parseDeleteBody(ctx.request.body)
  if (!payload.sessionId) {
    ctx.status = 400
    ctx.body = {
      code: 400,
      message: "`sessionId` is required",
      data: null,
    }
    return
  }

  await deleteHistoryBySessionId(payload.sessionId)
  ctx.body = {
    code: 0,
    message: "ok",
    data: {
      sessionId: payload.sessionId,
    },
  }
}
