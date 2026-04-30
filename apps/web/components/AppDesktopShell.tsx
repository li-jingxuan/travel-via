"use client";

import { memo, useCallback, useEffect, useState } from "react";
import type React from "react";
import { cn } from "../lib/utils";
import { TravelSidebar } from "./TravelSidebar";
import styles from "./AppDesktopShell.module.scss";

interface AppDesktopShellProps {
  children: React.ReactNode;
}

export const SIDEBAR_AUTO_COLLAPSE_BREAKPOINT = 1500;

const AppDesktopShellComponent: React.FC<AppDesktopShellProps> = ({ children }) => {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia(`(max-width: ${SIDEBAR_AUTO_COLLAPSE_BREAKPOINT}px)`);
    const syncSidebarMode = (matches: boolean) => {
      // 屏幕宽度不足时自动收缩侧边栏，给主内容区让出空间。
      setIsSidebarCollapsed(matches);
    };

    syncSidebarMode(mediaQuery.matches);

    const handleMediaChange = (event: MediaQueryListEvent) => {
      syncSidebarMode(event.matches);
    };
    mediaQuery.addEventListener("change", handleMediaChange);

    return () => {
      mediaQuery.removeEventListener("change", handleMediaChange);
    };
  }, []);

  const handleToggleSidebar = useCallback(() => {
    // 允许用户在当前分辨率下手动切换“收缩 / 展开”状态。
    setIsSidebarCollapsed((prev) => !prev);
  }, []);

  return (
    <main className={styles.appShell}>
      <section className={cn(styles.desktopShell, isSidebarCollapsed && styles.desktopShellSidebarCollapsed)}>
        <TravelSidebar isSidebarCollapsed={isSidebarCollapsed} onToggleSidebar={handleToggleSidebar} />
        {children}
      </section>
    </main>
  );
};

// 壳层组件只依赖布局层状态，使用 memo 避免父层无关更新导致重复渲染。
export const AppDesktopShell = memo(AppDesktopShellComponent);
