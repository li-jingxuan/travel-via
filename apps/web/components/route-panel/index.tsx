"use client";

import { useMemo, useState } from "react";
import { ActivityList } from "./ActivityList";
import { DayDetailCard } from "./DayDetailCard";
import { DaySwitcher } from "./DaySwitcher";
import { RoutePanelHeader } from "./RoutePanelHeader";
import { TripMetaCards } from "./TripMetaCards";
import styles from "./route-panel.module.scss";
import type { MetaSectionKey, RoutePanelProps } from "./route-panel.types";

const defaultExpanded: Record<MetaSectionKey, boolean> = {
  vehicleAdvice: true,
  bestSeason: false,
  essentials: true,
  weather: false,
};

export function RoutePanel({ plan }: RoutePanelProps) {
  const [activeDayIndex, setActiveDayIndex] = useState(0);
  const [expandedSections, setExpandedSections] =
    useState<Record<MetaSectionKey, boolean>>(defaultExpanded);

  const activeDay = useMemo(() => {
    return plan.days[activeDayIndex] ?? plan.days[0];
  }, [activeDayIndex, plan.days]);

  function handleToggleSection(section: MetaSectionKey) {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  }

  if (!activeDay) {
    return <section className={styles.panel}>暂无行程数据</section>;
  }

  return (
    <section className={styles.panel}>
      <RoutePanelHeader summary={plan.summary} />

      <div className={styles.content}>
        <DaySwitcher days={plan.days} activeDay={activeDayIndex} onChangeDay={setActiveDayIndex} />
        <DayDetailCard day={activeDay} />
        <ActivityList activities={activeDay.activities} />
        <TripMetaCards
          plan={plan}
          expanded={expandedSections}
          onToggle={handleToggleSection}
        />
      </div>
    </section>
  );
}
