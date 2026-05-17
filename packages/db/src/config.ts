import { config as loadDotenv } from "dotenv"
import { existsSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * 数据库配置集中放在独立文件中，避免 API 服务、Agent 包、迁移脚本各自解析环境变量。
 *
 * 设计原则：
 * 1. 所有数据库相关的环境变量都从这里读取
 * 2. 仅暴露已经标准化过的配置对象，调用方不用再关心字符串转数字等细节
 * 3. 失败尽早抛错，避免服务启动后才在深层调用中发现 DATABASE_URL 缺失
 */

let envLoaded = false

/**
 * 统一加载数据库相关的 .env 文件。
 *
 * 为什么这层必须放在 @repo/db 自己内部：
 * - `apps/apis`、`packages/agents`、`drizzle-kit` 都会直接消费数据库配置
 * - 如果把 dotenv 逻辑散落在调用方入口，很容易出现“某个入口忘记加载”的问题
 *
 * 候选优先级从近到远：
 * 1. 当前工作目录 `.env`
 * 2. 当前工作目录 `packages/db/.env`
 * 3. 当前工作目录上一级的 `packages/db/.env`（兼容 cwd=apps/apis）
 * 4. `packages/db/.env`
 * 5. 仓库根目录 `.env`
 */
function loadDatabaseEnv() {
  if (envLoaded) return

  const currentFileDir = dirname(fileURLToPath(import.meta.url))
  const envCandidates = [
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "packages/db/.env"),
    resolve(process.cwd(), "../packages/db/.env"),
    resolve(currentFileDir, "../.env"),
    resolve(currentFileDir, "../../../.env"),
  ]

  const envPath = envCandidates.find((path) => existsSync(path))
  if (envPath) {
    loadDotenv({ path: envPath })
  }

  envLoaded = true
}

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
  loadDatabaseEnv()

  return {
    connectionString: readRequiredEnv('DATABASE_URL'),
    poolMax: readNumberEnv('DATABASE_POOL_MAX', 10),
  }
}
