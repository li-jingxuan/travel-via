/**
 * LLM 实例工厂
 *
 * 本模块封装了 DeepSeek 模型的创建逻辑，提供两个工厂函数：
 * - createDeepSeekV3()     → 用于通用任务（意图理解、数据查询、工具调用）
 * - createDeepSeekReasoner() → 用于需要强推理的任务（行程规划、格式化组装）
 *
 * 为什么用工厂函数而不是直接 new ChatOpenAI()？
 * 1. 统一管理 API Key、Base URL 等配置，避免每个 Agent 文件重复写
 * 2. 方便后续切换模型或添加中间件（如 logging、retry wrapper）
 * 3. 通过 overrides 参数允许调用方微调 temperature 等超参
 *
 * DeepSeek 兼容 OpenAI API 格式，所以使用 @langchain/openai 的 ChatOpenAI 即可。
 */

import { ChatOpenAI } from "@langchain/openai"
import { config as loadDotenv } from "dotenv"
import { existsSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

function loadAgentsEnv() {
  const currentFileDir = dirname(fileURLToPath(import.meta.url))
  const envCandidates = [
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "packages/agents/.env"),
    resolve(currentFileDir, "../../.env"),
    resolve(currentFileDir, "../../../.env"),
  ]

  const envPath = envCandidates.find((path) => existsSync(path))
  if (envPath) {
    loadDotenv({ path: envPath })
  }
}

loadAgentsEnv()

const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL

/**
 * 创建 DeepSeek-V3 模型实例（通用任务）
 *
 * 适用场景：IntentAgent、POIAgent、WeatherAgent、HotelAgent
 * 这些 Agent 的任务是"理解指令 + 调用工具 / 提取结构化信息"，不需要太强的创造性推理，
 * 所以 temperature 默认设为 0.3（低随机性，输出更稳定）。
 *
 * @param overrides - 可选覆盖参数，如 { temperature: 0.1 } 进一步降低随机性
 */
export function createDeepSeekV3(overrides?: { temperature?: number }) {
  return new ChatOpenAI({
    modelName: "deepseek-chat",
    temperature: overrides?.temperature ?? 0.3,
    configuration: { baseURL: DEEPSEEK_BASE_URL },
  })
}

/**
 * 创建 DeepSeek-Reasoner 模型实例（强推理任务）
 *
 * 适用场景：RoutePlanner、Formatter
 * 这些 Agent 需要"规划复杂路线"或"严格按 Schema 组装 JSON"，需要更强的推理能力。
 * deepseek-reasoner 是 DeepSeek 的推理增强模型（类似 o1 的思维链模式），
 * 会先进行内部推理再给出最终答案，适合需要多步逻辑的任务。
 *
 * RoutePlanner 默认 temperature=0.7（需要一定创造性来设计有趣路线）
 * Formatter   默认 temperature=0   （需要 100% 符合 Schema，不能有随机性）
 *
 * @param overrides - 可选覆盖参数
 */
export function createDeepSeekReasoner(overrides?: { temperature?: number }) {
  return new ChatOpenAI({
    modelName: "deepseek-reasoner",
    temperature: overrides?.temperature ?? 0.7,
    configuration: { baseURL: DEEPSEEK_BASE_URL },
  })
}
