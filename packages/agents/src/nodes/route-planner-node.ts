/**
 * 兼容层（Deprecated）：
 * 历史上节点文件名为 route-planner-node（此前从 -agent 迁移而来）。
 * 现已拆分为：
 * - router-planner-node（路线骨架规划）
 * - driving-distance-node（驾驶里程增强）
 *
 * 为避免现有导入路径立即失效，这里保留转发导出。
 */

export { routerPlannerNode as routePlannerNode } from "./router-planner-node.js"
