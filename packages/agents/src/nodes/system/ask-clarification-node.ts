import { agentLog } from "../../lib/logger.js"
import type { TravelStateAnnotation } from "../../graph/state.js"
import { getMissingRequiredFields } from "../../graph/routing.js"
import { createDeepSeekV3 } from "../../lib/llm.js"
import { SystemMessage, HumanMessage } from "@langchain/core/messages"
import { z } from "zod"

// 追问只负责“怎么问得自然”，缺什么仍由确定性代码判断。
const clarificationLlm = createDeepSeekV3({ temperature: 0.4 })
clarificationLlm.withConfig({ response_format: { type: "json_object" } })

const clarificationSchema = z.object({
  prompt: z.string().trim().min(1),
  examples: z.array(z.string().trim().min(1)).max(4).optional(),
})

function getFieldLabel(field: string): string {
  if (field === "destination") return "目的地"
  if (field === "departurePoint") return "出发地"
  return field
}

function buildFallbackClarification(missing: string[]) {
  const labels = missing.map(getFieldLabel).join("、")

  // LLM 调用失败时仍要给调用方稳定可展示的追问，避免中断多轮收集。
  return {
    prompt: `还差一个关键信息：${labels}。你可以直接回复想去的目的地，比如“新疆”“云南”或“日本关西”。`,
    missingFields: missing,
    examples: ["新疆", "云南", "日本关西"],
  }
}

async function createClarification(
  state: typeof TravelStateAnnotation.State,
  missing: string[],
) {
  // 只把必要上下文交给追问模型：用户本轮输入、缺失字段、已知需求。
  // 这样可以降低模型“顺手规划行程”或编造未知信息的概率。
  const payload = {
    userInput: state.userInput,
    missingFields: missing,
    knownIntent: state.collectedIntent ?? state.intent,
  }

  try {
    const response = await clarificationLlm.invoke([
      new SystemMessage(
        [
          "你是旅行需求收集助手。请根据缺失字段生成一句自然、简洁、可执行的追问。",
          "规则：",
          "1. 只询问 missingFields 中的字段，不要生成行程。",
          "2. 不要假设用户没有明确说出的信息。",
          "3. 如果 knownIntent 中已有信息，要自然承接。",
          "4. 输出纯 JSON，格式为 {\"prompt\":\"...\",\"examples\":[\"...\"]}。",
        ].join("\n"),
      ),
      new HumanMessage(JSON.stringify(payload)),
    ])

    const content = String(response.content ?? "")
      .replace(/```json\n?|\n?```/g, "")
      .trim()
    const parsed = clarificationSchema.safeParse(JSON.parse(content))

    // 只有结构符合预期才采用模型结果；否则走兜底提示。
    if (parsed.success) {
      return {
        ...parsed.data,
        missingFields: missing,
      }
    }
  } catch (error) {
    agentLog("补充信息", "LLM 追问生成失败，使用兜底提示", {
      error: error instanceof Error ? error.message : String(error),
    })
  }

  return buildFallbackClarification(missing)
}

/**
 * 缺失必要信息时的追问节点。
 *
 * 行为：
 * - 生成用户可读的补充提示
 * - 写入 clarification/needUserInput，交由 CLI/API 做结构化展示
 */
export async function askClarificationNode(
  state: typeof TravelStateAnnotation.State,
) {
  // 优先使用 merge_collected_intent 已经算好的 missingFields；
  // 直接调用 graph 的旧入口/测试场景下，再用 routing 做兜底计算。
  const missing =
    state.missingFields.length > 0
      ? state.missingFields
      : getMissingRequiredFields(state)

  agentLog("补充信息", "开始生成补充信息提示", {
    userInput: state.userInput,
    missing,
  })
  const clarification = await createClarification(state, missing)

  agentLog("补充信息", "补充信息提示生成成功", {
    missing,
    clarification,
  })
  return {
    needUserInput: true,
    missingFields: missing,
    clarification,
  }
}
