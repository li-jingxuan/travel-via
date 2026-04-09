/**
 * Graph 级常量配置
 *
 * 说明：
 * 把重试上限集中管理，避免散落在不同文件中导致调参困难。
 */

/** Validator 校验失败后的最大重试次数 */
export const MAX_RETRIES = 2

/** route_planner 骨架解析失败后的最大重试次数 */
export const ROUTE_PLANNER_MAX_RETRIES = 2

