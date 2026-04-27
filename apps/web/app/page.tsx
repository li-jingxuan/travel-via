"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MarkdownText } from "../components/chat/MarkdownText";
import { useChatStream } from "../hooks/useChatStream";
import type { DayViewModel, TravelPlanViewModel } from "../types/travel-plan";
import {
  CHAT_INPUT_PLACEHOLDER,
  DAY_ROUTE_WAYPOINTS,
  DEFAULT_QUICK_PROMPTS,
  INPUT_TOOLBAR_ACTIONS,
  PACKING_CHECKLIST,
  PLAN_MOCK_BEST_SEASON,
  PLAN_MOCK_DAYS,
  PLAN_MOCK_SUMMARY,
  PLAN_MOCK_VEHICLE_ADVICE,
  PLAN_MOCK_WEATHER,
  PLANNER_ACTIONS,
  QUERY_KEY,
  ROLE_LABEL_MAP,
  SIDEBAR_PRIMARY_NAV,
  SIDEBAR_SECONDARY_NAV,
  STATUS_TEXT,
} from "./page.constants";
import styles from "./page.module.scss";

const ROUTE_PANEL_PHASE = {
  Skeleton: "skeleton",
  Plan: "plan",
} as const;

const CHAT_PLACEHOLDER_SUMMARY = "你可以告诉我偏好，我可以帮你调整行程：";
const SIDEBAR_AUTO_COLLAPSE_BREAKPOINT = 1500;

function cn(...names: Array<string | false | null | undefined>) {
  return names.filter(Boolean).join(" ");
}

function resolveRoleLabel(role: string) {
  // 统一角色文案映射，避免在 JSX 内散落魔法字符串。
  if (role in ROLE_LABEL_MAP) {
    return ROLE_LABEL_MAP[role as keyof typeof ROLE_LABEL_MAP];
  }
  return ROLE_LABEL_MAP.assistant;
}

function splitWeatherSlot(value: string) {
  // 天气文案优先匹配到完整温度区间（如“30 ~ 38°C”），避免被空格截断。
  const weatherMatch = value.match(/^(.+?°C)\s*(.*)$/);
  if (weatherMatch) {
    const [, matchedTemperature = value, matchedDescription = ""] = weatherMatch;
    return {
      temperature: matchedTemperature.trim(),
      description: matchedDescription.trim(),
    };
  }

  const [temperature = value, ...rest] = value.split(" ");
  return {
    temperature,
    description: rest.join(" "),
  };
}

function resolveWeatherMonthLabel(bestSeason: string) {
  // 设计稿天气标题使用“（7月）”形式，这里从“夏季（7月）”中提取括号内容。
  const monthMatch = bestSeason.match(/\(([^)]+)\)/);
  return monthMatch ? monthMatch[1] : bestSeason;
}

function buildMetaPills(
  summary: TravelPlanViewModel["summary"],
  bestSeason: string,
) {
  // 顶部关键指标统一由这里生成，保证真实数据与 mock 的展示结构一致。
  return [
    { key: "days", label: `${summary.totalDays} 天` },
    { key: "vehicle", label: summary.vehicleType },
    { key: "distance", label: `总距离 ${summary.totalDistanceText}` },
    { key: "season", label: bestSeason },
  ] as const;
}

function getPrimaryAccommodation(day: DayViewModel) {
  return day.accommodations[0] ?? PLAN_MOCK_DAYS[0]!.accommodations[0]!;
}

function getPrimaryActivityImage(day: DayViewModel) {
  return day.activities[0]?.images[0]?.src ?? PLAN_MOCK_DAYS[0]!.activities[0]?.images[0]?.src ?? "";
}

