import type { DayViewModel, TravelPlanViewModel } from "../../types/travel-plan";
import type { EssentialItem } from "../../types/travel-plan";
import type { RoutePanelPhaseType } from "../../hooks/useChatStream";
import type { LucideIcon } from "lucide-react";

export interface SummaryStatItem {
  key: string;
  label: string;
  value: string;
  Icon: LucideIcon;
  tone: "days" | "distance" | "duration";
}

export interface TravelPlannerPanelProps {
  routePanelPhase: RoutePanelPhaseType;
  plan: TravelPlanViewModel | null;
}

export interface PlannerHeaderProps {
  plannerSummary: TravelPlanViewModel["summary"];
  plannerBestSeason: string;
}

export interface PlannerInfoCardsProps {
  plannerVehicleAdvice: string;
  plannerBestSeason: string;
  plannerWeather: TravelPlanViewModel["weather"];
}

export interface PlannerDayItineraryProps {
  plannerDays: DayViewModel[];
  activeDayIndex: number;
  onChangeActiveDay: (index: number) => void;
  activeDay: DayViewModel;
  featuredHotel: DayViewModel["accommodations"][number] | null;
  featuredHotelImage: string;
}

export interface PlannerBottomPanelsProps {
  packingChecklist: EssentialItem[];
  summaryStats: SummaryStatItem[];
}
