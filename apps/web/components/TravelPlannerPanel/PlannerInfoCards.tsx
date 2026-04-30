import { CarFront, ChevronLeft, ChevronRight, CloudSun } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import type React from "react";
import { cn, splitWeatherSlot } from "../../lib/utils";
import type { PlannerInfoCardsProps } from "./types";
import styles from "./PlannerInfoCards.module.scss";

const SECTION_TITLE_ICON_SIZE = 18;
const WEATHER_PAGE_SIZE = 3;

function resolveWeatherMonthLabel(bestSeason: string) {
  // 天气标题使用“（7月）”形式；当无括号时直接展示原文。
  const monthMatch = bestSeason.match(/\(([^)]+)\)/);
  return monthMatch?.[1] ?? bestSeason;
}

const PlannerInfoCardsComponent: React.FC<PlannerInfoCardsProps> = ({
  plannerVehicleAdvice,
  plannerBestSeason,
  plannerWeather,
}) => {
  const [weatherPage, setWeatherPage] = useState(0);
  const weatherPageCount = Math.max(1, Math.ceil(plannerWeather.length / WEATHER_PAGE_SIZE));

  const currentWeatherItems = useMemo(() => {
    // 天气卡按页切片，每页展示固定 3 项。
    const startIndex = weatherPage * WEATHER_PAGE_SIZE;
    return plannerWeather.slice(startIndex, startIndex + WEATHER_PAGE_SIZE);
  }, [plannerWeather, weatherPage]);

  const weatherMonthLabel = useMemo(() => resolveWeatherMonthLabel(plannerBestSeason), [plannerBestSeason]);

  useEffect(() => {
    // 当天气数据变化导致页数减少时，兜底修正当前分页。
    if (weatherPage <= weatherPageCount - 1) return;
    setWeatherPage(Math.max(0, weatherPageCount - 1));
  }, [weatherPage, weatherPageCount]);

  const handlePrevWeatherPage = useCallback(() => {
    setWeatherPage((prev) => Math.max(0, prev - 1));
  }, []);

  const handleNextWeatherPage = useCallback(() => {
    setWeatherPage((prev) => Math.min(weatherPageCount - 1, prev + 1));
  }, [weatherPageCount]);

  // 天气文案解析成本虽小，但在列表渲染中做 memo 能避免重复字符串处理。
  const weatherDisplayItems = useMemo(
    () =>
      currentWeatherItems.map((item) => ({
        ...item,
        daytime: splitWeatherSlot(item.daytime),
        nighttime: splitWeatherSlot(item.nighttime),
      })),
    [currentWeatherItems],
  );

  return (
    <div className={styles.infoGrid}>
      <article className={styles.adviceCard}>
        <h3 className={styles.sectionTitle}>
          <span className={cn(styles.sectionIcon, styles.sectionIconAdvice)}>
            <CarFront size={SECTION_TITLE_ICON_SIZE} />
          </span>
          出行建议
        </h3>
        <p>{plannerVehicleAdvice}</p>
      </article>

      <article className={styles.weatherCard}>
        <div className={styles.weatherHeader}>
          <h3 className={styles.sectionTitle}>
            <span className={cn(styles.sectionIcon, styles.sectionIconWeather)}>
              <CloudSun size={SECTION_TITLE_ICON_SIZE} />
            </span>
            目的地天气（{weatherMonthLabel}）
          </h3>
          {weatherPageCount > 1 ? (
            <div className={styles.weatherPager}>
              <button
                type="button"
                className={styles.pagerBtn}
                disabled={weatherPage === 0}
                aria-label="上一页天气"
                onClick={handlePrevWeatherPage}
              >
                <ChevronLeft className={styles.pagerIcon} />
              </button>
              <span className={styles.pagerText}>
                {weatherPage + 1}/{weatherPageCount}
              </span>
              <button
                type="button"
                className={styles.pagerBtn}
                disabled={weatherPage >= weatherPageCount - 1}
                aria-label="下一页天气"
                onClick={handleNextWeatherPage}
              >
                <ChevronRight className={styles.pagerIcon} />
              </button>
            </div>
          ) : null}
        </div>
        <div className={styles.weatherGrid}>
          {weatherDisplayItems.map((item) => (
            <section key={item.area} className={styles.weatherItem}>
              <h4>{item.area}</h4>
              <div className={styles.weatherRow}>
                <span>白天</span>
                <strong>{item.daytime.temperature}</strong>
              </div>
              <p>{item.daytime.description}</p>
              <div className={styles.weatherRow}>
                <span>夜间</span>
                <strong>{item.nighttime.temperature}</strong>
              </div>
              <p>{item.nighttime.description}</p>
              <small>穿衣建议：{item.clothing}</small>
            </section>
          ))}
        </div>
      </article>
    </div>
  );
};

// 信息卡片仅依赖路线元信息，使用 memo 降低聊天区更新带来的影响。
export const PlannerInfoCards = memo(PlannerInfoCardsComponent);
