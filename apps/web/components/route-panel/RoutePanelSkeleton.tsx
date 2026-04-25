import Skeleton, { SkeletonTheme } from "react-loading-skeleton";
import styles from "./route-panel.module.scss";

const dayTabs = Array.from({ length: 5 });
const activities = Array.from({ length: 3 });

export function RoutePanelSkeleton() {
  return (
    <SkeletonTheme
      baseColor="rgba(203, 224, 240, 0.72)"
      highlightColor="rgba(247, 252, 255, 0.96)"
      borderRadius={10}
    >
      <section
        className={styles.panel}
        aria-busy="true"
        aria-label="正在生成路线规划"
      >
        {/* 顶部骨架保持与真实 RoutePanelHeader 接近，避免加载完成时布局跳动。 */}
        <header className={styles.header}>
          <div className={styles.skeletonHeaderMain}>
            <Skeleton width={82} height={12} />
            <Skeleton width="min(320px, 56vw)" height={25} />
            <Skeleton width={128} height={14} />
          </div>

          <div className={styles.summaryPills}>
            <Skeleton width={58} height={28} />
            <Skeleton width={92} height={28} />
          </div>
        </header>

        <div className={styles.content}>
          {/* 主体骨架按“天数切换 -> 当日概览 -> 活动列表 -> 附加信息”的真实阅读顺序排布。 */}
          <div className={styles.daySwitcher} aria-hidden="true">
            {dayTabs.map((_, index) => (
              <Skeleton key={index} width={58} height={30} />
            ))}
          </div>

          <article className={styles.card}>
            <div className={styles.skeletonDayHeader}>
              <Skeleton width="58%" height={20} />
              <Skeleton width={132} height={22} />
            </div>
            <div className={styles.skeletonStack}>
              <Skeleton width="100%" />
              <Skeleton width="92%" />
              <Skeleton width="74%" />
            </div>
            <div className={styles.skeletonFoodRow}>
              <Skeleton width={58} height={24} />
              <Skeleton width={72} height={24} />
              <Skeleton width={66} height={24} />
            </div>
          </article>

          <article className={styles.card}>
            <Skeleton width={96} height={18} />
            <div className={styles.skeletonActivityList}>
              {activities.map((_, index) => (
                <div key={index} className={styles.skeletonActivityItem}>
                  <Skeleton height={86} />
                  <div className={styles.skeletonStack}>
                    <Skeleton width="46%" height={16} />
                    <Skeleton width="100%" />
                    <Skeleton width="86%" />
                    <Skeleton width="68%" />
                  </div>
                </div>
              ))}
            </div>
          </article>

          <div className={styles.skeletonMetaGrid}>
            <Skeleton height={92} />
            <Skeleton height={92} />
          </div>
        </div>
      </section>
    </SkeletonTheme>
  );
}
