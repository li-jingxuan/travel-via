import Router from '@koa/router'
import type Koa from 'koa'
import agentRouter from './agentRouter.js'
import historyRouter from './historyRouter.js'

const router = new Router({ prefix: '/api' })

router.use(agentRouter.routes())
router.use(historyRouter.routes())

export const registerRoutes = (app: Koa) => {
  app.use(router.routes())
  app.use(router.allowedMethods())
}
