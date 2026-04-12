import type { TravelType } from "./travel-type.js"

/**
 * 内部类型定义 — Graph 中间数据结构
 *
 * 这些类型只在 Agent 内部流转，不会暴露给外部消费者。
 * 外部消费者看到的是 ITravelPlan（定义在 @repo/shared-types/travel.ts）。
 *
 * 设计思路：
 * - TravelIntent      : IntentAgent 的输出，用户原始需求的结构化表示
 * - RouteSkeletonDay  : RoutePlanner 的输出，每天的"骨架"数据（只有名称和描述）
 *                       后续 POI/Weather/Hotel Agent 会往里面填充详细数据
 *
 * 为什么不直接用 ITravel？
 * 因为 ITravel 是最终输出格式（含 ticketPriceCny、openingHours 等 API 数据），
 * 而 RouteSkeleton 是中间产物（这些字段在骨架阶段还不存在）。
 * 分开定义可以让每个 Agent 的职责更清晰：
 *   RoutePlanner 只负责"设计路线"，不用操心门票价格等细节
 *   POIAgent 只负责"填充景点详情"，不用重新设计路线
 */

/** 用户旅行意图 — IntentAgent 的输出 */
export interface TravelIntent {
  /** 目的地，如 "新疆"、"云南"、"日本关西" */
  destination: string
  /** 出发地，如 "北京"、"上海"、"广州" */
  departurePoint: string,
  /** 计划天数 */
  days: number
  /** 出行月份/季节，如 "6月"、"夏季"、"国庆期间" */
  month: string
  /** 出行方式枚举，统一由 travel-type.ts 管理 */
  travelType: TravelType
  /** 预算范围（可选） */
  budget?: string
  /** 同行人员（可选） */
  travelers?: string
  /** 特殊偏好列表（可选），如 ["摄影","美食","避人流"] */
  preferences?: string[]
}

/** 骨架阶段的活动数据 — 包含基础描述与省市信息，不含 API 查询字段 */
export interface RouteSkeletonActivity {
  name: string
  description: string
  suggestedHours: string
  /** 市级行政区（如“成都市”“乌鲁木齐市”） */
  city: string
  /** 省级行政区（如“四川省”“新疆维吾尔自治区”） */
  province: string
}

/** 骨架阶段的住宿数据 — 只有基本信息 */
export interface RouteSkeletonAccommodation {
  name: string
  address: string
  feature: string
  /** 市级行政区（如“成都市”“乌鲁木齐市”） */
  city: string
  /** 省级行政区（如“四川省”“新疆维吾尔自治区”） */
  province: string
}

/**
 * waypoint 结构化信息：
 * - alias: 简称（口语化）
 * - name: 标准地点名（用于检索）
 * - city/province: 行政区信息（用于高德 city 参数稳定化）
 */
export interface RouteWaypoint {
  alias: string
  name: string
  city: string
  province: string
}

/**
 * 单日行程骨架 — RoutePlanner 的核心输出单元
 *
 * 这是整个管线中最关键的中间数据结构。
 * 它是"半成品"——有完整的行程框架，但 activities 缺少 ticketPriceCny/openingHours/images，
 * accommodation 缺少 booking/price，weather 字段完全不存在。
 *
 * 这些缺失的数据会在 Phase 2 中由 POIAgent、WeatherAgent、HotelAgent 并行填充。
 */
export interface RouteSkeletonDay {
  /** 第几天（从 1 开始） */
  day: number
  /** 当天标题，如 "第1天 | 抵达乌鲁木齐" */
  title: string
  /**
   * 途经点（结构化 JSON 数组）：
   * - RouteWaypoint[]
   */
  waypoints: RouteWaypoint[]
  /** 当天整体描述 */
  description: string
  /** 当天的景点列表（骨架版，无门票/开放时间等详情） */
  activities: RouteSkeletonActivity[]
  /** 推荐住宿（骨架版，无价格/预订信息） */
  accommodation: RouteSkeletonAccommodation[]
  /** 当地美食推荐 */
  foodRecommendation: string[]
  /** 注意事项/穿衣建议等 */
  commentTips?: string
  /** 高德计算得到的当日总里程（公里） */
  distance?: number
  /** 高德计算得到的当日驾车时长（小时） */
  drivingHours?: number
}
