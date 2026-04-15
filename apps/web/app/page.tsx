import styles from "./page.module.scss";

const chatMessages = [
  {
    role: "assistant",
    title: "TravelVia AI",
    content:
      "我可以根据你的预算、出行节奏和偏好生成 5 天杭州深度路线。想要偏自然疗愈，还是城市文化探索？",
    time: "09:12",
  },
  {
    role: "user",
    title: "你",
    content:
      "预算 4500 元，周五晚上到，周三返程。希望轻松一些，别太赶，想看日落和逛市集。",
    time: "09:13",
  },
  {
    role: "assistant",
    title: "TravelVia AI",
    content:
      "收到，我会把动线集中在西湖-满觉陇-运河三段，减少折返；并把每日步行控制在 8 公里以内。",
    time: "09:14",
  },
] as const;

const suggestions = ["生成 5 天路线", "改成亲子友好", "降低预算 15%"] as const;

const tripSteps = [
  {
    day: "D1",
    title: "抵达与夜西湖",
    detail: "19:30 入住湖滨商圈，20:30 断桥夜景，22:00 河坊街夜宵。",
    tag: "低强度",
    cost: "¥380",
  },
  {
    day: "D2",
    title: "龙井村与满觉陇",
    detail: "上午茶园徒步，下午桂花小径，傍晚杨公堤看日落。",
    tag: "自然线",
    cost: "¥420",
  },
  {
    day: "D3",
    title: "运河与市集日",
    detail: "拱宸桥-小河直街慢逛，晚间武林夜市自由活动。",
    tag: "市井线",
    cost: "¥310",
  },
  {
    day: "D4",
    title: "艺术馆与咖啡巡礼",
    detail: "白天看展，下午留白休息，夜晚可选沉浸式演出。",
    tag: "弹性日",
    cost: "¥560",
  },
] as const;

const metrics = [
  { label: "日均步行", value: "7.4 km" },
  { label: "公交地铁占比", value: "68%" },
  { label: "高峰拥堵规避", value: "3 段" },
] as const;

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
          <header className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Route Overview</p>
              <h2 className={styles.panelTitle}>杭州 · 5天轻松路线</h2>
            </div>
            <div className={styles.budgetBox}>
              <span>总预算</span>
              <strong>¥4,380</strong>
            </div>
          </header>

          <div className={styles.routeGrid}>
            <article className={styles.mapCard}>
              <div className={styles.mapOverlay}>
                <p>核心动线</p>
                <h3>西湖 → 茶山 → 运河</h3>
                <span>平均通勤 24 分钟</span>
              </div>
              <div className={styles.mapDots} aria-hidden>
                <i />
                <i />
                <i />
                <i />
              </div>
            </article>

            <article className={cn(styles.card, styles.timelineCard)}>
              <h3 className={styles.cardTitle}>每日安排</h3>
              <ul className={styles.stepList}>
                {tripSteps.map((step) => (
                  <li key={step.day} className={styles.stepItem}>
                    <div className={styles.stepDay}>{step.day}</div>
                    <div>
                      <p className={styles.stepTitle}>{step.title}</p>
                      <p className={styles.stepDetail}>{step.detail}</p>
                    </div>
                    <div className={styles.stepSide}>
                      <span>{step.tag}</span>
                      <strong>{step.cost}</strong>
                    </div>
                  </li>
                ))}
              </ul>
            </article>

            <article className={styles.card}>
              <h3 className={styles.cardTitle}>出行指标</h3>
              <div className={styles.metricList}>
                {metrics.map((metric) => (
                  <p key={metric.label} className={styles.metricItem}>
                    {metric.label}
                    <strong>{metric.value}</strong>
                  </p>
                ))}
              </div>
            </article>

            <article className={styles.card}>
              <h3 className={styles.cardTitle}>智能提醒</h3>
              <p className={styles.alertText}>
                周日 16:00 西湖边游客密度较高，建议提前 30 分钟前往观景点。
              </p>
            </article>
          </div>
        </section>
      </section>
    </main>
  );
}
