import styles from "./route-panel.module.scss";
import type { ActivityListProps } from "./route-panel.types";

export function ActivityList({ activities }: ActivityListProps) {
  return (
    <section className={styles.card}>
      <h3 className={styles.sectionTitle}>活动安排</h3>
      <ul className={styles.activityList}>
        {activities.map((activity) => (
          <li key={activity.name} className={styles.activityItem}>
            <div className={styles.activityImageWrap}>
              {activity.imageSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={activity.imageSrc} alt={activity.imageAlt} className={styles.activityImage} />
              ) : (
                <div className={styles.activityImageFallback}>无图</div>
              )}
            </div>
            <div className={styles.activityContent}>
              <h4>{activity.name}</h4>
              <p>{activity.description}</p>
              <div className={styles.activityMeta}>
                <span>{activity.suggestedHours}</span>
                <span>{activity.openingHoursText}</span>
                <span>{activity.ticketText}</span>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
