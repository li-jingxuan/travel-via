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
];

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
];

export default function Home() {
  return (
    <main className="planner-page">
      <section className="planner-shell">
        <aside className="panel panel-chat">
          <header className="panel-head">
            <div>
              <p className="eyebrow">AI Travel Planner</p>
              <h1>旅行偏好对话</h1>
            </div>
            <span className="live-pill">在线</span>
          </header>

          <div className="chat-scroll">
            {chatMessages.map((message) => (
              <article
                key={`${message.time}-${message.role}`}
                className={`msg-card ${message.role === "user" ? "is-user" : "is-ai"}`}
              >
                <div className="msg-meta">
                  <strong>{message.title}</strong>
                  <span>{message.time}</span>
                </div>
                <p>{message.content}</p>
              </article>
            ))}

            <div className="suggestions">
              <button type="button">生成 5 天路线</button>
              <button type="button">改成亲子友好</button>
              <button type="button">降低预算 15%</button>
            </div>
          </div>

          <footer className="chat-input-wrap">
            <input type="text" placeholder="告诉我：预算、出发城市、偏好节奏..." />
            <button type="button">发送</button>
          </footer>
        </aside>

        <section className="panel panel-route">
          <header className="panel-head route-head">
            <div>
              <p className="eyebrow">Route Overview</p>
              <h2>杭州 · 5天轻松路线</h2>
            </div>
            <div className="budget-box">
              <span>总预算</span>
              <strong>¥4,380</strong>
            </div>
          </header>

          <div className="route-grid">
            <article className="map-card">
              <div className="map-overlay">
                <p>核心动线</p>
                <h3>西湖 → 茶山 → 运河</h3>
                <span>平均通勤 24 分钟</span>
              </div>
              <div className="map-dots" aria-hidden>
                <i />
                <i />
                <i />
                <i />
              </div>
            </article>

            <article className="timeline-card">
              <h3>每日安排</h3>
              <ul>
                {tripSteps.map((step) => (
                  <li key={step.day}>
                    <div className="step-day">{step.day}</div>
                    <div className="step-main">
                      <p className="step-title">{step.title}</p>
                      <p className="step-detail">{step.detail}</p>
                    </div>
                    <div className="step-side">
                      <span>{step.tag}</span>
                      <strong>{step.cost}</strong>
                    </div>
                  </li>
                ))}
              </ul>
            </article>

            <article className="stats-card">
              <h3>出行指标</h3>
              <div className="stats-list">
                <p>
                  日均步行 <strong>7.4 km</strong>
                </p>
                <p>
                  公交地铁占比 <strong>68%</strong>
                </p>
                <p>
                  高峰拥堵规避 <strong>3 段</strong>
                </p>
              </div>
            </article>

            <article className="alert-card">
              <h3>智能提醒</h3>
              <p>周日 16:00 西湖边游客密度较高，建议提前 30 分钟前往观景点。</p>
            </article>
          </div>
        </section>
      </section>
    </main>
  );
}
