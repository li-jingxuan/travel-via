export interface IWeatherDay {
  tempMax: number
  tempMin: number
  weather: string
}

export type EssentialIconName =
  | "Backpack"
  | "BatteryCharging"
  | "Bug"
  | "CalendarDays"
  | "CarFront"
  | "CloudSun"
  | "Compass"
  | "Droplets"
  | "Footprints"
  | "Glasses"
  | "Heart"
  | "Image"
  | "MapPin"
  | "Paperclip"
  | "Pill"
  | "Route"
  | "Sun"
  | "Umbrella"

export interface IEssentialItem {
  name: string
  icon: EssentialIconName
}

export interface IWeather {
  area: string
  daytime: IWeatherDay
  nighttime: IWeatherDay
  clothing: string
}

export interface IAccommodation {
  name: string
  address: string
  feature: string
  booking?: string
  price?: number
}

export interface IActivityImage {
  description: string
  imgSrc: string
}

export interface IActivity {
  name: string
  description: string
  suggestedHours: string
  ticketPriceCny: number
  openingHours: string
  images: IActivityImage[]
}

export interface IWaypoint {
  alias: string
  /** 供高德 geocode /v3/geocode/geo 的 address 参数使用 */
  address: string
  city: string
  province: string
}

export interface ITravel {
  day: number
  title: string
  waypoints: IWaypoint[]
  description: string
  accommodation: IAccommodation[]
  foodRecommendation: string[]
  commentTips?: string
  activities: IActivity[]
  distance: number
  drivingHours: number
}

export interface ITravelPlan {
  planName: string
  totalDays: number
  totalDistance: number
  vehicleType: string
  vehicleAdvice: string
  bestSeason: string
  essentialItems: IEssentialItem[]
  weather: IWeather[]
  days: ITravel[]
}