export default function Home() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialSessionId = searchParams.get(QUERY_KEY.SessionId)?.trim() || undefined;

  // 输入框只维护当前草稿文本，消息与行程状态由 useChatStream 托管。
  const [inputValue, setInputValue] = useState("");
  const [activeDayIndex, setActiveDayIndex] = useState(0);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  const {
    messages,
    progressNodes,
    plan,
    routePanelPhase,
    needUserInput,
    clarification,
    loading,
    statusLabel,
    sendMessage,
  } = useChatStream({
    initialSessionId,
    onSessionIdChange: (nextSessionId) => {
      if (!nextSessionId) return;

      // 将会话 ID 同步到地址栏，保证刷新后仍可延续同一会话上下文。
      const nextParams = new URLSearchParams(searchParams.toString());
      if (nextParams.get(QUERY_KEY.SessionId) === nextSessionId) return;
      nextParams.set(QUERY_KEY.SessionId, nextSessionId);
      router.replace(`${pathname}?${nextParams.toString()}`);
    },
  });

  const usingMockPlan = !plan;
  const plannerSummary = plan?.summary ?? PLAN_MOCK_SUMMARY;
  const plannerBestSeason = plan?.bestSeason || PLAN_MOCK_BEST_SEASON;
  const plannerVehicleAdvice = plan?.vehicleAdvice || PLAN_MOCK_VEHICLE_ADVICE;
  const plannerWeather = plan?.weather?.length ? plan.weather : PLAN_MOCK_WEATHER;
  const plannerDays = plan?.days?.length ? plan.days : PLAN_MOCK_DAYS;

  const plannerMetaPills = useMemo(
    () => buildMetaPills(plannerSummary, plannerBestSeason),
    [plannerBestSeason, plannerSummary],
  );
  const weatherMonthLabel = useMemo(
    () => resolveWeatherMonthLabel(plannerBestSeason),
    [plannerBestSeason],
  );

  const activeDay = plannerDays[activeDayIndex] ?? plannerDays[0] ?? PLAN_MOCK_DAYS[0]!;
  const featuredHotel = getPrimaryAccommodation(activeDay);
  const featuredHotelImage = getPrimaryActivityImage(activeDay);
  const plannerTagText = usingMockPlan
    ? routePanelPhase === ROUTE_PANEL_PHASE.Skeleton
      ? statusLabel
      : STATUS_TEXT.MockTag
    : statusLabel;

  // 新消息发送/接收后将滚动区域保持在底部，避免用户手动追踪。
  useEffect(() => {
    const node = chatScrollRef.current;
    if (!node) return;
    requestAnimationFrame(() => {
      node.scrollTop = node.scrollHeight;
    });
  }, [messages, progressNodes, needUserInput]);

  // 当天数变化时校正激活天索引，避免越界。
  useEffect(() => {
    if (!plannerDays.length) return;
    if (activeDayIndex <= plannerDays.length - 1) return;
    setActiveDayIndex(0);
  }, [activeDayIndex, plannerDays]);

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

  const promptSuggestions = useMemo(() => {
    if (needUserInput && clarification?.examples?.length) {
      return clarification.examples;
    }
    return [...DEFAULT_QUICK_PROMPTS];
  }, [clarification?.examples, needUserInput]);

  async function handleSubmit() {
    const value = inputValue.trim();
    if (!value) return;

    // 先清空输入框再发送，提升交互响应感。
    setInputValue("");
    await sendMessage(value);
  }

  function handleToggleSidebar() {
    // 允许用户在当前分辨率下手动切换“收缩 / 展开”状态。
    setIsSidebarCollapsed((prev) => !prev);
  }

  return (
    <main className={styles.page}>
      <section
        className={cn(
          styles.desktopShell,
          isSidebarCollapsed && styles.desktopShellSidebarCollapsed,
          "h-screen w-screen",
        )}
      >
        <aside className={cn(styles.sidebar, isSidebarCollapsed && styles.sidebarCollapsed)}>
          <div className={styles.brandBlock}>
            <div className={styles.brandIdentity}>
              <div className={styles.brandIcon}>✕</div>
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
              onClick={handleToggleSidebar}
            >
              {isSidebarCollapsed ? "»" : "«"}
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
            {SIDEBAR_PRIMARY_NAV.map((item) => (
              <button
                key={item.key}
                type="button"
                className={cn(styles.navItem, item.active && styles.navItemActive)}
                title={item.label}
                aria-label={item.label}
              >
                <span className={styles.navIcon}>{item.icon}</span>
                {!isSidebarCollapsed ? item.label : null}
              </button>
            ))}
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
                <span className={styles.navIcon}>{item.icon}</span>
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

        <section className={styles.chatPanel}>
          <header className={styles.chatHeader}>
            <div>
              <h1>
                AI 对话助手
                <span className={styles.spark}> ✦</span>
              </h1>
              <p>你的专属旅行规划师</p>
            </div>
          </header>

          <div ref={chatScrollRef} className={styles.chatScroll}>
            {messages.map((message) => (
              <article
                key={message.id}
                className={cn(
                  styles.msgCard,
                  message.role === "user" ? styles.msgUser : styles.msgAssistant,
                  message.role === "error" && styles.msgError,
                )}
              >
                <div className={styles.msgMeta}>
                  <strong>{resolveRoleLabel(message.role)}</strong>
                  <span>{message.time}</span>
                </div>
                <div className={styles.msgText}>
                  {message.role === "assistant" ? (
                    <MarkdownText content={message.content} />
                  ) : (
                    <p>{message.content}</p>
                  )}
                  {message.streaming ? <span className={styles.streamingCaret}>▋</span> : null}
                </div>
              </article>
            ))}

            {progressNodes.length > 0 ? (
              <div className={styles.progressRow}>
                {progressNodes.map((node) => (
                  <span key={node} className={styles.progressTag}>
                    {node}
                  </span>
                ))}
              </div>
            ) : null}

            <p className={styles.chatHint}>{CHAT_PLACEHOLDER_SUMMARY}</p>
            <div className={styles.suggestionRow} aria-label="快捷建议">
              {promptSuggestions.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={styles.suggestionBtn}
                  disabled={loading}
                  onClick={() => setInputValue(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <footer className={styles.inputWrap}>
            <input
              type="text"
              placeholder={CHAT_INPUT_PLACEHOLDER}
              className={styles.input}
              value={inputValue}
              disabled={loading}
              onChange={(event) => setInputValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleSubmit();
                }
              }}
            />

            <div className={styles.inputToolbar}>
              {INPUT_TOOLBAR_ACTIONS.map((item) => (
                <button key={item.key} type="button" className={styles.toolBtn} disabled={loading} title={item.label}>
                  {item.icon}
                </button>
              ))}
              <button
                type="button"
                className={styles.sendBtn}
                disabled={loading}
                onClick={() => void handleSubmit()}
              >
                {loading ? "…" : "➤"}
              </button>
            </div>
            <p className={styles.inputDisclaimer}>内容由 AI 生成，仅供参考，请注意安全出行</p>
          </footer>
        </section>

        <section className={styles.plannerPanel}>
          <header className={styles.plannerHeader}>
            <div className={styles.planTitleRow}>
              <h2>
                {plannerSummary.planName}
                <button type="button" className={styles.editBtn} aria-label="编辑行程标题">
                  ✎
                </button>
              </h2>
            </div>
            <div className={styles.actionRow}>
              <span className={styles.mockHint}>{plannerTagText}</span>
              {PLANNER_ACTIONS.map((action) => {
                // 通过 in 判断读取可选字段，避免联合类型上的属性访问报错。
                const isPrimary = "emphasized" in action && Boolean(action.emphasized);
                return (
                  <button
                    key={action.key}
                    type="button"
                    className={cn(styles.actionBtn, isPrimary && styles.actionBtnPrimary)}
                  >
                    <span>{action.icon}</span>
                    {action.label}
                  </button>
                );
              })}
            </div>
            <div className={styles.metaPillRow}>
              {plannerMetaPills.map((pill) => (
                <span key={pill.key} className={styles.metaPill}>
                  {pill.label}
                </span>
              ))}
            </div>
          </header>

          {routePanelPhase === ROUTE_PANEL_PHASE.Skeleton ? (
            <div className={styles.skeletonWrap}>
              <div className={styles.skeletonLine} />
              <div className={styles.skeletonGrid}>
                <div className={styles.skeletonCard} />
                <div className={styles.skeletonCard} />
                <div className={styles.skeletonCard} />
              </div>
              <div className={styles.skeletonTall} />
            </div>
          ) : (
            <div className={styles.plannerContent}>
              <div className={styles.infoGrid}>
                <article className={styles.adviceCard}>
                  <h3>自驾建议</h3>
                  <p>{plannerVehicleAdvice}</p>
                </article>

                <article className={styles.weatherCard}>
                  <h3>目的地天气（{weatherMonthLabel}）</h3>
                  <div className={styles.weatherGrid}>
                    {plannerWeather.slice(0, 3).map((item) => {
                      const daytime = splitWeatherSlot(item.daytime);
                      const nighttime = splitWeatherSlot(item.nighttime);
                      return (
                        <section key={item.area} className={styles.weatherItem}>
                          <h4>{item.area}</h4>
                          <div className={styles.weatherRow}>
                            <span>白天</span>
                            <strong>{daytime.temperature}</strong>
                          </div>
                          <p>{daytime.description}</p>
                          <div className={styles.weatherRow}>
                            <span>夜间</span>
                            <strong>{nighttime.temperature}</strong>
                          </div>
                          <p>{nighttime.description}</p>
                          <small>穿衣建议：{item.clothing}</small>
                        </section>
                      );
                    })}
                  </div>
                </article>
              </div>

              <div className={styles.dayTabs}>
                {plannerDays.map((day, index) => (
                  <button
                    key={`${day.day}-${day.title}`}
                    type="button"
                    className={cn(styles.dayTab, index === activeDayIndex && styles.dayTabActive)}
                    onClick={() => setActiveDayIndex(index)}
                  >
                    第{day.day}天
                  </button>
                ))}
              </div>

              <div className={styles.dayGrid}>
                <aside className={styles.routeAside}>
                  <section className={styles.routeBlock}>
                    <h4>途经点（行程路线）</h4>
                    <ul className={styles.routeList}>
                      {DAY_ROUTE_WAYPOINTS.map((point) => (
                        <li key={`${point.name}-${point.address}`}>
                          <div className={styles.routeDot} />
                          <div>
                            <strong>{point.name}</strong>
                            <p>{point.address}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>

                  <section className={styles.routeBlock}>
                    <h4>当日概览</h4>
                    <div className={styles.overviewList}>
                      <div>
                        <span>行程主题</span>
                        <strong>{activeDay.title}</strong>
                      </div>
                      <div>
                        <span>总距离</span>
                        <strong>{activeDay.distanceText}</strong>
                      </div>
                      <div>
                        <span>行车时间</span>
                        <strong>{activeDay.drivingHoursText}</strong>
                      </div>
                      <div>
                        <span>游玩时长</span>
                        <strong>约 4 小时</strong>
                      </div>
                    </div>
                  </section>

                  <section className={styles.routeBlock}>
                    <h4>美食推荐</h4>
                    <ul className={styles.foodList}>
                      {activeDay.foods.map((food) => (
                        <li key={food}>{food}</li>
                      ))}
                    </ul>
                  </section>
                </aside>

                <section className={styles.dayMain}>
                  <header className={styles.dayHeader}>
                    <div>
                      <h3>
                        第{activeDay.day}天 ｜ {activeDay.title}
                      </h3>
                      <p>{activeDay.description}</p>
                    </div>
                    <button type="button" className={styles.collapseBtn}>收起</button>
                  </header>

                  <div className={styles.spotSection}>
                    <h4>景点推荐</h4>
                    <div className={styles.spotList}>
                      {activeDay.activities.slice(0, 2).map((activity, index) => (
                        <article key={activity.name} className={styles.spotItem}>
                          <div className={styles.spotImageWrap}>
                            {activity.images[0]?.src ? (
                              // 这里先用原生 img 兼容动态外链图，后续可统一切换到 next/image。
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={activity.images[0].src}
                                alt={activity.images[0].alt || activity.name}
                                className={styles.spotImage}
                              />
                            ) : (
                              <div className={styles.spotImagePlaceholder}>暂无图片</div>
                            )}
                          </div>
                          <div className={styles.spotMeta}>
                            <h5>
                              {activity.name}
                              <span className={styles.ratingTag}>★ {index === 0 ? "4.9" : "4.8"}</span>
                            </h5>
                            <p>{activity.description}</p>
                            <div className={styles.spotStats}>
                              <span>建议游玩 {activity.suggestedHours}</span>
                              <span>门票 {activity.ticketText}</span>
                              <span>{activity.openingHoursText}</span>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>

                  <footer className={styles.tipBox}>
                    <strong>小贴士</strong>
                    <p>{activeDay.tips}</p>
                  </footer>
                </section>

                <aside className={styles.hotelPanel}>
                  <h4>住宿推荐</h4>
                  <div className={styles.hotelImageWrap}>
                    {featuredHotelImage ? (
                      // 这里先用原生 img 兼容动态外链图，后续可统一切换到 next/image。
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={featuredHotelImage} alt={featuredHotel.name} className={styles.hotelImage} />
                    ) : (
                      <div className={styles.hotelImagePlaceholder}>酒店图片占位</div>
                    )}
                  </div>
                  <h5>{featuredHotel.name}</h5>
                  <p>{featuredHotel.feature}</p>
                  <small>{featuredHotel.address}</small>
                </aside>
              </div>

              <div className={styles.bottomGrid}>
                <section className={styles.checklistPanel}>
                  <header>
                    <h4>出行必备清单</h4>
                    <button type="button">查看全部</button>
                  </header>
                  <div className={styles.checklistChips}>
                    {PACKING_CHECKLIST.map((item) => (
                      <span key={item}>{item}</span>
                    ))}
                  </div>
                </section>

                <section className={styles.tripSummaryPanel}>
                  <h4>行程总览</h4>
                  <div className={styles.summaryStats}>
                    <div>
                      <span>总天数</span>
                      <strong>{plannerSummary.totalDays} 天</strong>
                    </div>
                    <div>
                      <span>总距离</span>
                      <strong>{plannerSummary.totalDistanceText}</strong>
                    </div>
                    <div>
                      <span>行车时长</span>
                      <strong>{activeDay.drivingHoursText}</strong>
                    </div>
                  </div>
                </section>
              </div>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
