import { memo } from "react";
import type React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  CircleHelp, Compass, Heart, History, Map,
  PanelLeftClose, PanelLeftOpen, Route, Settings
} from "lucide-react";
import { cn } from "../lib/utils";
import styles from "./TravelSidebar.module.scss";

interface TravelSidebarProps {
  isSidebarCollapsed: boolean;
  onToggleSidebar: () => void;
}

export const SIDEBAR_SECONDARY_NAV = [
  { key: "settings", label: "设置", icon: Settings },
  { key: "help", label: "帮助与反馈", icon: CircleHelp },
] as const;

const APP_ROUTE_PATH = {
  Home: "/",
  MyItinerary: "/my-itinerary",
  Collection: "/collection",
  History: "/history",
} as const;

const SIDEBAR_PRIMARY_NAV = [
  { key: "explore", label: "行程探索", icon: Compass, path: APP_ROUTE_PATH.Home },
  { key: "trips", label: "我的行程", icon: Map, path: APP_ROUTE_PATH.MyItinerary },
  { key: "favorites", label: "收藏夹", icon: Heart, path: APP_ROUTE_PATH.Collection },
  { key: "history", label: "历史记录", icon: History, path: APP_ROUTE_PATH.History },
] as const;

function isPrimaryNavActive(currentPathname: string, navPath: string) {
  // 首页使用精确匹配，其他路径支持“同前缀子路由”高亮。
  if (navPath === APP_ROUTE_PATH.Home) {
    return currentPathname === APP_ROUTE_PATH.Home;
  }
  return currentPathname === navPath || currentPathname.startsWith(`${navPath}/`);
}

const TravelSidebarComponent: React.FC<TravelSidebarProps> = ({ isSidebarCollapsed, onToggleSidebar }) => {
  const pathname = usePathname();

  // 侧边栏组件只负责展示与折叠交互，不持有业务状态。
  return (
    <aside className={cn(styles.sidebar, isSidebarCollapsed && styles.sidebarCollapsed)}>
      <div className={styles.brandBlock}>
        <div className={styles.brandIdentity}>
          <div className={styles.brandIcon}>
            <Route className={styles.brandGlyph} />
          </div>
          {!isSidebarCollapsed ? (
            <div className={styles.brandText}>
              <h2>AI 旅行规划师</h2>
              <p>智能生成，轻松出行</p>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          className={styles.sidebarToggleBtn}
          aria-label={isSidebarCollapsed ? "展开侧边栏" : "收缩侧边栏"}
          title={isSidebarCollapsed ? "展开侧边栏" : "收缩侧边栏"}
          onClick={onToggleSidebar}
        >
          {isSidebarCollapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
        </button>
      </div>

      <button
        type="button"
        className={cn(styles.createTripBtn, isSidebarCollapsed && styles.createTripBtnCollapsed)}
        title="新建行程"
        aria-label="新建行程"
      >
        {isSidebarCollapsed ? "+" : "+ 新建行程"}
      </button>

      <nav className={styles.navGroup} aria-label="主导航">
        {SIDEBAR_PRIMARY_NAV.map((item) => {
          const isActive = isPrimaryNavActive(pathname, item.path);
          return (
          <Link
            key={item.key}
            href={item.path}
            className={cn(styles.navItem, isActive && styles.navItemActive)}
            title={item.label}
            aria-label={item.label}
            aria-current={isActive ? "page" : undefined}
          >
            <span className={styles.navIcon}>
              <item.icon size={14} />
            </span>
            {!isSidebarCollapsed ? item.label : null}
          </Link>
          );
        })}
      </nav>

      <nav className={styles.navGroupSecondary} aria-label="辅助导航">
        {SIDEBAR_SECONDARY_NAV.map((item) => (
          <button
            key={item.key}
            type="button"
            className={styles.navItem}
            title={item.label}
            aria-label={item.label}
          >
            <span className={styles.navIcon}>
              <item.icon size={14} />
            </span>
            {!isSidebarCollapsed ? item.label : null}
          </button>
        ))}
      </nav>

      <div className={cn(styles.userCard, isSidebarCollapsed && styles.userCardCollapsed)}>
        <div className={styles.avatar}>游</div>
        {!isSidebarCollapsed ? (
          <div className={styles.userMeta}>
            <strong>小旅玩家</strong>
            <span>PRO</span>
          </div>
        ) : null}
      </div>
    </aside>
  );
};

// 侧边栏在布局层长期存在，使用 memo 避免子树在无关状态变更时重复渲染。
export const TravelSidebar = memo(TravelSidebarComponent);
