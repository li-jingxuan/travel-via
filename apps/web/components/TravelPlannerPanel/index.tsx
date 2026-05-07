import { CalendarDays, Clock3, Milestone } from "lucide-react";
import React, { memo, useEffect, useMemo, useState } from "react";
import { ROUTE_PANEL_PHASE } from "../../hooks/useChatStream";
import type { DayViewModel } from "../../types/travel-plan";
import { PlannerEmptyState } from "./PlannerEmptyState";
import { TravelPlannerSkeleton } from "../TravelPlannerSkeleton";
import { PlannerBottomPanels } from "./PlannerBottomPanels";
import { PlannerDayItinerary } from "./PlannerDayItinerary";
import { PlannerHeader } from "./PlannerHeader";
import { PlannerInfoCards } from "./PlannerInfoCards";
import type { SummaryStatItem, TravelPlannerPanelProps } from "./types";
import styles from "./TravelPlannerPanel.module.scss";

const SUMMARY_STAT_CONFIG = {
  totalDays: { label: "总天数", Icon: CalendarDays, tone: "days" },
  totalDistance: { label: "总距离", Icon: Milestone, tone: "distance" },
  drivingHours: { label: "行车时间", Icon: Clock3, tone: "duration" },
} as const;

const EMPTY_HOTEL: DayViewModel["accommodations"][number] = {
  name: "暂未提供",
  address: "暂未提供",
  feature: "暂未提供",
  images: [],
};
const EMPTY_DAYS: DayViewModel[] = [];

const TravelPlannerPanelComponent: React.FC<TravelPlannerPanelProps> = ({
  routePanelPhase,
  plan,
}) => {
  const [activeDayIndex, setActiveDayIndex] = useState(0);

  const hasRenderablePlan = Boolean(plan && plan.days.length > 0);
  const plannerDays = plan?.days ?? EMPTY_DAYS;

  useEffect(() => {
    // 当天数变化时校正激活天索引，避免越界。
    if (!plannerDays.length) return;
    if (activeDayIndex <= plannerDays.length - 1) return;
    setActiveDayIndex(0);
  }, [activeDayIndex, plannerDays]);

  const activeDay = useMemo<DayViewModel | null>(() => {
    if (!plannerDays.length) return null;
    return plannerDays[activeDayIndex] ?? plannerDays[0] ?? null;
  }, [activeDayIndex, plannerDays]);

  // 住宿卡片优先展示酒店图，活动图只作为兜底，避免语义错位。
  const featuredHotel = useMemo(
    () => activeDay?.accommodations[0] ?? EMPTY_HOTEL,
    [activeDay],
  );
  const featuredHotelImage = useMemo(() => {
    const hotelImage = featuredHotel.images[0]?.src ?? "";
    if (hotelImage) return hotelImage;
    return activeDay?.activities[0]?.images[0]?.src ?? "";
  }, [activeDay, featuredHotel.images]);

  const summaryStats = useMemo<SummaryStatItem[]>(
    () => [
      {
        key: "totalDays",
        label: SUMMARY_STAT_CONFIG.totalDays.label,
        value: `${plan?.summary.totalDays ?? 0} 天`,
        Icon: SUMMARY_STAT_CONFIG.totalDays.Icon,
        tone: SUMMARY_STAT_CONFIG.totalDays.tone,
      },
      {
        key: "totalDistance",
        label: SUMMARY_STAT_CONFIG.totalDistance.label,
        value: plan?.summary.totalDistanceText ?? "0 公里",
        Icon: SUMMARY_STAT_CONFIG.totalDistance.Icon,
        tone: SUMMARY_STAT_CONFIG.totalDistance.tone,
      },
      {
        key: "drivingHours",
        label: SUMMARY_STAT_CONFIG.drivingHours.label,
        value: activeDay?.drivingHoursText ?? "0 小时",
        Icon: SUMMARY_STAT_CONFIG.drivingHours.Icon,
        tone: SUMMARY_STAT_CONFIG.drivingHours.tone,
      },
    ],
    [activeDay?.drivingHoursText, plan?.summary.totalDays, plan?.summary.totalDistanceText],
  );

  // 主面板只负责阶段切换与业务区块编排，内部管理“天数切换/统计派生”等局部逻辑。
  if (routePanelPhase === ROUTE_PANEL_PHASE.Skeleton) {
    return (
      <section className={styles.plannerPanel}>
        <TravelPlannerSkeleton />
      </section>
    );
  }

  if (!hasRenderablePlan || !plan || !activeDay) {
    return (
      <section className={styles.plannerEmptyPanel}>
        <PlannerEmptyState />
      </section>
    );
  }

  return (
    <section className={styles.plannerPanel}>
      <PlannerHeader plannerSummary={plan.summary} plannerBestSeason={plan.bestSeason} />
      <div className={styles.plannerContent}>
        <PlannerInfoCards
          plannerVehicleAdvice={plan.vehicleAdvice}
          plannerBestSeason={plan.bestSeason}
          plannerWeather={plan.weather}
        />

        <PlannerDayItinerary
          plannerDays={plannerDays}
          activeDayIndex={activeDayIndex}
          onChangeActiveDay={setActiveDayIndex}
          activeDay={activeDay}
          featuredHotel={featuredHotel}
          featuredHotelImage={featuredHotelImage}
        />

        <PlannerBottomPanels packingChecklist={plan.essentials} summaryStats={summaryStats} />
      </div>
    </section>
  );
};

// 规划区节点较多，使用 memo 可降低聊天区更新时的无关重渲染。
export const TravelPlannerPanel = memo(TravelPlannerPanelComponent);
