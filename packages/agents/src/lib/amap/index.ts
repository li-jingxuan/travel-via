/**
 * amap 模块统一出口：
 * - 对外暴露稳定的函数与类型
 * - 内部可持续重构，不影响调用方导入路径
 */
export { fetchAmap } from "./client.js"
export { planDrivingByLocations } from "./route.js"
export { searchScenicPois, searchHotels } from "./poi.js"
export { getWeatherSnapshot } from "./weather.js"

export type {
  DrivingMetrics,
  AmapPoiCandidate,
  AmapWeatherSnapshot,
  AmapGeocodeResponse,
  AmapDrivingResponse,
  AmapPlaceTextResponseV5,
  AmapWeatherResponse,
} from "./types.js"
