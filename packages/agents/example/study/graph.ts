/**
 * ============================================================
 * LangGraph StateGraph 版本 — 带 Tool Calling 的 ReAct Agent
 * ============================================================
 *
 * 本文件是 index.ts 的 StateGraph 等价实现。
 *
 * 核心区别：
 *   index.ts  使用 task/entrypoint（函数式编排，while 循环控制流程）
 *   本文件   使用 StateGraph    （声明式图结构，条件边控制流程）
 *
 * StateGraph 的优势：
 *   - 声明式定义节点和边，图的结构一目了然
 *   - 条件边（conditionalEdges）替代 while 循环，更符合"图"的语义
 *   - 原生支持 Checkpoint、interrupt、streamMode 等高级特性
 *   - 更容易扩展为多 Agent 并行、Human-in-the-loop 等复杂场景
 *
 * 对比两种写法中相同的部分已省略详细注释，
 * 请结合 index.ts 中的注释理解 Tool / Model / Message 相关概念。
 */

import { tool } from "@langchain/core/tools";
import {
  StateGraph,
  Annotation,
  START,
  END,
  messagesStateReducer,
} from "@langchain/langgraph";
// StateGraph: 图构建器，用于注册节点和边
// Annotation:  定义状态字段的元信息（reducer + default）
// START / END:  特殊节点常量，表示图的入口和出口
// messagesStateReducer: 内置的消息追加 reducer

import {
  SystemMessage,
  HumanMessage,
  AIMessage,
  type BaseMessage,
  type ToolMessage,
} from "@langchain/core/messages";
// import type { ToolCall } from "@langchain/core/messages/tool";
import * as z from "zod";
import { ChatOpenAI } from "@langchain/openai";

// ==================== Step 1: 定义工具和模型 ====================
// （与 index.ts 完全相同）

const model = new ChatOpenAI({
  modelName: "deepseek-chat",
  openAIApiKey: "sk-5b1f72544f6a4b219bfa542190fd1107",
  configuration: {
    baseURL: "https://api.deepseek.com",
  },
});

const add = tool(({ a, b }) => a + b, {
  name: "add",
  description: "Add two numbers",
  schema: z.object({ a: z.number(), b: z.number() }),
});

const multiply = tool(({ a, b }) => a * b, {
  name: "multiply",
  description: "Multiply two numbers",
  schema: z.object({ a: z.number(), b: z.number() }),
});

const divide = tool(({ a, b }) => a / b, {
  name: "divide",
  description: "Divide two numbers",
  schema: z.object({ a: z.number(), b: z.number() }),
});

const toolsByName = {
  [add.name]: add,
  [multiply.name]: multiply,
  [divide.name]: divide,
};
const tools = Object.values(toolsByName);
const modelWithTools = model.bindTools(tools);

// ==================== Step 2: 定义 State（状态）====================
//
// 在 StateGraph 中，State 是整个图共享的数据。
// 每个节点接收完整的 State，返回一个**部分更新**（partial update），
// LangGraph 会用每个字段的 reducer 将更新合并到当前 State 中。
//
// 这与 task/entrypoint 的关键区别：
//   - task/entrypoint：函数之间手动传参，自己管理循环
//   - StateGraph：所有节点读写同一个 State 对象，图的边控制流转

const StateAnnotation = Annotation.Root({
  // messages: 消息历史数组
  //   reducer: messagesStateReducer 是 LangGraph 内置的 reducer
  //     它会自动将新消息追加到数组末尾（而不是替换整个数组）
  //     这是消息类 State 最常用的 reducer
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
});

type State = typeof StateAnnotation.State;
// State 类型 = { messages: BaseMessage[] }
// 整个图中所有节点都基于这个类型工作

// ==================== Step 3: 定义节点（Nodes）====================
//
// 在 StateGraph 中，节点的函数签名是固定的：
//   async (state: State) => Promise<Partial<State>>
//
//   输入: 当前的完整 State
//   返回: 需要更新的字段（未返回的字段保持不变）
//
// 注意：这里不再需要 while 循环！循环由图的"条件边"实现。

/** 节点 A: 调用 LLM */
async function callLlmNode(state: State) {
  // 从 state 中取出当前消息历史
  const response = await modelWithTools.invoke([
    new SystemMessage(
      "You are a helpful assistant tasked with performing arithmetic on a set of inputs.",
    ),
    ...state.messages,
  ]);

  // 返回部分更新：只更新 messages 字段
  // messagesStateReducer 会把新的 AIMessage 追加到现有数组末尾
  return { messages: [response] };
}

/** 节点 B: 执行工具 */
async function callToolNode(state: State) {
  // 取出最后一条消息（LLM 的回复），它应该包含 tool_calls
  const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
  const toolCalls = lastMessage.tool_calls ?? [];

  // 并行执行所有工具调用
  const results: ToolMessage[] = await Promise.all(
    toolCalls.map((toolCall) => {
      const tool = toolsByName[toolCall.name as keyof typeof toolsByName];
      return tool.invoke(toolCall);
      // tool.invoke() 返回值自动包装为 ToolMessage
      // 包含 tool_call_id 用于关联到原始请求
    }),
  );

  // 返回部分更新：追加工具执行结果到消息历史
  return { messages: results };
}

