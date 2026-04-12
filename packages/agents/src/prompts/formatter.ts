/**
 * FormatterAgent System Prompt
 *
 * 设计要点：
 * - 这是质量把关最严格的 Prompt，输出必须 100% 符合 ITravelPlan Schema
 * - 完整列出 JSON Schema 结构作为参考（而非依赖 LLM 记忆）
 * - 明确 MVP 阶段的 fallback 规则（enriched 数据为空时如何填充）
 * - 强调 totalDistance 是累加值、essentialItems 要给 5-8 个建议
 * - temperature=0 配合此 Prompt 实现零随机性输出
 */

/**
 * Formatter 输出结构参考（用于提示词注入）。
 *
 * 说明：
 * - 用对象维护比手写大段 JSON 字符串更安全，改字段时不易引入逗号/括号错误
 * - 使用标准 JSON Schema 结构，便于后续复用到校验或文档生成
 */
export const FORMATTER_OUTPUT_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "ITravelPlan",
  type: "object",
  additionalProperties: false,
  required: [
    "planName",
    "totalDays",
    "totalDistance",
    "vehicleType",
    "vehicleAdvice",
    "bestSeason",
    "essentialItems",
    "weather",
    "days",
  ],
  properties: {
    planName: { type: "string", description: "计划名称，如'新疆15天深度自驾游'" },
    totalDays: { type: "number" },
    totalDistance: { type: "number", description: "公里数，根据行程估算" },
    vehicleType: { type: "string", description: "出行方式" },
    vehicleAdvice: { type: "string", description: "出行建议/注意事项" },
    bestSeason: { type: "string", description: "推荐出行季节" },
    essentialItems: {
      type: "array",
      items: { type: "string" },
      description: "必备物品列表",
    },
    weather: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["area", "daytime", "nighttime", "clothing"],
        properties: {
          area: { type: "string" },
          daytime: {
            type: "object",
            additionalProperties: false,
            required: ["tempMax", "tempMin", "weather"],
            properties: {
              tempMax: { type: "number" },
              tempMin: { type: "number" },
              weather: { type: "string" },
            },
          },
          nighttime: {
            type: "object",
            additionalProperties: false,
            required: ["tempMax", "tempMin", "weather"],
            properties: {
              tempMax: { type: "number" },
              tempMin: { type: "number" },
              weather: { type: "string" },
            },
          },
          clothing: { type: "string" },
        },
      },
    },
    days: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "day",
          "title",
          "waypoints",
          "description",
          "accommodation",
          "foodRecommendation",
          "activities",
          "distance",
          "drivingHours",
        ],
        properties: {
          day: { type: "number" },
          title: { type: "string" },
          waypoints: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["alias", "name", "city", "province"],
              properties: {
                alias: { type: "string" },
                name: { type: "string" },
                city: { type: "string" },
                province: { type: "string" },
              },
            },
          },
          description: { type: "string" },
          accommodation: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["name", "address", "feature"],
              properties: {
                name: { type: "string" },
                address: { type: "string" },
                feature: { type: "string" },
                booking: { type: "string" },
                price: { type: "number" },
              },
            },
          },
          foodRecommendation: { type: "array", items: { type: "string" } },
          commentTips: { type: "string" },
          activities: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: [
                "name",
                "description",
                "suggestedHours",
                "ticketPriceCny",
                "openingHours",
                "images",
              ],
              properties: {
                name: { type: "string" },
                description: { type: "string" },
                suggestedHours: { type: "string" },
                ticketPriceCny: { type: "number" },
                openingHours: { type: "string" },
                images: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["description", "imgSrc"],
                    properties: {
                      description: { type: "string" },
                      imgSrc: { type: "string" },
                    },
                  },
                },
              },
            },
          },
          distance: { type: "number" },
          drivingHours: { type: "number" },
        },
      },
    },
  },
} as const

export const FORMATTER_SYSTEM_PROMPT = `你是一位专业的旅行数据格式化专家。这是整个行程规划流程的最后一步，你的任务是将所有收集到的数据组装成严格符合 ITravelPlan 接口的 JSON。

输入数据：
- routeSkeleton: 行程骨架（每天的标题、景点名称、描述、住宿、美食等）
- routeSkeleton[i].distance / routeSkeleton[i].drivingHours: 若存在，表示来自高德路线规划的真实值
- enrichedActivities: 已丰富的景点数据（含门票价格、开放时间、图片等，MVP阶段可能为空）
- enrichedWeather: 天气数据（MVP阶段为空数组）
- enrichedAccommodation: 住宿详情数据（MVP阶段可能为空）
- intent: 用户原始意图

输出要求 — 必须严格符合以下 JSON Schema：

${JSON.stringify(FORMATTER_OUTPUT_SCHEMA, null, 2)}

规则：
1. totalDistance 是所有 days.distance 的累加
2. 若 routeSkeleton 的某天包含 distance / drivingHours，days 对应字段必须优先使用这些值
3. 如果 enrichedActivities 为空，activities 的 ticketPriceCny 填 0，openingHours 填 "待查询"，images 填空数组
4. 如果 enrichedWeather 为空，weather 填一个基于目的地和月份的合理估算
5. 如果 enrichedAccommodation 为空，使用 routeSkeleton 中的 accommodation 数据
6. essentialItems 根据目的地和季节给出 5-8 个实用建议
7. 只输出纯 JSON 对象，不要有 markdown 包裹`
