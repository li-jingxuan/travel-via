/**
 * 高德地理编码响应（裁剪版）。
 * 仅保留当前业务链路需要的字段，避免类型噪声。
 */
export interface AmapGeocodeResponse {
  status?: string
  info?: string
  infocode?: string
  geocodes?: Array<{ location?: string }>
}

/**
 * 高德驾车路径响应（裁剪版）。
 */
export interface AmapDrivingResponse {
  status?: string
  info?: string
  infocode?: string
  route?: {
    paths?: Array<{
      distance?: string
      duration?: string
    }>
  }
}

/**
 * 高德 v5 文本检索响应（裁剪版）。
 * 当前只使用 business 作为评分/消费/营业时间来源。
 */
export interface AmapPlaceTextResponseV5 {
  status?: string
  info?: string
  infocode?: string
  pois?: Array<{
    name?: string
    address?: string
    type?: string
    business?: {
      rating?: string
      cost?: string
      opentime_today?: string
    }
    photos?: Array<{
      title?: string
      url?: string
    }>
  }>
}

/**
 * 高德天气响应（裁剪版）。
 */
export interface AmapWeatherResponse {
  status?: string
  info?: string
  infocode?: string
  forecasts?: Array<{
    city?: string
    casts?: Array<{
      dayweather?: string
      nightweather?: string
      daytemp?: string
      nighttemp?: string
    }>
  }>
}

/** 统一后的驾车指标（公里/小时）。 */
export interface DrivingMetrics {
  distanceKm: number
  drivingHours: number
}

/** 统一后的 POI 候选结构（景点与酒店共用）。 */
export interface AmapPoiCandidate {
  name: string
  address: string
  rating: number | null
  avgCostCny: number | null
  openingHours: string | null
  type: string | null
  images: Array<{
    description: string
    imgSrc: string
  }>
}

/** 统一后的天气快照结构。 */
export interface AmapWeatherSnapshot {
  area: string
  dayWeather: string
  nightWeather: string
  tempMax: number
  tempMin: number
  clothing: string
}
