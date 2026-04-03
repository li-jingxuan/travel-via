/**
 * ============================================================
 * LangGraph Agent 基础示例 — 带 Tool Calling 的 ReAct Agent
 * ============================================================
 *
 * 本文件演示了 LangGraph 中最核心的 Agent 模式：ReAct（Reason + Act）
 * Agent 的工作流程是：
 *
 *   用户输入 → LLM 推理 → 决定是否调用工具
 *     ↓ 是                    ↓ 否（直接回答）
 *   执行工具 ← 把结果喂回 LLM 继续推理 → 输出最终答案
 *
 * 这就是 LangGraph 的 "task/entrypoint" 编程模型：
 * - task: 定义一个可复用的计算节点（类似图中的 Node）
 * - entrypoint: 定义图的入口，编排多个 task 的执行流程
 *
 * --------------------------- LangGraph 核心 API 速查 ---------------------------
 *
 * 一、图构建 (Graph Construction)
 *
 *   1. StateGraph (状态机图) — 复杂多节点场景，支持条件路由、并行、checkpoint
 *      import { StateGraph, Annotation, START, END } from "@langchain/langgraph"
 *
 *      // 定义 State（状态类型），每个字段需要指定 reducer 和默认值
 *      const StateAnnotation = Annotation.Root({
 *        messages: Annotation<BaseMessage[]>({
 *          reducer: messagesStateReducer,  // 消息追加 reducer（LangGraph 内置）
 *          default: () => [],
 *        }),
 *        counter: Annotation<number>({
 *          reducer: (_, update) => update,     // 直接替换
 *          default: () => 0,
 *        }),
 *      })
 *
 *      const graph = new StateGraph(StateAnnotation)
 *        .addNode("nodeA", nodeAFn)           // 注册节点: 名称 + 执行函数
 *        .addNode("nodeB", nodeBFn)
 *        .addEdge(START, "nodeA")             // 固定边: START → nodeA
 *        .addEdge("nodeA", "nodeB")            // 固定边: nodeA → nodeB
 *        .addConditionalEdges(              // 条件边: 根据返回值选择路径
 *          "nodeB",
 *          (state) => state.shouldRetry ? "nodeA" : END,
 *          { retry: "nodeA", end: END }       // 路径映射表
 *        )
 *        .compile({ checkpointer })         // 编译为可执行图，可选 checkpoint
 *
 *      // 执行
 *      const result = await graph.invoke(initialState, config)
 *      const stream = graph.stream(input, { streamMode: "updates" })
 *      for await (const chunk of stream) { ... }
 *
 *   2. task / entrypoint (任务/入口点) — 轻量级函数式编排（本文件使用的方式）
 *      import { task, entrypoint } from "@langchain/langgraph"
 *
 *      // task: 定义一个可复用的命名计算单元
 *      const myTask = task({ name: "myTask" }, async (input: InputType) => {
 *        return process(input)
 *      })
 *
 *      // entrypoint: 定义图的入口，编排多个 task 的执行逻辑
 *      const agent = entrypoint({ name: "agent" }, async (input) => {
 *        let result = await myTask(input)
 *        while (needsMoreWork(result)) {
 *          result = await myTask(result)
 *        }
 *        return result
 *      })
 *
 *      // 触发执行
 *      const output = await agent.invoke(someInput)
 *
 * 二、State 管理 (State Management)
 *
 *   - Annotation.Root({...})    — 定义图的完整状态结构
 *   - Annotation<T>({reducer, default}) — 定义单个状态字段的元信息
 *     · reducer: (currentValue, newValue) → nextValue  状态更新函数
 *     · default: () => initialValue                        初始值工厂
 *   - messagesStateReducer — 内置的消息追加 reducer（自动去重）
 *   - addMessages(messages, newMessages) — 手动追加消息到历史
 *   - getState(config) / updateState(config, values) — 外部读写状态
 *
 * 三、消息系统 (Messages)
 *
 *   import { SystemMessage, HumanMessage, AIMessage, ToolMessage } from "@langchain/core/messages"
 *
 *   | 类型            | 来源               | 用途                         |
 *   |-----------------|--------------------|------------------------------|
 *   | SystemMessage   | 系统/AI             | 定义角色、规则、行为约束       |
 *   | HumanMessage    | 用户输入            | 用户的问题或指令              |
 *   | AIMessage       | LLM 输出            | LLM 的文本回复 或 tool_calls |
 *   | ToolMessage     | 工具执行结果         | 工具调用的返回值              |
 *
 *   AIMessage 关键属性:
 *   - content: string          文本内容（LLM 的自然语言回复）
 *   - tool_calls: ToolCall[]    工具调用请求数组（LLM 决定调用工具时产生）
 *
 *   ToolCall 结构:
 *   { id: string, name: string, args: Record<string, unknown> }
 *
 * 四、Tool 工具定义 (Tools)
 *
 *   import { tool } from "@langchain/core/tools"
 *
 *   const myTool = tool(
 *     async ({ param1, param2 }) => {
 *       return doSomething(param1, param2)
 *     },
 *     {
 *       name: "toolName",                // LLM 通过此名调用
 *       description: "做什么",            // 影响 LLM 选择决策
 *       schema: z.object({               // Zod 参数校验
 *         param1: z.string(),
 *         param2: z.number().optional(),
 *       }),
 *     },
 *   )
 *
 *   // 将工具绑定到模型（启用 Function Calling 能力）
 *   const modelWithTools = model.bindTools([myTool1, myTool2])
 *   // bindTools 后的模型会在回复中包含 tool_calls 字段
 *
 * 五、模型集成 (LLM Integration)
 *
 *   import { ChatOpenAI } from "@langchain/openai"
 *
 *   // OpenAI 兼容协议（DeepSeek / 通义千问 / Moonshot 等）
 *   const model = new ChatOpenAI({
 *     modelName: "deepseek-chat",
 *     configuration: { baseURL: "https://api.deepseek.com" },
 *   })
 *
 *   // 常用参数:
 *   model.invoke(messages)           // 单次调用，返回 AIMessage
 *   model.stream(messages)           // 流式调用，返回 AsyncGenerator
 *   model.bindTools(tools)          // 绑定工具列表
 *   model.withStructuredOutput(schema) // 强制结构化输出
 *
 * 六、流式输出 (Streaming)
 *
 *   // 方式一：Node-level streaming（推荐，适合前端进度展示）
 *   for await (const event of graph.stream(input, { streamMode: "updates" })) {
 *     const [nodeName, nodeData] = Object.entries(event)[0]
 *     console.log(`完成节点: ${nodeName}`, nodeData)
 *   }
 *
 *   // 方式二：Token-level streaming（实时显示生成过程）
 *   for await (const chunk of model.stream(messages)) {
 *     process.stdout.write(chunk.content)
 *   }
 *
 * 七、Human-in-the-loop (人机协作)
 *
 *   const graph = new StateGraph(State)
 *     .compile({
 *       interruptBefore: ["sensitiveNode"],   // 在此节点前暂停等待确认
 *       interruptAfter: ["reviewNode"],        // 在此节点后暂停等待修改
 *       checkpointer: memorySaver,            // 需要配合 Checkpoint 使用
 *     })
 *
 *   // 恢复执行
 *   await graph.invoke(null, { configurable: { thread_id: "xxx" }, command: "resume" })
 *   // 更新状态后恢复
 *   await graph.invoke(updatedValues, { configurable: { thread_id: "xxx" }, command: "update" })
 *
 * 八、Checkpointer (持久化/断点续跑)
 *
 *   import { MemorySaver } from "@langchain/langgraph"
 *   import { PostgresSaver } from "@langchain/checkpoint-postgres"
 *
 *   const memorySaver = new MemorySaver()           // 内存存储（开发用）
 *   const postgresSaver = new PostgresSaver(connStr) // PostgreSQL 存储（生产用）
 *
 *   // 配置到图中
 *   graph.compile({ checkpointer: memorySaver })
 *
 *   // thread_id 是每次对话的唯一标识，用于隔离不同会话的状态
 *   const config = { configurable: { thread_id: "session-123" } }
 *
 * 九、错误处理与重试 (Error Handling)
 *
 *   // 1. 条件边重试（在图中通过 conditionalEdges 实现）
 *   // 2. 节点内 try/catch
 *   const safeNode = task({ name: "safeNode" }, async (input) => {
 *     try { return await riskyOperation(input) }
 *     catch (e) { return fallbackValue }
 *   })
 *   // 3. 图级 invoke catch
 *   try { await graph.invoke(input) } catch (e) { handle(e) }
 *
 * 十、常用设计模式 (Common Patterns)
 *
 *   1. ReAct Agent (本文件): LLM 循环推理 + 工具调用直到得出答案
 *   2. Plan-and-Execute: 先规划步骤列表，再逐步执行每一步
 *   3. Multi-Agent 协作: 不同 Agent 各司其职，通过 State 共享数据
 *   4. Router Agent: 一个调度 Agent 判断该交给哪个子 Agent 处理
 *   5. Supervisor: 一个管理者 Agent 监控和协调多个 Worker Agent
 *
 * --------------------------- API 对比速查 ---------------------------
 *
 * | 场景                  | 推荐方式              | 复杂度 |
 * |-----------------------|----------------------|--------|
 * | 单次问答 + 工具调用     | task + entrypoint     | ⭐ 低   |
 * | 多步工作流 + 条件分支   | StateGraph           | ⭐⭐ 中  |
 * | 多Agent 并行协作       | StateGraph + fan-out  | ⭐⭐⭐ 高 |
 * | 需要持久化/断点续跑     | StateGraph + Checkpoint| ⭐⭐ 中  |
 * | 需要用户中途介入修改     | interruptBefore/After  | ⭐⭐ 中  |
 * ============================================================
 */

