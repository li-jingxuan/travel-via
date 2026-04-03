import Router from '@koa/router'

const router = new Router({ prefix: '/agent' })

router.get('/health', (ctx) => {
  ctx.body = { status: 'ok', timestamp: Date.now() }
})

export default router
