import type { ChatMessage } from "../hooks/useChatStream";

const ROLE_LABEL_MAP = {
  assistant: "AI 对话助手",
  user: "你",
  system: "系统",
  error: "系统",
} as const;

export function cn(...names: Array<string | false | null | undefined>) {
  // 统一处理 className 拼接，避免组件里重复维护相同逻辑。
  return names.filter(Boolean).join(" ");
}

export function resolveRoleLabel(role: ChatMessage["role"]) {
  // 统一角色文案映射，避免在 JSX 内散落魔法字符串。
  if (role in ROLE_LABEL_MAP) {
    return ROLE_LABEL_MAP[role as keyof typeof ROLE_LABEL_MAP];
  }
  return ROLE_LABEL_MAP.assistant;
}

export function splitWeatherSlot(value: string) {
  // 天气文案优先匹配完整温度区间，避免被空格切断。
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