// ==================== 导入依赖 ====================

import { tool } from "@langchain/core/tools"
// tool: 将普通函数包装为 LangChain 可调用的 Tool 对象

import { task, entrypoint, addMessages } from "@langchain/langgraph"
// task:     定义一个可复用的执行节点（Node），有名称、输入输出类型
// entrypoint: 定义整个图的入口点（类似 main 函数），负责编排节点间的调用逻辑
// addMessages: LangGraph 提供的 reducer 工具函数，用于向消息列表追加新消息

import {
  SystemMessage,
  HumanMessage,
  type BaseMessage,
} from "@langchain/core/messages"
// SystemMessage: 系统提示词消息，定义 AI 的角色和行为规则
// HumanMessage:  用户输入的消息
// BaseMessage:  所有消息类型的基类（包括 AIMessage、ToolMessage 等）

import type { ToolCall } from "@langchain/core/messages/tool"
// ToolCall: LLM 决定调用工具时生成的结构化对象，包含 name（工具名）和 args（参数）

import * as z from "zod"
// Zod: TypeScript-first 的运行时 Schema 校验库，用于定义工具参数的类型约束

import { ChatOpenAI } from "@langchain/openai"
// ChatOpenAI: OpenAI 兼容协议的聊天模型客户端
//             DeepSeek API 完全兼容 OpenAI 接口格式，所以可以直接使用

