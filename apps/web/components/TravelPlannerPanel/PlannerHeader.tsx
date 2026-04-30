import { Download, Heart, Save, Share2 } from "lucide-react";
import { memo } from "react";
import type React from "react";
import { cn } from "../../lib/utils";
import type { PlannerHeaderProps } from "./types";
import styles from "./PlannerHeader.module.scss";

const PLANNER_ACTIONS = [
  { key: "share", label: "分享行程" },
  { key: "export", label: "导出行程" },
  { key: "favorite", label: "收藏" },
  { key: "save", label: "保存行程", emphasized: true },
] as const;

const PLANNER_ACTION_ICON_MAP = {
  share: Share2,
  export: Download,
  favorite: Heart,
  save: Save,
} as const;

function buildMetaPills(planName: string, totalDays: number, vehicleType: string, totalDistanceText: string, bestSeason: string) {
  // 顶部关键指标统一由这里生成，保证展示结构一致。
  return [
    { key: "days", label: `${totalDays} 天` },
    { key: "vehicle", label: vehicleType },
    { key: "distance", label: `总距离 ${totalDistanceText}` },
    { key: "season", label: bestSeason },
  ] as const;
}

const PlannerHeaderComponent: React.FC<PlannerHeaderProps> = ({ plannerSummary, plannerBestSeason }) => {
  const plannerMetaPills = buildMetaPills(
    plannerSummary.planName,
    plannerSummary.totalDays,
    plannerSummary.vehicleType,
    plannerSummary.totalDistanceText,
    plannerBestSeason,
  );

  // 顶部区域统一承载标题、操作和关键标签，避免主面板继续膨胀。
  return (
    <header className={styles.plannerHeader}>
      <div className={styles.planTitleRow}>
        <h2>{plannerSummary.planName}</h2>
        <div className={styles.actionRow}>
          {PLANNER_ACTIONS.map((action) => {
            // 通过 in 判断读取可选字段，避免联合类型上的属性访问报错。
            const isPrimary = "emphasized" in action && Boolean(action.emphasized);
            const ActionIcon = PLANNER_ACTION_ICON_MAP[action.key as keyof typeof PLANNER_ACTION_ICON_MAP] ?? Share2;
            return (
              <button
                key={action.key}
                type="button"
                className={cn(styles.actionBtn, isPrimary && styles.actionBtnPrimary)}
              >
                <ActionIcon className={styles.actionIcon} />
                {action.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className={styles.metaPillRow}>
        {plannerMetaPills.map((pill) => (
          <span key={pill.key} className={styles.metaPill}>
            {pill.label}
          </span>
        ))}
      </div>
    </header>
  );
};

// 头部是纯展示节点，使用 memo 降低无关更新带来的重渲染。
export const PlannerHeader = memo(PlannerHeaderComponent);
