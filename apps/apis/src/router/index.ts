import Router from '@koa/router'
import type Koa from 'koa'
import agentRouter from './agentRouter.js'

const router = new Router({ prefix: '/api' })

router.use(agentRouter.routes())

export const registerRoutes = (app: Koa) => {
  app.use(router.routes())
  app.use(router.allowedMethods())
}
