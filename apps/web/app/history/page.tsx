"use client";

import Link from "next/link";
import { ArrowRight, Clock3, MapPinned, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { HistoryListItem } from "@repo/shared-types/history";
import type { PaginatedData } from "@repo/shared-types/api";
import { deleteHistory, fetchHistoryList } from "../../lib/history";
import styles from "./page.module.scss";

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const HistoryPage = () => {
  const [historyData, setHistoryData] = useState<PaginatedData<HistoryListItem>>({
    list: [],
    total: 0,
    page: 1,
    pageSize: 20,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [deletingSessionId, setDeletingSessionId] = useState<string>("");

  useEffect(() => {
    void fetchHistoryList({ page: 1, pageSize: 20 })
      .then((data) => {
        setHistoryData(data);
        setError("");
      })
      .catch((requestError) => {
        setError(requestError instanceof Error ? requestError.message : "加载历史记录失败");
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const handleDelete = async (sessionId: string) => {
    const confirmed = window.confirm("确认删除这条历史记录吗？删除后将无法继续恢复该会话。");
    if (!confirmed) return;

    setDeletingSessionId(sessionId);
    try {
      await deleteHistory(sessionId);
      setHistoryData((prev) => ({
        ...prev,
        total: Math.max(prev.total - 1, 0),
        list: prev.list.filter((item) => item.sessionId !== sessionId),
      }));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "删除历史记录失败");
    } finally {
      setDeletingSessionId("");
    }
  };

  return (
    <section className={styles.historyPage}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>History</p>
          <h1>历史记录</h1>
          <p className={styles.subtitle}>查看你过去的会话、规划结果，并从任意一条记录继续聊天。</p>
        </div>
        <div className={styles.summaryCard}>
          <span>总记录数</span>
          <strong>{historyData.total}</strong>
        </div>
      </header>

      {loading ? <p className={styles.feedback}>正在加载历史记录...</p> : null}
      {error ? <p className={styles.feedbackError}>{error}</p> : null}
      {!loading && !error && historyData.list.length === 0 ? (
        <div className={styles.emptyState}>
          <h2>还没有历史记录</h2>
          <p>先去首页发起一次旅行规划，对话结束后这里会自动出现对应的会话记录。</p>
          <Link href="/" className={styles.primaryLink}>
            去创建新行程
          </Link>
        </div>
      ) : null}

      <div className={styles.cardGrid}>
        {historyData.list.map((item) => (
          <article key={item.sessionId} className={styles.historyCard}>
            <div className={styles.cardTopRow}>
              <span className={styles.statusTag}>{item.status}</span>
              <button
                type="button"
                className={styles.deleteBtn}
                disabled={deletingSessionId === item.sessionId}
                onClick={() => void handleDelete(item.sessionId)}
              >
                <Trash2 size={14} />
                {deletingSessionId === item.sessionId ? "删除中" : "删除"}
              </button>
            </div>

            <div className={styles.titleBlock}>
              <h2>{item.title}</h2>
              <p>{item.latestSummary || "本次会话暂未生成摘要，点击查看详情可回看完整对话与规划状态。"}</p>
            </div>

            <div className={styles.metaGrid}>
              <span>
                <MapPinned size={14} />
                {item.destination}
              </span>
              <span>
                <Clock3 size={14} />
                {item.travelDays > 0 ? `${item.travelDays} 天` : "未确定天数"}
              </span>
              <span>{item.travelType || "未确定方式"}</span>
              <span>更新于 {formatDateTime(item.updatedAt)}</span>
            </div>

            <div className={styles.actionRow}>
              <Link href={`/history/${item.sessionId}`} className={styles.secondaryLink}>
                查看详情
              </Link>
              <Link href={`/?sid=${item.sessionId}`} className={styles.primaryLink}>
                继续聊天
                <ArrowRight size={14} />
              </Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
};

export default HistoryPage;
