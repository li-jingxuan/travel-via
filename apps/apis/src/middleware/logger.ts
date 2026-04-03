import type { Middleware } from 'koa'

export const logger: Middleware = async (ctx, next) => {
  const start = Date.now()
  await next()
  const ms = Date.now() - start
  console.log(
    `${ctx.method} ${ctx.url} - ${ctx.status} - ${ms}ms`
  )
}
