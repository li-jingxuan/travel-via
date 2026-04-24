import type { Context } from "koa"
import type {
  CreatePlanRequest,
  CreatePlanResponse,
} from "../types/agent.js"
import { createTravelPlan } from "../service/agentService.js"

function parseBody(body: unknown): CreatePlanRequest {
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

export async function createPlanHandler(ctx: Context) {
  const payload = parseBody(ctx.request.body)
  const userInput = payload.userInput.trim()

  if (!userInput) {
    ctx.status = 400
    ctx.body = {
      code: 400,
      message: "`userInput` is required",
      data: {
        finalPlan: null,
        sessionId: "",
        errors: ["`userInput` is required"],
        needUserInput: false,
        planSummary: "",
      },
    } satisfies CreatePlanResponse
    return
  }

  // sessionId 可选：未传时由 service 自动生成并回传给客户端。
  const result = await createTravelPlan(userInput, payload.sessionId, payload.debug)

  if (result.needUserInput) {
    ctx.status = 422
    ctx.body = {
      code: 1001,
      message: "Missing required travel info",
      data: result,
    } satisfies CreatePlanResponse
    return
  }

  if (!result.finalPlan) {
    ctx.status = 500
    ctx.body = {
      code: 1002,
      message: "Failed to generate travel plan",
      data: result,
    } satisfies CreatePlanResponse
    return
  }

  ctx.status = 200
  ctx.body = {
    code: 0,
    message: "ok",
    data: result,
  } satisfies CreatePlanResponse
}
