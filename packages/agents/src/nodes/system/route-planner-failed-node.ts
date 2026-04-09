/**
 * route_planner 连续失败后的兜底节点。
 *
 * 当骨架解析达到重试上限时，直接给用户明确提示，
 * 避免继续无效重试。
 */
export async function routePlannerFailedNode() {
  return {
    errors: [
      "NEED_USER_INPUT: 路线骨架生成连续失败，请补充更明确的信息（如目的地城市、总天数、出发方式）后重试。",
    ],
  }
}

