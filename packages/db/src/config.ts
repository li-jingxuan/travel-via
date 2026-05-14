/**
 * 数据库配置集中放在独立文件中，避免 API 服务、Agent 包、迁移脚本各自解析环境变量。
 *
 * 设计原则：
 * 1. 所有数据库相关的环境变量都从这里读取
 * 2. 仅暴露已经标准化过的配置对象，调用方不用再关心字符串转数字等细节
 * 3. 失败尽早抛错，避免服务启动后才在深层调用中发现 DATABASE_URL 缺失
 */

function readRequiredEnv(name: string): string {
  const value = process.env[name]?.trim()

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return value
}

function readNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim()

  if (!raw) return fallback

  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export interface DatabaseConfig {
  connectionString: string
  poolMax: number
}

/**
 * 使用 getter 而不是模块初始化常量，有两个好处：
 * 1. 测试场景可以在导入后再注入环境变量
 * 2. 某些 CLI/构建流程不会在真正使用数据库前就触发配置读取
 */
export function getDatabaseConfig(): DatabaseConfig {
  return {
    connectionString: readRequiredEnv('DATABASE_URL'),
    poolMax: readNumberEnv('DATABASE_POOL_MAX', 10),
  }
}
