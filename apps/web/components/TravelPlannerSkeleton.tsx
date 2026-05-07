import Skeleton from "react-loading-skeleton";
import { memo } from "react";
import type React from "react";
import styles from "./TravelPlannerSkeleton.module.scss";

const SKELETON_THEME = {
  baseColor: "#edf2fb",
  highlightColor: "#f8fbff",
  borderRadius: 10,
} as const;

const TravelPlannerSkeletonComponent: React.FC = () => {
  // 使用 react-loading-skeleton 统一占位风格，减少自定义骨架样式维护成本。
  return (
    <div className={styles.skeletonWrap}>
      <Skeleton
        height={60}
        baseColor={SKELETON_THEME.baseColor}
        highlightColor={SKELETON_THEME.highlightColor}
        borderRadius={SKELETON_THEME.borderRadius}
      />

      <div className={styles.skeletonGrid}>
        <Skeleton
          height={180}
          baseColor={SKELETON_THEME.baseColor}
          highlightColor={SKELETON_THEME.highlightColor}
          borderRadius={SKELETON_THEME.borderRadius}
        />
        <Skeleton
          height={180}
          baseColor={SKELETON_THEME.baseColor}
          highlightColor={SKELETON_THEME.highlightColor}
          borderRadius={SKELETON_THEME.borderRadius}
        />
        <Skeleton
          height={180}
          baseColor={SKELETON_THEME.baseColor}
          highlightColor={SKELETON_THEME.highlightColor}
          borderRadius={SKELETON_THEME.borderRadius}
        />
      </div>

      <Skeleton
        height={420}
        baseColor={SKELETON_THEME.baseColor}
        highlightColor={SKELETON_THEME.highlightColor}
        borderRadius={SKELETON_THEME.borderRadius}
      />
    </div>
  );
};

// 骨架组件为纯展示，使用 memo 保持渲染轻量。
export const TravelPlannerSkeleton = memo(TravelPlannerSkeletonComponent);
