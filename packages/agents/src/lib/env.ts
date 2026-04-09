import { config as loadDotenv } from "dotenv"
import { existsSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

let loaded = false

/**
 * 统一加载 agents 可用的 .env 文件。
 *
 * 优先级从近到远：
 * 1. 当前工作目录 .env
 * 2. 当前工作目录 packages/agents/.env
 * 3. 相对本文件向上的 .env（兼容不同运行入口）
 */
export function loadAgentsEnv() {
  // 避免重复加载和覆盖，整个进程只初始化一次环境变量。
  if (loaded) return

  const currentFileDir = dirname(fileURLToPath(import.meta.url))
  const envCandidates = [
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "packages/agents/.env"),
    resolve(currentFileDir, "../../.env"),
    resolve(currentFileDir, "../../../.env"),
  ]

  const envPath = envCandidates.find((path) => existsSync(path))
  if (envPath) {
    // 仅加载第一个命中的 .env，保持配置来源单一且可预测。
    loadDotenv({ path: envPath })
  }

  loaded = true
}
