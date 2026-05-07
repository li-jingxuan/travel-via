import { memo, useCallback } from "react";
import type React from "react";
import type { RefObject } from "react";
import type { LucideIcon } from "lucide-react";
import { Image as ImageIcon, MapPin, Paperclip, SendHorizontal } from "lucide-react";
import { MarkdownText } from "./chat/MarkdownText";
import type { ChatMessage } from "../hooks/useChatStream";
import { resolveRoleLabel } from "../lib/utils";
import { cn } from "../lib/utils";
import styles from "./TravelChatPanel.module.scss";

interface TravelChatPanelProps {
  chatScrollRef: RefObject<HTMLDivElement | null>;
  messages: ChatMessage[];
  progressNodes: string[];
  promptSuggestions: readonly string[];
  inputValue: string;
  loading: boolean;
  onInputChange: (value: string) => void;
  onSuggestionClick: (value: string) => void;
  onSubmit: () => void;
}

const INPUT_TOOLBAR_ICON_MAP: Record<string, LucideIcon> = {
  attach: Paperclip,
  location: MapPin,
  gallery: ImageIcon,
};

export const CHAT_INPUT_PLACEHOLDER = "输入你的想法，例如：想去看夜景和美食...";
const CHAT_PLACEHOLDER_SUMMARY = "你可以告诉我偏好，我可以帮你调整行程：";
const INPUT_TOOLBAR_ACTIONS = [
  { key: "attach", label: "附件", icon: "✎" },
  { key: "location", label: "位置", icon: "⌂" },
  { key: "gallery", label: "图片", icon: "☐" },
] as const;

const TravelChatPanelComponent: React.FC<TravelChatPanelProps> = ({
  chatScrollRef,
  messages,
  progressNodes,
  promptSuggestions,
  inputValue,
  loading,
  onInputChange,
  onSuggestionClick,
  onSubmit
}) => {
  const handleEnterSubmit = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      // 保持“回车即发送”的原交互，避免拆分后行为回退。
      if (event.key === "Enter") {
        event.preventDefault();
        onSubmit();
      }
    },
    [onSubmit],
  );

  // 聊天面板只做展示和事件透传，发送逻辑由页面层统一管理。
  return (
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
              {message.role === "assistant" ? <MarkdownText content={message.content} /> : <p>{message.content}</p>}
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
              onClick={() => onSuggestionClick(item)}
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
          onChange={(event) => onInputChange(event.target.value)}
          onKeyDown={handleEnterSubmit}
        />

        <div className={styles.inputToolbar}>
          {INPUT_TOOLBAR_ACTIONS.map((item) => {
            const ToolIcon = INPUT_TOOLBAR_ICON_MAP[item.key] ?? Paperclip;
            return (
              <button key={item.key} type="button" className={styles.toolBtn} disabled={loading} title={item.label}>
                <ToolIcon className={styles.toolbarIcon} />
              </button>
            );
          })}
          <button type="button" className={styles.sendBtn} disabled={loading} onClick={onSubmit}>
            {loading ? "…" : <SendHorizontal className={styles.sendIcon} />}
          </button>
        </div>
        <p className={styles.inputDisclaimer}>内容由 AI 生成，仅供参考，请注意安全出行</p>
      </footer>
    </section>
  );
};

// 消息区渲染量较大，使用 memo 配合稳定 props 可减少不必要重绘。
export const TravelChatPanel = memo(TravelChatPanelComponent);
