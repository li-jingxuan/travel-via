import { Compass, Sparkles } from "lucide-react";
import { memo } from "react";
import type React from "react";
import styles from "./PlannerEmptyState.module.scss";

const EMPTY_STATE_HINTS = ["告诉我目的地", "补充出行天数", "描述你的偏好"] as const;

const PlannerEmptyStateComponent: React.FC = () => {
  // 空状态只表达“下一步怎么开始”，避免展示伪造行程数据误导用户。
  return (
    <section className={styles.emptyState}>
      <div className={styles.emptyBadge}>
        <Compass size={16} />
        <span>等待生成</span>
      </div>

      <h3 className={styles.emptyTitle}>还没有行程</h3>
      <p className={styles.emptyDescription}>
        在左侧输入你的出发地、目的地、天数和偏好，我会立即为你生成第一版路线规划。
      </p>

      <div className={styles.hintRow}>
        {EMPTY_STATE_HINTS.map((hint) => (
          <span key={hint} className={styles.hintChip}>
            <Sparkles size={13} />
            {hint}
          </span>
        ))}
      </div>
    </section>
  );
};

// 空状态是纯展示组件，使用 memo 防止聊天区更新时重复渲染。
export const PlannerEmptyState = memo(PlannerEmptyStateComponent);
