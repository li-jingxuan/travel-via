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
  | "Umbrella";

export interface EssentialItem {
  name: string;
  icon: EssentialIconName;
}

export interface RawTravelData {
  finalPlan: RawFinalPlan;
  errors?: unknown[];
  needUserInput?: boolean;
  finishedAt?: number | string;
}

export interface RawFinalPlan {
  planName: string;
  totalDays: number;
  totalDistance: number;
  vehicleType: string;
  vehicleAdvice: string;
  bestSeason: string;
  essentialItems: EssentialItem[];
  weather: RawWeather[];
  days: RawDayPlan[];
}

export interface RawWeather {
  area: string;
  daytime: RawWeatherSlot;
  nighttime: RawWeatherSlot;
  clothing: string;
}

export interface RawWeatherSlot {
  tempMax: number;
  tempMin: number;
  weather: string;
}

export interface RawDayPlan {
  day: number;
  title: string;
  waypoints: RawWaypoint[];
  description: string;
  accommodation: RawAccommodation[];
  foodRecommendation: string[];
  commentTips: string;
  activities: RawActivity[];
  distance: number;
  drivingHours: number;
}

export interface RawWaypoint {
  alias: string;
  address: string;
  city: string;
  province: string;
}

export interface RawAccommodation {
  name: string;
  address: string;
  feature: string;
  images: RawImage[];
}

export interface RawActivity {
  name: string;
  description: string;
  suggestedHours: string;
  ticketPriceCny: number;
  openingHours: string;
  images: RawImage[];
}

export interface RawImage {
  description: string;
  imgSrc: string;
}

export interface TravelPlanViewModel {
  summary: {
    planName: string;
    totalDays: number;
    totalDistanceText: string;
    vehicleType: string;
  };
  bestSeason: string;
  vehicleAdvice: string;
  essentials: EssentialItem[];
  weather: Array<{
    area: string;
    daytime: string;
    nighttime: string;
    clothing: string;
  }>;
  days: DayViewModel[];
}

export interface DayViewModel {
  day: number;
  title: string;
  description: string;
  waypoints: Array<{
    name: string;
    address: string;
  }>;
  distanceText: string;
  drivingHoursText: string;
  tips: string;
  foods: string[];
  accommodations: Array<{
    name: string;
    address: string;
    feature: string;
    images: Array<{
      src: string;
      alt: string;
    }>;
  }>;
  activities: ActivityViewModel[];
}

export interface ActivityViewModel {
  name: string;
  description: string;
  suggestedHours: string;
  openingHoursText: string;
  ticketText: string;
  images: Array<{
    src: string;
    alt: string;
  }>;
}
