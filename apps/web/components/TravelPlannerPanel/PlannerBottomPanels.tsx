import type { LucideIcon } from "lucide-react";
import {
  Backpack,
  BatteryCharging,
  CalendarDays,
  CarFront,
  CloudSun,
  Compass,
  Bug,
  Droplets,
  Footprints,
  Glasses,
  Heart,
  Image,
  MapPin,
  Paperclip,
  Pill,
  Route,
  Sun,
  Umbrella,
} from "lucide-react";
import { memo } from "react";
import type React from "react";
import { cn } from "../../lib/utils";
import type { EssentialIconName } from "../../types/travel-plan";
import type { PlannerBottomPanelsProps } from "./types";
import styles from "./PlannerBottomPanels.module.scss";

const CHECKLIST_ITEM_ICON_SIZE = 12;
const SUMMARY_STAT_ICON_SIZE = 13;

type ChecklistIconTone = "sun" | "sky" | "green" | "indigo" | "blue" | "cyan" | "violet" | "rose" | "slate";

type SummaryTone = PlannerBottomPanelsProps["summaryStats"][number]["tone"];

const SUMMARY_STAT_TONE_CLASS_MAP: Record<SummaryTone, string> = {
  days: styles.summaryStatIconDays ?? "",
  distance: styles.summaryStatIconDistance ?? "",
  duration: styles.summaryStatIconDuration ?? "",
};

const ESSENTIAL_ICON_COMPONENT_MAP: Record<EssentialIconName, LucideIcon> = {
  Backpack,
  BatteryCharging,
  Bug,
  CalendarDays,
  CarFront,
  CloudSun,
  Compass,
  Droplets,
  Footprints,
  Glasses,
  Heart,
  Image,
  MapPin,
  Paperclip,
  Pill,
  Route,
  Sun,
  Umbrella,
};

const ESSENTIAL_ICON_TONE_MAP: Record<EssentialIconName, ChecklistIconTone> = {
  Backpack: "slate",
  BatteryCharging: "violet",
  Bug: "green",
  CalendarDays: "blue",
  CarFront: "indigo",
  CloudSun: "sky",
  Compass: "cyan",
  Droplets: "cyan",
  Footprints: "indigo",
  Glasses: "sky",
  Heart: "rose",
  Image: "blue",
  MapPin: "green",
  Paperclip: "slate",
  Pill: "rose",
  Route: "indigo",
  Sun: "sun",
  Umbrella: "blue",
};

const ESSENTIAL_ICON_WHITELIST = new Set<EssentialIconName>(Object.keys(ESSENTIAL_ICON_COMPONENT_MAP) as EssentialIconName[]);

function isEssentialIconName(value: unknown): value is EssentialIconName {
  // Web 层是唯一兜底：若后端返回了非法 icon，这里统一回退为 Backpack。
  return typeof value === "string" && ESSENTIAL_ICON_WHITELIST.has(value as EssentialIconName);
}

// TODO 这里与ESSENTIAL_ICON_TONE_MAP数量对不上
const CHECKLIST_ICON_TONE_CLASS_MAP: Record<ChecklistIconTone, string> = {
  sun: styles.checklistChipIconSun ?? "",
  sky: styles.checklistChipIconSky ?? "",
  green: styles.checklistChipIconGreen ?? "",
  indigo: styles.checklistChipIconIndigo ?? "",
  blue: styles.checklistChipIconBlue ?? "",
  cyan: styles.checklistChipIconCyan ?? "",
  violet: styles.checklistChipIconViolet ?? "",
  rose: styles.checklistChipIconRose ?? "",
  slate: styles.checklistChipIconSlate ?? "",
};

const PlannerBottomPanelsComponent: React.FC<PlannerBottomPanelsProps> = ({ packingChecklist, summaryStats }) => {
  const checklistItems = packingChecklist.length ? packingChecklist : [{ name: "N/A", icon: "Backpack" as const }];

  return (
    <div className={styles.bottomGrid}>
      <section className={styles.checklistPanel}>
        <header>
          <h4 className={styles.panelTitle}>出行必备清单</h4>
          <button type="button">查看全部</button>
        </header>
        <div className={styles.checklistChips}>
          {checklistItems.map((item) => {
            const normalizedIconName = isEssentialIconName(item.icon) ? item.icon : "Backpack";
            const ChecklistIcon = ESSENTIAL_ICON_COMPONENT_MAP[normalizedIconName] ?? Backpack;
            const iconTone = ESSENTIAL_ICON_TONE_MAP[normalizedIconName] ?? "slate";
            return (
              <span key={`${item.name}-${normalizedIconName}`} className={styles.checklistChip}>
                <span className={cn(styles.checklistChipIcon, CHECKLIST_ICON_TONE_CLASS_MAP[iconTone])}>
                  <ChecklistIcon size={CHECKLIST_ITEM_ICON_SIZE} />
                </span>
                <span>{item.name}</span>
              </span>
            );
          })}
        </div>
      </section>

      <section className={styles.tripSummaryPanel}>
        <h4 className={styles.panelTitle}>行程总览</h4>
        <div className={styles.summaryStats}>
          {summaryStats.map((item) => (
            <div key={item.key} className={styles.summaryStatItem}>
              <span className={styles.summaryStatLabel}>
                <item.Icon
                  className={cn(styles.summaryStatIcon, SUMMARY_STAT_TONE_CLASS_MAP[item.tone])}
                  size={SUMMARY_STAT_ICON_SIZE}
                />
                {item.label}
              </span>
              <span className={styles.summaryStatsValue}>{item.value}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

// 底部清单与统计均为纯展示，可通过 memo 减少重复渲染。
export const PlannerBottomPanels = memo(PlannerBottomPanelsComponent);
