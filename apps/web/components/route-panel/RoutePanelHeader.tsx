import styles from "./route-panel.module.scss";
import type { RoutePanelHeaderProps } from "./route-panel.types";

export function RoutePanelHeader({ summary }: RoutePanelHeaderProps) {
  return (
    <header className={styles.header}>
      <div>
        <p className={styles.eyebrow}>Route Plan</p>
        <h2 className={styles.title}>{summary.planName}</h2>
        <p className={styles.vehicleType}>{summary.vehicleType}</p>
      </div>
      <div className={styles.summaryPills}>
        <span>{summary.totalDays} 天</span>
        <span>{summary.totalDistanceText}</span>
      </div>
    </header>
  );
}
