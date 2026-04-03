import Koa from 'koa'
import helmet from './helmet.js'
import cors from './cors.js'
import { logger } from './logger.js'
import { errorHandler } from './errorHandler.js'
import { bodyParser } from './bodyParser.js'

export const registerMiddleware = (app: Koa) => {
  app.use(helmet)
  app.use(cors)
  app.use(errorHandler)
  app.use(bodyParser)
  app.use(logger)
}
