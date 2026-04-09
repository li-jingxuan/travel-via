import Router from '@koa/router'
import { createPlanHandler } from '../controller/agentController.js'
import { createChatStreamHandler } from '../controller/agentStreamController.js'

const router = new Router({ prefix: '/agent' })

router.get('/health', (ctx) => {
  ctx.body = { status: 'ok', timestamp: Date.now() }
})

router.post('/plan', createPlanHandler)
router.post('/chat/stream', createChatStreamHandler)

export default router
