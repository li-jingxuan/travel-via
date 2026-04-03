import cors from '@koa/cors'
import type { Context } from 'koa'

const options = {
  origin: (ctx: Context) => {
    const origin = ctx.header.origin
    if (!origin) return ''
    return origin
  },
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400,
}

export default cors(options)
