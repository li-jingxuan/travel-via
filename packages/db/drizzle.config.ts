import { defineConfig } from 'drizzle-kit'
import { getDatabaseConfig } from './src/config.js'

const config = getDatabaseConfig()

/**
 * Drizzle 独立配置文件：
 * - 让数据库迁移与应用运行共用同一套 DATABASE_URL
 * - 后续如果引入 CI/CD 或单独 migration step，可以直接复用这份配置
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/*.ts',
  out: './drizzle',
  dbCredentials: {
    url: config.connectionString,
  },
})
