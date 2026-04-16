import type { DayViewModel, TravelPlanViewModel } from "../../types/travel-plan";

export type MetaSectionKey = "vehicleAdvice" | "bestSeason" | "essentials" | "weather";

export interface RoutePanelProps {
  plan: TravelPlanViewModel;
}

export interface RoutePanelHeaderProps {
  summary: TravelPlanViewModel["summary"];
}

export interface DaySwitcherProps {
  days: DayViewModel[];
  activeDay: number;
  onChangeDay: (index: number) => void;
}

export interface DayDetailCardProps {
  day: DayViewModel;
}

export interface ActivityListProps {
  activities: DayViewModel["activities"];
}

export interface TripMetaCardsProps {
  plan: TravelPlanViewModel;
  expanded: Record<MetaSectionKey, boolean>;
  onToggle: (key: MetaSectionKey) => void;
}
