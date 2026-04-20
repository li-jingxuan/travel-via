"use client";

import { useState } from "react";
import { RoutePanel } from "../components/route-panel";
import { useChatStream } from "../hooks/useChatStream";
import { normalizeFinalPlan } from "../lib/travel-plan/normalize-final-plan";
import rawPlan from "../mock/mock.json";
import styles from "./page.module.scss";

const suggestions = ["换成亲子友好", "把预算压到 4000", "增加城市夜景"] as const;
const initialPlan = normalizeFinalPlan(rawPlan);

function cn(...names: Array<string | false | null | undefined>) {
  return names.filter(Boolean).join(" ");
}

export default function Home() {
  // 输入框只维护当前草稿文本，消息与行程状态由 useChatStream 托管。
  const [inputValue, setInputValue] = useState("");
  const { messages, progressNodes, plan, needUserInput, loading, statusLabel, sendMessage, stop } =
    useChatStream(initialPlan);

  async function handleSubmit() {
    const value = inputValue.trim();
    if (!value) return;

    // 先清空输入框再发送，提升交互响应感。
    setInputValue("");
    await sendMessage(value);
  }

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <aside className={cn(styles.panel, styles.chatPanel)}>
          <header className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>AI Travel Planner</p>
              <h1 className={styles.panelTitle}>旅行偏好对话</h1>
            </div>
            <span className={styles.livePill}>{statusLabel}</span>
          </header>

          <div className={styles.chatScroll}>
            {messages.map((message) => (
              <article
                key={message.id}
                className={cn(
                  styles.msgCard,
                  message.role === "user" ? styles.msgUser : styles.msgAi,
                  message.role === "error" && styles.msgError,
                )}
              >
                <div className={styles.msgMeta}>
                  <strong>{message.role === "user" ? "你" : message.role === "error" ? "系统" : "TravelVia AI"}</strong>
                  <span>{message.time}</span>
                </div>
                <p className={styles.msgText}>
                  {message.content}
                  {message.streaming ? <span className={styles.streamingCaret}>▋</span> : null}
                </p>
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

            <div className={styles.suggestionRow}>
              {suggestions.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={styles.suggestionBtn}
                  onClick={() => setInputValue(item)}
                >
                  {item}
                </button>
              ))}
            </div>

            {needUserInput ? (
              <p className={styles.followupHint}>当前结果需要补充更多信息，请继续描述你的预算或偏好。</p>
            ) : null}
          </div>

          <footer className={styles.inputWrap}>
            <input
              type="text"
              placeholder="告诉我：预算、出发城市、偏好节奏..."
              className={styles.input}
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleSubmit();
                }
              }}
            />

            {loading ? (
              <button type="button" className={styles.sendBtn} onClick={stop}>
                停止
              </button>
            ) : (
              <button type="button" className={styles.sendBtn} onClick={() => void handleSubmit()}>
                发送
              </button>
            )}
          </footer>
        </aside>

        <section className={cn(styles.panel, styles.routePanel)}>
          <RoutePanel plan={plan} />
        </section>
      </section>
    </main>
  );
}