// ==================== Step 1: 定义工具和模型 ====================
//
// 在 LangChain/LangGraph 中，"Tool" 是 AI 可以调用的外部能力。
// 每个 Tool 包含三部分：
//   1. 执行函数 (fn): 实际执行操作的代码
//   2. 名称 (name):      LLM 通过这个名字来选择调用哪个工具
//   3. 描述 (description): 告诉 LLM 这个工具是做什么的（影响 LLM 的选择决策）
//   4. 参数 Schema (schema): 用 Zod 定义参数结构，LLM 会据此生成符合格式的 JSON 参数

const model = new ChatOpenAI({
  modelName: "deepseek-chat",
  openAIApiKey: "sk-5b1f72544f6a4b219bfa542190fd1107",
  configuration: {
    baseURL: "https://api.deepseek.com",
    // DeepSeek 兼容 OpenAI API 格式，只需替换 baseURL 即可接入
  },
})

// --- 定义三个数学运算工具 ---

// 加法工具
// tool() 第一个参数是执行函数，第二个参数是工具的元信息配置
const add = tool(
  ({ a, b }) => a + b,
  // ↑ 解构传入的 args 对象，直接返回 a + b 的结果
  {
    name: "add",
    // ↑ LLM 调用时使用的标识符，必须唯一
    description: "Add two numbers",
    // ↑ 这段描述会被发送给 LLM，帮助它判断何时应该调用这个工具
    schema: z.object({
      // ↑ Zod Schema 定义了参数的结构和类型
      // LLM 生成的 JSON 必须符合这个结构才能被接受
      a: z.number().describe("First number"),
      b: z.number().describe("Second number"),
      // .describe() 中的描述也会发给 LLM，帮助它理解每个参数的含义
    }),
  },
)

