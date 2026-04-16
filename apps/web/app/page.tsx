import { RoutePanel } from "../components/route-panel";
import { normalizeFinalPlan } from "../lib/travel-plan/normalize-final-plan";
import rawPlan from "../mock/mock.json";
import styles from "./page.module.scss";

const chatMessages = [
  {
    role: "assistant",
    title: "TravelVia AI",
    content:
      "路线已经按你的节奏重排：高热时段优先室内、夜景安排在体力末段，市区与武隆的往返也做了减少折返处理。",
    time: "09:18",
  },
  {
    role: "user",
    title: "你",
    content: "我比较关心每天是否太赶，尤其武隆那天。",
    time: "09:19",
  },
  {
    role: "assistant",
    title: "TravelVia AI",
    content: "武隆日只保留天生三桥主线，晚上入住仙女山镇，第二天再回城，强度被压到中等。",
    time: "09:20",
  },
] as const;

const suggestions = ["换成亲子友好", "把预算压到 4000", "增加城市夜景"] as const;

const plan = normalizeFinalPlan(rawPlan);

function cn(...names: Array<string | false | null | undefined>) {
  return names.filter(Boolean).join(" ");
}

export default function Home() {
  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <aside className={cn(styles.panel, styles.chatPanel)}>
          <header className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>AI Travel Planner</p>
              <h1 className={styles.panelTitle}>旅行偏好对话</h1>
            </div>
            <span className={styles.livePill}>在线</span>
          </header>

          <div className={styles.chatScroll}>
            {chatMessages.map((message) => (
              <article
                key={`${message.time}-${message.role}`}
                className={cn(
                  styles.msgCard,
                  message.role === "user" ? styles.msgUser : styles.msgAi,
                )}
              >
                <div className={styles.msgMeta}>
                  <strong>{message.title}</strong>
                  <span>{message.time}</span>
                </div>
                <p className={styles.msgText}>{message.content}</p>
              </article>
            ))}

            <div className={styles.suggestionRow}>
              {suggestions.map((item) => (
                <button key={item} type="button" className={styles.suggestionBtn}>
                  {item}
                </button>
              ))}
            </div>
          </div>

          <footer className={styles.inputWrap}>
            <input
              type="text"
              placeholder="告诉我：预算、出发城市、偏好节奏..."
              className={styles.input}
            />
            <button type="button" className={styles.sendBtn}>
              发送
            </button>
          </footer>
        </aside>

        <section className={cn(styles.panel, styles.routePanel)}>
          <RoutePanel plan={plan} />
        </section>
      </section>
    </main>
  );
}
