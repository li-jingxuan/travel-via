/**
 * Fan-out 入口空节点。
 *
 * 作用：
 * - 把 route_planner 条件路由结果（单目标）转换为后续并行分发入口
 * - 本节点不修改状态，仅承担图结构职责
 */
export async function routeEnrichEntryNode() {
  return {}
}