// 乘法工具 — 结构与 add 完全相同
const multiply = tool(
  ({ a, b }) => a * b,
  {
    name: "multiply",
    description: "Multiply two numbers",
    schema: z.object({
      a: z.number().describe("First number"),
      b: z.number().describe("Second number"),
    }),
  },
)

// 除法工具
const divide = tool(
  ({ a, b }) => a / b,
  {
    name: "divide",
    description: "Divide two numbers",
    schema: z.object({
      a: z.number().describe("First number"),
      b: z.number().describe("Second number"),
    }),
  },
)

// --- 将工具绑定到模型 ---

// 构建一个 name → tool 的映射表
// 这样在后续执行时，可以根据 LLM 返回的工具名快速找到对应的 tool 对象
const toolsByName = {
  [add.name]: add,       // { "add": add }
  [multiply.name]: multiply, // { "add": add, "multiply": multiply }
  [divide.name]: divide,   // { "add": add, "multiply": multiply, "divide": divide }
}

// 取出所有工具的数组形式（bindTools 需要数组）
const tools = Object.values(toolsByName)
// tools = [add, multiply, divide]

// bindTools() 将工具列表绑定到模型上
// 绑定后，LLM 在回复中可以包含 tool_calls 字段（而不仅仅是文本）
// 这就是 "Function Calling" / "Tool Use" 能力
const modelWithTools = model.bindTools(tools)
// modelWithTools 现在是一个"增强版"模型：
// 它知道有哪些工具可用，并在合适的时候自动决定是否调用

// ==================== Step 2: 定义模型调用节点 ====================
//
// task() 创建一个命名节点。可以把 task 理解为一个封装好的函数，
// 它可以在 entrypoint 中被多次调用。
//
// LangGraph 中有两种主要节点类型：
// - task: 同步或异步的计算单元（本例中使用）
// - StateGraph.Node: 用于更复杂的状态机场景（技术方案中的多Agent架构）

const callLlm = task(
  { name: "callLlm" },
  // ↑ 节点名称，用于调试和日志追踪
  async (messages: BaseMessage[]) => {
    // ↑ 输入类型：消息历史数组
    //   messages 可能包含:
    //   - HumanMessage (用户的问题)
    //   - AIMessage (LLM 之前的回复)
    //   - ToolMessage (工具执行的返回结果)

    return modelWithTools.invoke([
      // invoke() 发送请求给 LLM 并等待响应
      new SystemMessage(
        "You are a helpful assistant tasked with performing arithmetic on a set of inputs.",
      ),
      // SystemMessage 放在消息列表的开头，定义 AI 的角色
      // 每次 callLlm 都会带上这条系统提示词
      ...messages,
      // 展开历史消息，让 LLM 能看到完整的对话上下文
      // 包括用户说了什么、之前调用了什么工具、工具返回了什么结果
    ])
    // 返回值: AIMessage 对象，可能包含:
    // - content: 文本内容（如果 LLM 直接回答）
    // - tool_calls: 工具调用请求（如果 LLM 决定调用工具）
  },
)

// ==================== Step 3: 定义工具执行节点 ====================
//
// 当 LLM 返回 tool_calls 时，需要实际执行对应工具并获取结果
// 这个节点的职责就是：接收一个 ToolCall → 执行对应工具 → 返回结果

const callTool = task(
  { name: "callTool" },
  async (toolCall: ToolCall) => {
    // ToolCall 结构示例:
    // {
    //   name: "add",           // 要调用的工具名
    //   args: { a: 3, b: 4 },  // LLM 生成的参数（JSON 对象）
    //   id: "call_xxx",         // 唯一 ID，用于关联结果
    // }

    const tool = toolsByName[toolCall.name as keyof typeof toolsByName]
    // 根据 toolCall.name 从映射表中找到对应的 tool 对象
    // as keyof typeof toolsByName 是类型断言，告诉 TS 这个 name 一定是合法的 key

    return tool.invoke(toolCall)
    // 执行工具！
    // tool.invoke() 内部会：
    //   1. 用 Zod schema 校验 toolCall.args 是否符合要求
    //   2. 将 args 解构传给执行函数
    //   3. 返回执行结果（包装为 ToolMessage）
    // 例如: add.invoke({a:3, b:4}) → 7
  },
)

