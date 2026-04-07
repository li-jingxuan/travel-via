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
export {};
//# sourceMappingURL=index.d.ts.map