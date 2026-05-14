"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, MessageCircleMore, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { HistoryDetail } from "@repo/shared-types/history";
import { MarkdownText } from "../../../components/chat/MarkdownText";
import { TravelPlannerPanel } from "../../../components/TravelPlannerPanel";
import { normalizeFinalPlanData } from "../../../lib/travel-plan/normalize-final-plan";
import { deleteHistory, fetchHistoryDetail } from "../../../lib/history";
import { resolveRoleLabel } from "../../../lib/utils";
import { ROUTE_PANEL_PHASE } from "../../../hooks/useChatStream";
import styles from "./page.module.scss";

function formatDateTime(value: number | string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const HistoryDetailPage = () => {
  const params = useParams<{ sessionId: string }>();
  const router = useRouter();
  const sessionId = String(params?.sessionId ?? "");
  const [detail, setDetail] = useState<HistoryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      setError("缺少 sessionId");
      setLoading(false);
      return;
    }

    void fetchHistoryDetail(sessionId)
      .then((nextDetail) => {
        setDetail(nextDetail);
        setError("");
      })
      .catch((requestError) => {
        setError(requestError instanceof Error ? requestError.message : "加载历史详情失败");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [sessionId]);

  const plannerModel = useMemo(() => {
    if (!detail?.finalPlan) return null;
    return normalizeFinalPlanData(detail.finalPlan);
  }, [detail?.finalPlan]);

  const handleDelete = async () => {
    if (!sessionId) return;

    const confirmed = window.confirm("确认删除这条历史记录吗？删除后对应会话将无法继续恢复。");
    if (!confirmed) return;

    setDeleting(true);
    try {
      await deleteHistory(sessionId);
      router.push("/history");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "删除历史记录失败");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section className={styles.detailPage}>
      <header className={styles.detailHeader}>
        <div className={styles.headerActions}>
          <Link href="/history" className={styles.secondaryAction}>
            <ArrowLeft size={14} />
            返回历史列表
          </Link>
          <Link href={`/?sid=${sessionId}`} className={styles.primaryAction}>
            <MessageCircleMore size={14} />
            继续聊天
          </Link>
          <button type="button" className={styles.dangerAction} disabled={deleting} onClick={() => void handleDelete()}>
            <Trash2 size={14} />
            {deleting ? "删除中" : "删除记录"}
          </button>
        </div>

        {detail ? (
          <div className={styles.titleBlock}>
            <p className={styles.eyebrow}>Session #{detail.sessionId}</p>
            <h1>{detail.title}</h1>
            <p>{detail.latestSummary || "当前历史记录尚未生成摘要，下面仍可查看完整对话与行程数据。"}</p>
          </div>
        ) : null}
      </header>

      {loading ? <p className={styles.feedback}>正在加载历史详情...</p> : null}
      {error ? <p className={styles.feedbackError}>{error}</p> : null}

      {!loading && !error && detail ? (
        <div className={styles.detailGrid}>
          <section className={styles.messagePanel}>
            <div className={styles.panelHeader}>
              <h2>对话历史</h2>
              <span>最后更新于 {formatDateTime(detail.updatedAt)}</span>
            </div>

            <div className={styles.messageList}>
              {detail.messages.map((message) => (
                <article key={message.id} className={styles.messageCard}>
                  <div className={styles.messageMeta}>
                    <strong>{resolveRoleLabel(message.role)}</strong>
                    <span>{formatDateTime(message.createdAt)}</span>
                  </div>
                  <div className={styles.messageContent}>
                    {message.role === "assistant" ? (
                      <MarkdownText content={message.content} />
                    ) : (
                      <p>{message.content}</p>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <div className={styles.planPanel}>
            <TravelPlannerPanel
              routePanelPhase={plannerModel ? ROUTE_PANEL_PHASE.Plan : ROUTE_PANEL_PHASE.Empty}
              plan={plannerModel}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
};

export default HistoryDetailPage;