// ==================== Step 4: 定义 Agent 入口（核心编排逻辑）====================
//
// entrypoint 是整个 Agent 图的入口点。
// 它定义了完整的 ReAct 循环（Reasoning + Acting）：
//
//   ┌──────────────────────────────────────┐
//   │  1. 调用 LLM (callLlm)              │
//   │     ↓                                │
//   │  2. LLM 有 tool_calls 吗？            │
//   │     ├── 没有 → 输出最终答案，结束     │
//   │     └── 有 → 继续                   │
//   │     ↓                                │
//   │  3. 并行执行所有工具 (callTool)       │
//   │     ↓                                │
//   │  4. 将工具结果追加到消息历史          │
//   │     ↓                                │
//   │  5. 回到步骤 1（带着新的上下文）      │
//   └──────────────────────────────────────┘
//
// 这个循环会一直持续，直到 LLM 不再请求工具调用为止。

const agent = entrypoint(
  { name: "agent" },
  // ↑ 入口点的名称
  async (messages: BaseMessage[]) => {
    // ↑ 初始输入：用户的原始消息（如 "Add 3 and 4."）

    let modelResponse = await callLlm(messages)
    // 第一次调用 LLM
    // 此时 messages 只有用户的一条消息
    // LLM 可能会返回一个 tool_call: { name: "add", args: { a: 3, b: 4 } }

    while (true) {
      // ReAct 主循环开始
      // 这个循环实现了 "思考-行动-观察-再思考" 的模式

      if (!modelResponse.tool_calls?.length) {
        // 如果 LLM 的响应中没有 tool_calls
        // 说明 LLM 认为已经可以给出最终答案了
        break
        // 跳出循环，返回最终的 messages
      }

      // --- 执行工具阶段 ---
      const toolResults = await Promise.all(
        modelResponse.tool_calls.map((toolCall) => callTool(toolCall)),
      )
      // modelResponse.tool_calls 可能包含多个工具调用
      // 例如 LLM 可能同时决定调用 add 和 multiply
      // Promise.all 让它们并行执行以提高效率
      //
      // toolResults 是 ToolMessage[] 数组
      // 每个 ToolMessage 包含:
      // - tool_call_id: 关联到对应的 toolCall
      // - content: 工具的返回值（如数字 7）

      // --- 更新消息历史 ---
      messages = addMessages(messages, [modelResponse, ...toolResults])
      // addMessages 是 LangGraph 提供的 reducer 函数
      // 它将新的消息追加到消息历史中:
      //   messages (旧历史)
      //   + modelResponse (LLM 说要调用哪些工具)
      //   + toolResults (工具实际返回的结果)
      //   = messages (更新后的完整上下文)

      // --- 再次调用 LLM ---
      modelResponse = await callLlm(messages)
      // 带着更新后的上下文再次调用 LLM
      // 现在 LLM 可以看到工具返回的结果
      // 它可能会：
      //   A. 根据工具结果继续调用其他工具（循环继续）
      //   B. 基于所有信息生成最终答案（下次循环 break）
    }

    return messages
    // 返回完整的消息历史
    // 包含了整个推理过程的所有消息
  },
)

// ==================== 执行入口 ====================
//
// 这里是实际的调用代码
// 在真实应用中，这部分通常由 HTTP 请求触发（如 Koa Router）

const result = await agent.invoke([new HumanMessage("Add 3 and 4.")])
// invoke() 触发 entrypoint 的执行
// 传入初始消息数组（只有一个用户消息）

// result 是完整的消息历史数组
for (const message of result) {
  console.log(`[${message.type}]: ${message.text}`)
  // 打印每条消息的内容
  // 输出示例:
  //   [human]: Add 3 and 4.
  //   [ai]: （这里可能是空的，因为 LLM 直接调用了工具）
  //   [tool]: 7          ← add(3, 4) 的结果
  //   [ai]: The sum of 3 and 4 is 7.  ← LLM 基于工具结果的最终答案
}
