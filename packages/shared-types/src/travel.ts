export interface IWeatherDay {
  tempMax: number
  tempMin: number
  weather: string
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

export interface ITravel {
  day: number
  title: string
  waypoints: string
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
  essentialItems: string[]
  weather: IWeather[]
  days: ITravel[]
}
