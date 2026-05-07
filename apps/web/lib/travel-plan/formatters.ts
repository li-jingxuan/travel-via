export function formatDistanceKm(distance: number): string {
  if (!Number.isFinite(distance)) {
    return "--";
  }

  return `${distance.toFixed(1)} km`;
}

export function formatDrivingHours(hours: number): string {
  if (!Number.isFinite(hours)) {
    return "--";
  }

  return `${hours.toFixed(1)} h`;
}

export function formatTicketPrice(price: number): string {
  if (!Number.isFinite(price) || price < 0) {
    return "票价待确认";
  }

  return price === 0 ? "免费" : `¥${price}`;
}

export function formatOpeningHours(openingHours: string): string {
  if (!openingHours || openingHours.includes("待查询")) {
    return "营业时间待确认";
  }

  return openingHours;
}

export function formatWeatherLine(
  weather: string,
  tempMin: number,
  tempMax: number,
): string {
  if (!weather || !Number.isFinite(tempMin) || !Number.isFinite(tempMax)) {
    return "N/A";
  }

  return `${weather} · ${tempMin}-${tempMax}°C`;
}
