/**
 * ============================================================
 * LangGraph 官方示例合集（TypeScript 版）
 * ============================================================
 *
 * 本文件包含 6 个由简到繁的官方示例，覆盖 LangGraph 的核心概念：
 *
 *   示例 1: Hello World 图（无 LLM，纯图结构演示）
 *   示例 2: 简单聊天机器人（接入 LLM）
 *   示例 3: ReAct Agent（LLM + Tool Calling 循环）
 *   示例 4: 条件路由（多分支决策）
 *   示例 5: 并行执行（Fan-out / Fan-in）
 *   示例 6: Human-in-the-loop（人机协作）
 *
 * 每个示例都是独立可运行的，取消对应区域的注释即可单独执行。
 */
import { tool } from "@langchain/core/tools";
import { StateGraph, Annotation, START, END, messagesStateReducer, } from "@langchain/langgraph";
import { SystemMessage, HumanMessage, AIMessage, } from "@langchain/core/messages";
import * as z from "zod";
import { ChatOpenAI } from "@langchain/openai";
import { MemorySaver } from "@langchain/langgraph";
// ==================== 公共：模型配置 ====================
const model = new ChatOpenAI({
    modelName: "deepseek-chat",
    openAIApiKey: "sk-5b1f72544f6a4b219bfa542190fd1107",
    configuration: { baseURL: "https://api.deepseek.com" },
});
// =====================================================================
// 示例 1: Hello World 图 — 无 LLM，纯图结构
// =====================================================================
//
// 目的：理解 StateGraph 最基本的构成要素 — State、Node、Edge、compile、invoke
//
// 这是理解所有复杂示例的基础。先看懂这个，后面的都好懂。
//
// 核心概念：
//   State    → 图中流动的数据（所有节点共享）
//   Node     → 处理步骤（函数：读 state → 返回部分更新）
//   Edge     → 节点间的连接（固定边 vs 条件边）
//   compile  → 将图定义编译为可执行对象
//   invoke   → 触发图执行
async function demo1_helloWorld() {
    // --- Step 1: 定义 State ---
    //
    // State 是图的"共享内存"，每个节点都能读写它。
    // Annotation.Root({...}) 定义了 State 的完整结构和每个字段的行为。
    const SimpleState = Annotation.Root({
        // input 字段：存储用户输入
        input: Annotation({
            reducer: (_, update) => update,
            // reducer 决定了当节点返回新值时如何更新旧值
            // (_, update) => update  表示直接替换（后值覆盖前值）
            default: () => "",
            // default 是初始值工厂函数（不是直接写 ""，而是 () => ""）
        }),
        // output 字段：存储处理结果
        output: Annotation({
            reducer: (_, update) => update,
            default: () => "",
        }),
    });
    // 推导出的类型 = { input: string; output: string }
    // --- Step 2: 定义节点 ---
    //
    // 节点就是一个普通异步函数！
    // 签名固定：(state: State) => Promise<Partial<State>>
    //
    // 重要规则：
    //   - 输入：当前完整的 State 对象
    //   - 返回：需要更新的字段（Partial），未返回的字段保持不变
    //   - 不要修改原始 state（返回新值，让 reducer 合并）
    async function greetingNode(state) {
        const userInput = state.input;
        return { output: `你好！你输入的是："${userInput}"` };
        // 只更新 output 字段，input 保持不变
    }
    async function responseNode(state) {
        const currentOutput = state.output;
        return { output: `${currentOutput} ✅ 处理完成！` };
        // 在已有 output 基础上追加内容
    }
    // --- Step 3: 构建图 ---
    const graph = new StateGraph(SimpleState)
        // 创建图实例，绑定 State 类型
        .addNode("greeting", greetingNode)
        // 注册节点：名称 + 函数
        // 名称用于在 addEdge/addConditionalEdges 中引用
        .addNode("response", responseNode)
        // --- 定义边（Edges）---
        .addEdge(START, "greeting")
        // 固定边：START 是特殊的入口节点常量
        // 含义：图启动后第一个执行的节点是 "greeting"
        .addEdge("greeting", "response")
        // 固定边：greeting 执行完后自动进入 response
        .addEdge("response", END)
        // 固定边：response 执行完后结束（END 是特殊出口节点常量）
        .compile();
    // 编译！将图定义转换为可执行对象
    // compile() 会做基本检查：是否有孤立节点、是否能从 START 到达 END 等
    // --- Step 4: 执行 ---
    const result = await graph.invoke({ input: "LangGraph 初体验" });
    // invoke() 触发图执行
    // 传入的是初始 State（满足 State 类型即可）
    console.log("===== 示例 1: Hello World =====");
    console.log("输入:", result.input);
    console.log("输出:", result.output);
    // 执行流程:
    //   START → greeting → response → END
    //
    //   初始 State: { input: "LangGraph 初体验", output: "" }
    //   greeting 后:  { input: "LangGraph 初体验", output: '你好！你输入的是："LangGraph 初体验"' }
    //   response 后:  { input: "LangGraph 初体验", output: '...✅ 处理完成！' }
}
// =====================================================================
// 示例 2: 简单聊天机器人 — 接入 LLM
// =====================================================================
//
// 目的：学会如何在图中使用 LLM，以及 messages 类型的 State 管理
//
// 新增概念：
//   - messagesStateReducer: 内置的消息列表 reducer（自动追加）
//   - LLM 作为节点函数的一部分被调用
async function demo2_chatbot() {
    // --- Step 1: 定义 State ---
    //
    // 对于聊天类应用，State 通常只需要一个 messages 数组
    // 使用内置的 messagesStateReducer 来管理消息追加
    const ChatState = Annotation.Root({
        messages: Annotation({
            reducer: messagesStateReducer,
            // messagesStateReducer 是 LangGraph 内置的 reducer
            // 它的行为是：把新消息**追加**到数组末尾（而不是替换整个数组）
            // 这正是聊天场景需要的——保留完整的对话历史
            default: () => [],
        }),
    });
    // ChatState = { messages: BaseMessage[] }
    // --- Step 2: 定义节点 ---
    async function chatbotNode(state) {
        // 从 state 中取出消息历史
        const response = await model.invoke(state.messages);
        // 直接把历史消息发给 LLM
        // LLM 会基于完整上下文生成回复
        // 返回新的消息（reducer 会自动追加）
        return { messages: [response] };
    }
    // --- Step 3: 构建图 ---
    // 这是最简单的图：只有一个节点，一条边
    const graph = new StateGraph(ChatState)
        .addNode("chatbot", chatbotNode)
        .addEdge(START, "chatbot")
        .addEdge("chatbot", END)
        .compile();
    // --- Step 4: 执行 ---
    const result = await graph.invoke({
        messages: [new HumanMessage("用一句话介绍你自己")],
    });
    console.log("\n===== 示例 2: 简单聊天机器人 =====");
    for (const msg of result.messages) {
        console.log(`[${msg.getType()}]: ${msg.content}`);
    }
}
// =====================================================================
// 示例 3: ReAct Agent — LLM + Tool Calling 循环
// =====================================================================
//
// 目的：掌握 Agent 的核心模式 — LLM 反复推理和调用工具直到得出答案
//
// 新增概念：
//   - tool(): 定义 LLM 可调用的工具
//   - bindTools(): 将工具绑定到模型
//   - AIMessage.tool_calls: LLM 决定调用工具时产生的结构化请求
//   - addConditionalEdges: 条件边，根据状态动态选择下一步
//
// 这个示例与 graph.ts 完全等价，但注释更侧重"为什么这样设计"
async function demo3_reactAgent() {
    // --- Step 1: 定义工具 ---
    const add = tool(({ a, b }) => a + b, { name: "add", description: "Add two numbers", schema: z.object({ a: z.number(), b: z.number() }) });
    const multiply = tool(({ a, b }) => a * b, { name: "multiply", description: "Multiply two numbers", schema: z.object({ a: z.number(), b: z.number() }) });
    const toolsByName = { [add.name]: add, [multiply.name]: multiply };
    const tools = Object.values(toolsByName);
    const modelWithTools = model.bindTools(tools);
    // bindTools 让 LLM 知道有哪些工具可用
    // 之后 LLM 可以在回复中返回 tool_calls 而不仅仅是文本
    // --- Step 2: 定义 State ---
    const ReactState = Annotation.Root({
        messages: Annotation({
            reducer: messagesStateReducer,
            default: () => [],
        }),
    });
    // --- Step 3: 定义节点 ---
    async function llmNode(state) {
        const response = await modelWithTools.invoke([
            new SystemMessage("You are a helpful assistant. Use the provided tools to answer questions."),
            ...state.messages,
        ]);
        return { messages: [response] };
        // LLM 可能返回：
        //   A) 纯文本回复（用户的问题不需要工具）
        //   B) 包含 tool_calls 的回复（需要调用工具获取信息）
    }
    async function toolNode(state) {
        const lastMsg = state.messages[state.messages.length - 1];
        const results = await Promise.all((lastMsg.tool_calls ?? []).map((tc) => {
            const tool = toolsByName[tc.name];
            return tool.invoke(tc);
        }));
        return { messages: results };
        // 工具结果会作为 ToolMessage 追加到历史中
        // 下次 LLM 调用时就能看到这些结果
    }
    // --- Step 4: 定义条件路由 ---
    //
    // 这是 ReAct 的核心！替代手动 while 循环
    //
    // 条件边的路由函数签名：
    //   (state: State) => string (目标节点名或 END)
    function shouldContinue(state) {
        const lastMsg = state.messages[state.messages.length - 1];
        if ((lastMsg.tool_calls?.length ?? 0) > 0) {
            return "tools";
            // 有工具调用 → 进入工具执行节点
        }
        return END;
        // 无工具调用 → 结束（LLM 已给出最终答案）
    }
    // --- Step 5: 构建图 ---
    //
    //   ┌─────────────────────────────────────┐
    //   │  START                             │
    //   │    ↓                                │
    //   │  [llm] ───条件边──┬──→ [tools]     │
    //   │    ↑              │       ↓         │
    //   │    └──────────────┘──→ [llm] → END  │
    //   └─────────────────────────────────────┘
    const graph = new StateGraph(ReactState)
        .addNode("llm", llmNode)
        .addNode("tools", toolNode)
        .addEdge(START, "llm")
        .addConditionalEdges("llm", shouldContinue, {
        // 第三个参数是可选的路径映射（给路径起友好名字）
        tools: "tools",
        [END]: END,
    })
        .addEdge("tools", "llm")
        // tools → llm 形成了循环！
        // 直到 shouldContinue 返回 END，循环才停止
        .compile();
    // --- Step 6: 执行 ---
    const result = await graph.invoke({
        messages: [
            new HumanMessage("计算 3 加 4 等于多少？然后乘以 5"),
        ],
    });
    console.log("\n===== 示例 3: ReAct Agent =====");
    for (const msg of result.messages) {
        console.log(`[${msg.getType()}]: ${msg.content}`);
    }
    // 预期输出流程:
    //   [human]: 计算 3 加 4 等于多少？然后乘以 5
    //   [ai]: （含 tool_calls: [{name:"add", args:{a:3,b:4}}]）
    //   [tool]: 7
    //   [ai]: （含 tool_calls: [{name:"multiply", args:{a:7,b:5}}]）
    //   [tool]: 35
    //   [ai]: 3 + 4 = 7，然后 7 × 5 = 35
}
// =====================================================================
// 示例 4: 条件路由 — 多分支决策
// =====================================================================
//
// 目的：学会根据状态动态选择不同的执行路径
//
// 场景：根据用户输入的内容长度，走不同的处理分支
async function demo4_conditionalRouting() {
    const RouterState = Annotation.Root({
        content: Annotation({ reducer: (_) => _, default: () => "" }),
        category: Annotation({ reducer: (_) => _, default: () => "" }),
        result: Annotation({ reducer: (_) => _, default: () => "" }),
    });
    // --- 节点 ---
    async function categorizeNode(state) {
        const len = state.content.length;
        let category;
        if (len < 10)
            category = "short";
        else if (len < 30)
            category = "medium";
        else
            category = "long";
        return { content: state.content, category };
    }
    async function handleShort(state) {
        return { result: `短文本(${state.category}): "${state.content}" — 快速处理` };
    }
    async function handleMedium(state) {
        return { result: `中等文本(${state.category}): "${state.content}" — 正常分析` };
    }
    async function handleLong(state) {
        return { result: `长文本(${state.category}): "${state.content}" — 深度处理` };
    }
    // --- 路由函数 ---
    //
    // 返回值必须是已注册节点的名称字符串
    // LangGraph 用这个返回值决定下一步去哪个节点
    function routeByCategory(state) {
        switch (state.category) {
            case "short": return "handle_short";
            case "medium": return "handle_medium";
            case "long": return "handle_long";
            default: return "handle_short";
        }
    }
    // --- 构建图 ---
    //
    //   START → categorize ──┬→ handle_short → END
    //                        ├→ handle_medium → END
    //                        └→ handle_long → END
    const graph = new StateGraph(RouterState)
        .addNode("categorize", categorizeNode)
        .addNode("handle_short", handleShort)
        .addNode("handle_medium", handleMedium)
        .addNode("handle_long", handleLong)
        .addEdge(START, "categorize")
        .addConditionalEdges("categorize", routeByCategory, {
        handle_short: "handle_short",
        handle_medium: "handle_medium",
        handle_long: "handle_long",
    })
        // 三个分支最终都汇聚到 END
        .addEdge("handle_short", END)
        .addEdge("handle_medium", END)
        .addEdge("handle_long", END)
        .compile();
    // --- 执行不同长度的输入 ---
    console.log("\n===== 示例 4: 条件路由 =====");
    const inputs = ["Hi", "This is a medium text", "This is a very long piece of text that exceeds thirty characters!"];
    for (const input of inputs) {
        const result = await graph.invoke({ content: input });
        console.log(`输入: "${input}"`);
        console.log(`分类: ${result.category}`);
        console.log(`结果: ${result.result}`);
        console.log("---");
    }
}
// =====================================================================
// 示例 5: 并行执行 — Fan-out / Fan-in
// =====================================================================
//
// 目的：学会让多个节点并行执行以提高效率
//
// 关键技巧：从一个节点引出多条固定边到多个独立节点，
//          这些节点会在同一个 super-step 中并行执行
//
// 适用场景：
//   - 同时查询多个独立的 API（天气+酒店+景点）
//   - 同时对一段文本做多种分析（情感+摘要+翻译）
async function demo5_parallelExecution() {
    const ParallelState = Annotation.Root({
        topic: Annotation({ reducer: (_) => _, default: () => "" }),
        sentiment: Annotation({ reducer: (_) => _, default: () => "" }),
        summary: Annotation({ reducer: (_) => _, default: () => "" }),
        translation: Annotation({ reducer: (_) => _, default: () => "" }),
        result: Annotation({ reducer: (_) => _, default: () => "" }),
    });
    // --- 节点 ---
    async function analyzeSentiment(state) {
        const res = await model.invoke([new SystemMessage("分析以下文本的情感倾向，用一个词回答。"), new HumanMessage(state.topic)]);
        return { sentiment: String(res.content) };
    }
    async function summarizeText(state) {
        const res = await model.invoke([new SystemMessage("用一句话总结以下文本。"), new HumanMessage(state.topic)]);
        return { summary: String(res.content) };
    }
    async function translateToEnglish(state) {
        const res = await model.invoke([new SystemMessage("Translate the following Chinese text to English:"), new HumanMessage(state.topic)]);
        return { translation: String(res.content) };
    }
    async function combineResults(state) {
        return {
            result: [
                `原文: ${state.topic}`,
                `情感: ${state.sentiment}`,
                `摘要: ${state.summary}`,
                `英文: ${state.translation}`,
            ].join("\n"),
        };
    }
    // --- 构建图 ---
    //
    //   START
    //     ↓
    //   [split]
    //     ├→ [sentiment] ─┐
    //     ├→ [summary]   ─┼→ [combine] → END
    //     └→ [translate] ─┘
    //
    // sentiment / summary / translate 三个节点并行执行！
    // 它们之间没有依赖关系，所以可以同时跑
    const graph = new StateGraph(ParallelState)
        .addNode("analyze_sentiment", analyzeSentiment)
        .addNode("summarize", summarizeText)
        .addNode("translate", translateToEnglish)
        .addNode("combine", combineResults)
        // Fan-out: 从 START 分发到三个并行节点
        // 注意：这里不需要一个显式的 "split" 节点
        // 直接从 START 引出多条边即可实现 fan-out
        .addEdge(START, "analyze_sentiment")
        .addEdge(START, "summarize")
        .addEdge(START, "translate")
        // Fan-in: 三个并行节点都完成后汇聚到 combine
        .addEdge("analyze_sentiment", "combine")
        .addEdge("summarize", "combine")
        .addEdge("translate", "combine")
        .addEdge("combine", END)
        .compile();
    // --- 执行 ---
    const result = await graph.invoke({
        topic: "今天天气真好，适合出去旅行！",
    });
    console.log("\n===== 示例 5: 并行执行 =====");
    console.log(result.result);
}
// =====================================================================
// 示例 6: Human-in-the-loop — 人机协作
// =====================================================================
//
// 目的：学会在图的特定位置暂停，等待人类介入后再继续
//
// 关键 API：
//   interruptBefore: 在指定节点**之前**暂停
//   interruptAfter:  在指定节点**之后**暂停
//   需要 checkpointer 配合使用（本例用 MemorySaver）
//
// 注意：Human-in-the-loop 需要在真实终端环境中运行
//       这里只展示代码结构
async function demo6_humanInTheLoop() {
    const HtlState = Annotation.Root({
        messages: Annotation({
            reducer: messagesStateReducer,
            default: () => [],
        }),
        approval: Annotation({
            reducer: (_) => _,
            default: () => null,
        }),
    });
    async function draftNode(state) {
        const res = await model.invoke([
            new SystemMessage("你是一个文案起草助手。请根据用户需求撰写一份草稿。"),
            ...state.messages,
        ]);
        return { messages: [res] };
    }
    async function reviewNode(state) {
        const approval = state.approval;
        if (approval === "approved") {
            return { messages: [new AIMessage("✅ 草稿已获批准，发布就绪！")] };
        }
        return { messages: [new AIMessage("❌ 草稿被驳回，正在重新撰写..."), new HumanMessage("请重新撰写更专业的版本。")] };
    }
    function needsReview(state) {
        const lastMsg = state.messages[state.messages.length - 1];
        if ((lastMsg.tool_calls?.length ?? 0) > 0)
            return END;
        const approval = state.approval;
        if (approval === null)
            return "review";
        if (approval === "rejected")
            return "draft";
        return END;
    }
    const checkpointer = new MemorySaver();
    // MemorySaver: 内存级 Checkpoint 存储（开发/测试用）
    // 生产环境建议用 PostgresSaver 或 RedisSaver
    const graph = new StateGraph(HtlState)
        .addNode("draft", draftNode)
        .addNode("review", reviewNode)
        .addEdge(START, "draft")
        .addConditionalEdges("draft", needsReview, { review: "review", [END]: END })
        .addConditionalEdges("review", needsReview, { draft: "draft", [END]: END })
        .compile({
        interruptAfter: ["draft"],
        checkpointer,
    });
    // --- 执行流程演示 ---
    const config = { configurable: { thread_id: "demo-session-001" } };
    // thread_id 用于隔离不同会话的状态
    console.log("\n===== 示例 6: Human-in-the-loop =====");
    // 第一次 invoke: 运行到 draft 节点后会暂停
    const result1 = await graph.invoke({ messages: [new HumanMessage("帮我写一句产品宣传语")] }, config);
    console.log("Draft 节点输出:");
    console.log(result1.messages[result1.messages.length - 1].content);
    console.log("⏸️ 已暂停，等待人工审核...");
    // 模拟人类操作：批准草稿并恢复执行
    const result2 = await graph.invoke({ approval: "approved" }, config);
    console.log("最终输出:");
    for (const msg of result2.messages) {
        if (msg.getType() === "ai")
            console.log(msg.content);
    }
    // 如果想模拟"驳回"场景：
    // const result3 = await graph.invoke(
    //   { approval: "rejected" },
    //   { ...config, command: "resume" }
    // )
    // 图会回到 draft 节点重新生成草稿
}
// =====================================================================
// 主入口：依次运行所有示例
// =====================================================================
async function main() {
    console.log("╔══════════════════════════════════════╗");
    console.log("║  LangGraph 官方示例合集 (TS 版)       ║");
    console.log("╚══════════════════════════════════════╝\n");
    await demo1_helloWorld();
    await demo2_chatbot();
    await demo3_reactAgent();
    await demo4_conditionalRouting();
    await demo5_parallelExecution();
    await demo6_humanInTheLoop();
    console.log("\n✅ 所有示例运行完毕！");
}
main().catch((err) => {
    console.error("执行出错:", err);
    process.exit(1);
});
