import type { Context, Next, Middleware } from 'koa'

interface ErrorResponse {
  code: number
  message: string
}

export const errorHandler: Middleware = async (ctx: Context, next: Next) => {
  try {
    await next()
  } catch (err) {
    const error = err as Error & { status?: number; expose?: boolean }
    const status = error.status || error.expose ? 500 : 500
    const body: ErrorResponse = {
      code: status,
      message: error.message || 'Internal Server Error',
    }
    ctx.status = status
    ctx.body = body
    if (status >= 500) {
      console.error(`[Error] ${ctx.method} ${ctx.url}`, error)
    }
  }
}
