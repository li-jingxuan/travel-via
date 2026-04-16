import styles from "./route-panel.module.scss";
import type { DayDetailCardProps } from "./route-panel.types";

export function DayDetailCard({ day }: DayDetailCardProps) {
  return (
    <article className={styles.card}>
      <header className={styles.dayHeader}>
        <h3>{day.title}</h3>
        <div className={styles.dayMeta}>
          <span>{day.distanceText}</span>
          <span>{day.drivingHoursText}</span>
        </div>
      </header>
      <p className={styles.dayDescription}>{day.description}</p>
      <p className={styles.tips}>{day.tips}</p>
      <div className={styles.foods}>
        {day.foods.map((food) => (
          <span key={food}>{food}</span>
        ))}
      </div>
    </article>
  );
}
