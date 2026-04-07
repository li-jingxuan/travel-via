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
export {};
//# sourceMappingURL=graph.d.ts.map