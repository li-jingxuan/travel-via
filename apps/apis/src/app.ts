import Koa from 'koa'
import { registerMiddleware } from './middleware/index.js'
import { registerRoutes } from './router/index.js'

const app: Koa = new Koa()
const PORT = Number(process.env.PORT) || 3001

registerMiddleware(app)
registerRoutes(app)

app.listen(PORT, () => {
  console.log(`🚀 API server running at http://localhost:${PORT}`)
})
