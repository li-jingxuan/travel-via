import type {
  ActivityViewModel,
  RawFinalPlan,
  RawTravelData,
  TravelPlanViewModel,
} from "../../types/travel-plan";
import {
  formatDistanceKm,
  formatDrivingHours,
  formatOpeningHours,
  formatTicketPrice,
  formatWeatherLine,
} from "./formatters";

function normalizeActivity(activity: RawFinalPlan["days"][number]["activities"][number]): ActivityViewModel {
  const coverImage = activity.images?.[0];

  return {
    name: activity.name,
    description: activity.description,
    suggestedHours: activity.suggestedHours,
    openingHoursText: formatOpeningHours(activity.openingHours),
    ticketText: formatTicketPrice(activity.ticketPriceCny),
    imageSrc: coverImage?.imgSrc ?? null,
    imageAlt: coverImage?.description || `${activity.name} 参考图`,
  };
}

export function normalizeFinalPlan(raw: RawTravelData): TravelPlanViewModel {
  const plan = raw.finalPlan;

  return {
    summary: {
      planName: plan.planName,
      totalDays: plan.totalDays,
      totalDistanceText: formatDistanceKm(plan.totalDistance),
      vehicleType: plan.vehicleType,
    },
    bestSeason: plan.bestSeason,
    vehicleAdvice: plan.vehicleAdvice,
    essentials: plan.essentialItems,
    weather: plan.weather.map((item) => ({
      area: item.area,
      daytime: formatWeatherLine(item.daytime.weather, item.daytime.tempMin, item.daytime.tempMax),
      nighttime: formatWeatherLine(item.nighttime.weather, item.nighttime.tempMin, item.nighttime.tempMax),
      clothing: item.clothing,
    })),
    days: plan.days.map((day) => ({
      day: day.day,
      title: day.title,
      description: day.description,
      distanceText: formatDistanceKm(day.distance),
      drivingHoursText: formatDrivingHours(day.drivingHours),
      tips: day.commentTips,
      foods: day.foodRecommendation,
      accommodations: day.accommodation,
      activities: day.activities.map(normalizeActivity),
    })),
  };
}
