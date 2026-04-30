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

const ESSENTIAL_ICON_WHITELIST = [
  "Backpack",
  "BatteryCharging",
  "Bug",
  "CalendarDays",
  "CarFront",
  "CloudSun",
  "Compass",
  "Droplets",
  "Footprints",
  "Glasses",
  "Heart",
  "Image",
  "MapPin",
  "Paperclip",
  "Pill",
  "Route",
  "Sun",
  "Umbrella",
] as const

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
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "icon"],
        properties: {
          name: { type: "string" },
          icon: {
            type: "string",
            enum: ESSENTIAL_ICON_WHITELIST,
          },
        },
      },
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
    }
  },
} as const

// days: {
//   type: "array",
//     items: {
//     type: "object",
//       additionalProperties: false,
//         required: [
//           "day",
//           "title",
//           "waypoints",
//           "description",
//           "accommodation",
//           "foodRecommendation",
//           "activities",
//           "distance",
//           "drivingHours",
//         ],
//           properties: {
//       day: { type: "number" },
//       title: { type: "string" },
//       waypoints: {
//         type: "array",
//           items: {
//           type: "object",
//             additionalProperties: false,
//               required: ["alias", "address", "city", "province"],
//                 properties: {
//             alias: { type: "string" },
//             address: { type: "string", description: "可直接用于高德 geocode 的 address 参数" },
//             city: { type: "string" },
//             province: { type: "string" },
//           },
//         },
//       },
//       description: { type: "string" },
//       accommodation: {
//         type: "array",
//           items: {
//           type: "object",
//             additionalProperties: false,
//               required: ["name", "address", "feature"],
//                 properties: {
//             name: { type: "string" },
//             address: { type: "string" },
//             feature: { type: "string" },
//             booking: { type: "string" },
//             price: { type: "number" },
//           },
//         },
//       },
//       foodRecommendation: { type: "array", items: { type: "string" } },
//       commentTips: { type: "string", description: "额外的评论或建议(可选)" },
//       activities: {
//         type: "array",
//           items: {
//           type: "object",
//             additionalProperties: false,
//               required: [
//                 "name",
//                 "description",
//                 "suggestedHours",
//                 "ticketPriceCny",
//                 "openingHours",
//                 "images",
//               ],
//                 properties: {
//             name: { type: "string" },
//             description: { type: "string" },
//             suggestedHours: { type: "string" },
//             ticketPriceCny: { type: "number" },
//             openingHours: { type: "string" },
//             images: {
//               type: "array",
//                 items: {
//                 type: "object",
//                   additionalProperties: false,
//                     required: ["description", "imgSrc"],
//                       properties: {
//                   description: { type: "string" },
//                   imgSrc: { type: "string" },
//                 },
//               },
//             },
//           },
//         },
//       },
//       distance: { type: "number" },
//       drivingHours: { type: "number" },
//     },
//   },
// },

function stripDescriptionsDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripDescriptionsDeep)
  }

  if (!value || typeof value !== "object") {
    return value
  }

  const next: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value)) {
    if (key === "description") continue
    next[key] = stripDescriptionsDeep(child)
  }
  return next
}

const FORMATTER_OUTPUT_SCHEMA_COMPACT = JSON.stringify(
  stripDescriptionsDeep(FORMATTER_OUTPUT_SCHEMA),
)

export const FORMATTER_SYSTEM_PROMPT = `你是一位专业的旅行数据格式化专家。这是整个行程规划流程的最后一步，你的任务是填充 ITravelPlan 接口的 JSON。

输出要求 — 必须严格符合以下 JSON Schema：

${FORMATTER_OUTPUT_SCHEMA_COMPACT}

规则：
1. essentialItems 根据目的地和季节给出 5-8 个实用建议
2. essentialItems[].icon 只能从以下白名单中选择：${ESSENTIAL_ICON_WHITELIST.join(", ")}
3. 不确定图标时优先使用 Backpack，不要自造图标名
4. 只输出纯 JSON 对象，不要有 markdown 包裹
5. 禁止输出 schema、解释文字、注释或额外键
6. weather 字段根据用户的出行月份给出参考值
7. vehicleAdvice、essentialItems 等字段需要根据用户的 intent 、行程内容和形成季节进行合理补全，不要留空或写占位符
8. totalDistance 是行程中每天 distance 字段的累加值，单位是公里
`
