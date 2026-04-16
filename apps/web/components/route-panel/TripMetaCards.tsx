import styles from "./route-panel.module.scss";
import type { ReactNode } from "react";
import type { MetaSectionKey, TripMetaCardsProps } from "./route-panel.types";

function MetaBlock({
  title,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <article className={styles.metaCard}>
      <button type="button" className={styles.metaHeader} onClick={onToggle}>
        <span>{title}</span>
        <span>{expanded ? "收起" : "展开"}</span>
      </button>
      {expanded ? <div className={styles.metaBody}>{children}</div> : null}
    </article>
  );
}

export function TripMetaCards({ plan, expanded, onToggle }: TripMetaCardsProps) {
  const toggle = (key: MetaSectionKey) => () => onToggle(key);

  return (
    <section className={styles.metaGrid}>
      <MetaBlock title="交通建议" expanded={expanded.vehicleAdvice} onToggle={toggle("vehicleAdvice")}>
        <p>{plan.vehicleAdvice}</p>
      </MetaBlock>

      <MetaBlock title="最佳季节" expanded={expanded.bestSeason} onToggle={toggle("bestSeason")}>
        <p>{plan.bestSeason}</p>
      </MetaBlock>

      <MetaBlock title="必备物品" expanded={expanded.essentials} onToggle={toggle("essentials")}>
        <ul>
          {plan.essentials.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </MetaBlock>

      <MetaBlock title="天气概览" expanded={expanded.weather} onToggle={toggle("weather")}>
        <ul className={styles.weatherList}>
          {plan.weather.map((item) => (
            <li key={item.area}>
              <strong>{item.area}</strong>
              <p>白天：{item.daytime}</p>
              <p>夜晚：{item.nighttime}</p>
              <p>{item.clothing}</p>
            </li>
          ))}
        </ul>
      </MetaBlock>
    </section>
  );
}
