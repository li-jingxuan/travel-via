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
        errors: ["`userInput` is required"],
        needUserInput: false,
      },
    } satisfies CreatePlanResponse
    return
  }

  const result = await createTravelPlan(userInput, payload.debug)

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
