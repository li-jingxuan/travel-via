import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { getDatabaseConfig } from './config.js'
import * as historySchema from './schema/history.js'

let poolSingleton: Pool | null = null

function createDatabase() {
  return drizzle(getPgPool(), {
    schema: historySchema,
  })
}

let dbSingleton: ReturnType<typeof createDatabase> | null = null

/**
 * 整个进程内复用同一个连接池。
 *
 * 原因：
 * - Koa API 与 LangGraph 都会频繁读写数据库
 * - 如果每次创建新的 Pool，会带来不必要的连接开销
 */
export function getPgPool() {
  if (poolSingleton) return poolSingleton

  const config = getDatabaseConfig()
  poolSingleton = new Pool({
    connectionString: config.connectionString,
    max: config.poolMax,
  })

  return poolSingleton
}

export function getDb() {
  if (dbSingleton) return dbSingleton

  dbSingleton = createDatabase()

  return dbSingleton
}

export type AppDatabase = ReturnType<typeof getDb>