// ==================== Step 4: 定义条件路由函数 ====================
//
// 条件边的路由函数签名：
//   (state: State) => string | Array<string>
//
// 返回值必须是某个目标节点的名称（或 END 常量）
// 这个函数决定了图的流向，相当于 index.ts 中 while 循环里的 if 判断

function shouldContinue(state: State): "tools" | "__end__" {
  // 取出最后一条消息，检查是否有 tool_calls
  const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
  if ((lastMessage.tool_calls?.length ?? 0) > 0) {
    // 有工具调用 → 进入工具执行节点
    return "tools";
  }
  // 无工具调用 → 直接结束（LLM 已给出最终答案）
  return END;
}

// ==================== Step 5: 构建并编译图 ====================
//
// 这是 StateGraph 的核心：声明式地描述图的结构
//
//   START → callLlm ──┬── tools → callTool ──→ callLlm (循环)
//                      │
//                      └── __end__ (结束)
//

const graph = new StateGraph(StateAnnotation)
  // 创建图实例，绑定 State 类型定义

  // --- 注册节点 ---
  .addNode("llm", callLlmNode)
  // 注册名为 "llm" 的节点，对应 callLlmNode 函数
  .addNode("tools", callToolNode)
  // 注册名为 "tools" 的节点，对应 callToolNode 函数

  // --- 定义边（Edges）---

  // 固定边: START → llm（图启动后第一个执行的节点）
  .addEdge(START, "llm")

  // 条件边: llm → ? （根据 LLM 输出决定下一步）
  //   这是 ReAct 循环的核心！替代了 index.ts 中的 while (true) + if 判断
  .addConditionalEdges("llm", shouldContinue, {
    // 第一个参数: 源节点名称
    // 第二个参数: 路由函数，返回目标节点名或 END
    // 第三个参数: 可选的路径名称映射（用于调试日志显示友好名称）
    tools: "tools",
    [END]: END,
  })

  // 固定边: tools → llm（工具执行完后回到 LLM 继续推理）
  //   这形成了 llm → tools → llm 的循环
  //   直到 LLM 不再返回 tool_calls，shouldContinue 返回 END
  .addEdge("tools", "llm")

  // --- 编译图 ---
  .compile();
// compile() 将图定义转换为可执行对象
// 编译后可以 invoke() / stream() / getState() 等

// ==================== Step 6: 执行入口 ====================

const result = await graph.invoke({
  messages: [new HumanMessage("Add 3 and 4.")],
});
// invoke() 触发图执行
// 输入初始 State: { messages: [用户消息] }

// 图的执行过程（以 "Add 3 and 4." 为例）:
//
// 1. START → llm 节点
//    State: { messages: [HumanMessage] }
//    LLM 返回: AIMessage { tool_calls: [{name:"add", args:{a:3,b:4}}] }
//    更新后 State: { messages: [Human, AI_with_tool_call] }
//
// 2. 条件边 shouldContinue → "tools"（因为检测到 tool_calls）
//
// 3. tools 节点
//    执行 add(3, 4) → 7
//    更新后 State: { messages: [Human, AI_with_tool_call, ToolMessage(7)] }
//
// 4. 固定边 → llm 节点（循环回来）
//
// 5. llm 节点（第二次）
//    LLM 看到工具返回 7，生成最终答案
//    返回: AIMessage { content: "The sum of 3 and 4 is 7." }
//    更新后 State: { messages: [Human, AI_with_tool_call, ToolMessage(7), AI_final] }
//
// 6. 条件边 shouldContinue → END（无 tool_calls）
//
// 7. 图执行完毕，返回最终 State

for (const message of result.messages) {
  console.log(`[${message.getType()}]: ${message.content}`);
  // getType() 返回消息类型字符串: "human" | "ai" | "tool"
  // 输出示例:
  //   [human]: Add 3 and 4.
  //   [ai]:
  //   [tool]: 7
  //   [ai]: The sum of 3 and 4 is 7.
}

// ==================== 附：StateGraph vs task/entrypoint 对照表 ====================
//
// | 维度           | index.ts (task/entrypoint)          | graph.ts (StateGraph)         |
// |---------------|--------------------------------------|--------------------------------|
// | 流程控制       | 手动 while 循环 + if 判断            | 声明式条件边 (conditionalEdges) |
// | 数据传递       | 函数参数传递                         | 共享 State 对象              |
// | 节点复用       | task() 定义的命名函数                 | addNode() 注册的命名函数        |
// | 状态持久化     | 不支持                               | Checkpointer 一等公民支持      |
// | 人机协作       | 不支持                               | interruptBefore/After 原生支持    |
// | 流式输出       | 不支持                               | stream() + streamMode 原生支持   |
// | 并行执行       | Promise.all 手动实现                  | fan-out/fan-in 原生支持          |
// | 适用场景       | 简单的单Agent循环                    | 复杂多步工作流、多Agent协作      |
