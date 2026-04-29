import type { DayViewModel, TravelPlanViewModel } from "../types/travel-plan";

export const QUERY_KEY = {
  SessionId: "sid",
} as const;

export const ROLE_LABEL_MAP = {
  assistant: "AI 对话助手",
  user: "你",
  system: "系统",
  error: "系统",
} as const;

export const SIDEBAR_PRIMARY_NAV = [
  { key: "explore", label: "行程探索", icon: "⌂", active: true },
  { key: "trips", label: "我的行程", icon: "🗎", active: false },
  { key: "favorites", label: "收藏夹", icon: "☆", active: false },
  { key: "history", label: "历史记录", icon: "◷", active: false },
] as const;

export const SIDEBAR_SECONDARY_NAV = [
  { key: "settings", label: "设置", icon: "⚙" },
  { key: "help", label: "帮助与反馈", icon: "?" },
] as const;

export const PLANNER_ACTIONS = [
  { key: "share", label: "分享行程", icon: "↗" },
  { key: "export", label: "导出行程", icon: "⇩" },
  { key: "favorite", label: "收藏", icon: "♡" },
  { key: "save", label: "保存行程", icon: "◉", emphasized: true },
] as const;

export const DEFAULT_QUICK_PROMPTS = [
  "推荐美食",
  "必备物品",
  "天气如何",
  "入住建议",
] as const;

export const CHAT_INPUT_PLACEHOLDER = "输入你的想法，例如：想去看夜景和美食...";

export const INPUT_TOOLBAR_ACTIONS = [
  { key: "attach", label: "附件", icon: "✎" },
  { key: "location", label: "位置", icon: "⌂" },
  { key: "gallery", label: "图片", icon: "☐" },
] as const;

export const DAY_ROUTE_WAYPOINTS = [
  { name: "解放碑", address: "重庆市渝中区民族路177号" },
  { name: "洪崖洞", address: "重庆市渝中区嘉陵江滨江路88号" },
] as const;

export const PLAN_MOCK_SUMMARY: TravelPlanViewModel["summary"] = {
  planName: "重庆5日自驾之旅",
  totalDays: 5,
  totalDistanceText: "155.5 km",
  vehicleType: "自驾",
};

export const PLAN_MOCK_BEST_SEASON = "夏季（7月）";
export const PLAN_MOCK_VEHICLE_ADVICE =
  "重庆多山路、隧道和立交，建议驾驶经验丰富。出发前检查轮胎、刹车和空调系统，并预留足够机动时间。";

export const PLAN_MOCK_WEATHER: TravelPlanViewModel["weather"] = [
  {
    area: "重庆市区",
    daytime: "30 ~ 38°C 晴转多云",
    nighttime: "27 ~ 32°C 多云间晴",
    clothing: "短袖短裤，夜间可备薄外套",
  },
  {
    area: "武隆",
    daytime: "24 ~ 32°C 多云，偶有阵雨",
    nighttime: "20 ~ 26°C 阵雨转阴",
    clothing: "短袖+防晒衣，峡谷内建议防蚊",
  },
  {
    area: "大足111",
    daytime: "24 ~ 36°C 晴，高温",
    nighttime: "25 ~ 30°C 晴",
    clothing: "短袖短裤，带上遮阳伞",
  },
  {
    area: "大足222",
    daytime: "24 ~ 36°C 晴，高温",
    nighttime: "25 ~ 30°C 晴",
    clothing: "短袖短裤，带上遮阳伞",
  },
];

export const PLAN_MOCK_DAYS: DayViewModel[] = [
  {
    day: 1,
    title: "主城经典初体验",
    description: "首日以解放碑和洪崖洞为主，感受山城地标与魔幻夜景。",
    distanceText: "5.7 km",
    drivingHoursText: "约 0.4 小时",
    tips: "洪崖洞建议 18:00 后再前往，拍照人多请注意安全。",
    foods: ["重庆老火锅（解放碑附近）", "花市豌杂面", "冰粉凉虾"],
    accommodations: [
      {
        name: "布丁酒店(重庆解放碑洪崖洞步行街店)",
        address: "帝都广场写字楼A栋1层(小什字地铁站6号口步行230米)",
        feature: "经济型连锁酒店",
      },
    ],
    activities: [
      {
        name: "解放碑步行街",
        description: "重庆地标商业中心，周边可逛时代广场。",
        suggestedHours: "1.5 小时",
        openingHoursText: "24小时营业",
        ticketText: "¥0",
        images: [
          {
            src: "https://images.unsplash.com/photo-1555992336-03a23c7b20ee?auto=format&fit=crop&w=1200&q=80",
            alt: "解放碑夜景",
          },
        ],
      },
      {
        name: "洪崖洞民俗风貌区",
        description: "吊脚楼建筑群，夜景惊艳。",
        suggestedHours: "2.5 小时",
        openingHoursText: "09:00-23:00",
        ticketText: "¥0",
        images: [
          {
            src: "https://images.unsplash.com/photo-1526481280695-3c4691f4f8f3?auto=format&fit=crop&w=1200&q=80",
            alt: "洪崖洞夜景",
          },
        ],
      },
    ],
  },
  {
    day: 2,
    title: "武隆喀斯特自然线",
    description: "前往天生三桥与仙女山，主打自然景观与轻徒步。",
    distanceText: "193 km",
    drivingHoursText: "约 3.2 小时",
    tips: "山区温差明显，建议备一件薄外套并提前查看景区预约。",
    foods: ["武隆碗碗羊肉", "土鸡汤锅", "荞麦面"],
    accommodations: [
      {
        name: "武隆仙女山观景酒店",
        address: "武隆区仙女山游客中心附近",
        feature: "景观型舒适酒店",
      },
    ],
    activities: [
      {
        name: "天生三桥",
        description: "世界自然遗产，喀斯特地貌代表景区。",
        suggestedHours: "3 小时",
        openingHoursText: "08:30-17:30",
        ticketText: "¥125",
        images: [
          {
            src: "https://images.unsplash.com/photo-1471922694854-ff1b63b20054?auto=format&fit=crop&w=1200&q=80",
            alt: "天生三桥",
          },
        ],
      },
    ],
  },
];

export const PACKING_CHECKLIST = [
  "防晒霜 (SPF50+)",
  "遮阳帽和墨镜",
  "驱蚊液",
  "舒适运动鞋",
  "折叠雨伞",
  "便携水壶",
  "充电宝和数据线",
  "藿香正气水",
] as const;

export const STATUS_TEXT = {
  Ready: "就绪",
  Planning: "生成中",
  Error: "出错",
  MockTag: "示例展示",
} as const;
