import { memo } from "react";
import type React from "react";
import { cn } from "../../lib/utils";
import type { PlannerDayItineraryProps } from "./types";
import styles from "./PlannerDayItinerary.module.scss";

const ACTIVITY_RATING_TEXT = {
  first: "4.9",
  fallback: "4.8",
} as const;
const DEFAULT_ROUTE_WAYPOINT = {
  name: "N/A",
  address: "N/A",
} as const;

const PlannerDayItineraryComponent: React.FC<PlannerDayItineraryProps> = ({
  plannerDays,
  activeDayIndex,
  onChangeActiveDay,
  activeDay,
  featuredHotel,
  featuredHotelImage,
}) => {
  // 路线节点优先使用当日真实数据；当接口缺失时展示 N/A 占位，避免空白区域。
  const routeWaypoints = activeDay.waypoints?.length ? activeDay.waypoints : [DEFAULT_ROUTE_WAYPOINT];

  return (
    <section className={styles.tripContentShell}>
      <div className={styles.dayTabs}>
        {plannerDays.map((day, index) => (
          <button
            key={`${day.day}-${day.title}`}
            type="button"
            className={cn(styles.dayTab, index === activeDayIndex && styles.dayTabActive)}
            onClick={() => onChangeActiveDay(index)}
          >
            第{day.day}天
          </button>
        ))}
      </div>

      <div className={styles.dayGrid}>
        <aside className={styles.routeAside}>
          <section className={styles.routeBlock}>
            <h4>途经点（行程路线）</h4>
            <ul className={styles.routeList}>
              {routeWaypoints.map((point) => (
                <li key={`${point.name}-${point.address}`}>
                  <div className={styles.routeDot} />
                  <div>
                    <p className={styles.pointName}>{point.name}</p>
                    <p>{point.address}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className={cn(styles.routeBlock, styles.overviewBlock)}>
            <h4>当日概览</h4>
            <div className={styles.overviewList}>
              <div>
                <span>行程主题</span>
                <span className={styles.activeDayText}>{activeDay.title}</span>
              </div>
              <div>
                <span>总距离</span>
                <span className={styles.activeDayText}>{activeDay.distanceText}</span>
              </div>
              <div>
                <span>行车时间</span>
                <span className={styles.activeDayText}>{activeDay.drivingHoursText}</span>
              </div>
              <div>
                <span>游玩时长</span>
                <span className={styles.activeDayText}>约 4 小时</span>
              </div>
            </div>
          </section>

          <section className={styles.routeBlock}>
            <h4>美食推荐</h4>
            <ul className={styles.foodList}>
              {activeDay.foods.map((food) => (
                <li key={food}>{food}</li>
              ))}
            </ul>
          </section>
        </aside>

        <div className={styles.dayMainShell}>
          <header className={styles.dayHeader}>
            <div>
              <h3>
                第{activeDay.day}天 ｜ {activeDay.title}
              </h3>
              <p>{activeDay.description}</p>
            </div>
            {/* <button type="button" className={styles.collapseBtn}>
              收起
            </button> */}
          </header>

          <div className={styles.dayMainGrid}>
            <section className={styles.dayMain}>
              <div className={styles.spotSection}>
                <h4>景点推荐</h4>
                <div className={styles.spotList}>
                  {activeDay.activities.slice(0, 2).map((activity, index) => (
                    <article key={activity.name} className={styles.spotItem}>
                      <div className={styles.spotImageWrap}>
                        {activity.images[0]?.src ? (
                          // 这里先用原生 img 兼容动态外链图，后续可统一切换到 next/image。
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={activity.images[0].src}
                            alt={activity.images[0].alt || activity.name}
                            className={styles.spotImage}
                          />
                        ) : (
                          <div className={styles.spotImagePlaceholder}>暂无图片</div>
                        )}
                      </div>
                      <div className={styles.spotMeta}>
                        <h5>
                          {activity.name}
                          <span className={styles.ratingTag}>
                            ★ {index === 0 ? ACTIVITY_RATING_TEXT.first : ACTIVITY_RATING_TEXT.fallback}
                          </span>
                        </h5>
                        <p>{activity.description}</p>
                        {/* 统计信息按“标题在上、值在下”的两行布局，贴近设计稿信息层级。 */}
                        <div className={styles.spotStats}>
                          <div className={styles.spotStatItem}>
                            <span className={styles.spotStatLabel}>建议游玩</span>
                            <strong className={styles.spotStatValue}>{activity.suggestedHours}</strong>
                          </div>
                          <div className={styles.spotStatItem}>
                            <span className={styles.spotStatLabel}>门票</span>
                            <strong className={styles.spotStatValue}>{activity.ticketText}</strong>
                          </div>
                          <div className={styles.spotStatItem}>
                            <span className={styles.spotStatLabel}>开放时间</span>
                            <strong className={styles.spotStatValue}>{activity.openingHoursText}</strong>
                          </div>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>

              <footer className={styles.tipBox}>
                <strong>小贴士</strong>
                <p>{activeDay.tips}</p>
              </footer>
            </section>

            <aside className={styles.hotelPanel}>
              <h4>住宿推荐</h4>
              <div className={styles.hotelImageWrap}>
                {featuredHotelImage ? (
                  // 这里先用原生 img 兼容动态外链图，后续可统一切换到 next/image。
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={featuredHotelImage} alt={featuredHotel?.name ?? "酒店图片"} className={styles.hotelImage} />
                ) : (
                  <div className={styles.hotelImagePlaceholder}>酒店图片占位</div>
                )}
              </div>
              <h5>{featuredHotel?.name ?? "暂未提供"}</h5>
              <p>{featuredHotel?.feature ?? "暂未提供"}</p>
              <small>{featuredHotel?.address ?? "暂未提供"}</small>
            </aside>
          </div>
        </div>
      </div>
    </section>
  );
};

// 日程区 DOM 体量较大，memo 可显著减少无关重渲染成本。
export const PlannerDayItinerary = memo(PlannerDayItineraryComponent);
