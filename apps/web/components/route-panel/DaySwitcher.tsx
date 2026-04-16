import styles from "./route-panel.module.scss";
import type { DaySwitcherProps } from "./route-panel.types";

export function DaySwitcher({ days, activeDay, onChangeDay }: DaySwitcherProps) {
  return (
    <nav className={styles.daySwitcher} aria-label="日程切换">
      {days.map((day, index) => (
        <button
          key={day.day}
          type="button"
          className={index === activeDay ? styles.dayTabActive : styles.dayTab}
          onClick={() => onChangeDay(index)}
          aria-pressed={index === activeDay}
        >
          D{day.day}
        </button>
      ))}
    </nav>
  );
}
