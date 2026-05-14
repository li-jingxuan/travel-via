import type { ApiResponse, PaginatedData } from './api.js'
import type { ITravelPlan } from './travel.js'

/**
 * 首页与历史详情页都需要复用这条欢迎语。
 *
 * 统一放在 shared-types 中的好处：
 * 1. 前端首次渲染与后端落库内容保持一致
 * 2. 历史回填后不会出现“同一条欢迎语两套文案”的问题
 */
export const DEFAULT_TRAVEL_ASSISTANT_GREETING =
  '告诉我你的出发地、目的地和出行方式，我会实时规划您的旅行路线。'

export const HISTORY_STATUS = {
  Active: 'active',
  NeedsInput: 'needs_input',
  Completed: 'completed',
  Failed: 'failed',
} as const

export type HistoryStatus = typeof HISTORY_STATUS[keyof typeof HISTORY_STATUS]

export const HISTORY_MESSAGE_ROLE = {
  User: 'user',
  Assistant: 'assistant',
  System: 'system',
  Error: 'error',
} as const

export type HistoryMessageRole =
  typeof HISTORY_MESSAGE_ROLE[keyof typeof HISTORY_MESSAGE_ROLE]

export const HISTORY_MESSAGE_KIND = {
  UserInput: 'user_input',
  Clarification: 'clarification',
  Summary: 'summary',
  Error: 'error',
  System: 'system',
} as const

export type HistoryMessageKind =
  typeof HISTORY_MESSAGE_KIND[keyof typeof HISTORY_MESSAGE_KIND]

/**
 * Graph 中的轻量对话记录。
 *
 * 这里的目标不是保存所有历史，而是给 Agent 续聊时补“最近几轮语境”。
 * 完整历史仍以 travel_history_message 表为准。
 */
export interface ConversationRecord {
  role: HistoryMessageRole
  kind: HistoryMessageKind
  content: string
  createdAt: number
}

export interface HistoryMessage extends ConversationRecord {
  id: string
  sessionId: string
  seq: number
  meta?: Record<string, unknown> | null
}

export interface HistoryListItem {
  sessionId: string
  title: string
  destination: string
  travelDays: number
  travelType: string
  status: HistoryStatus
  latestSummary: string
  updatedAt: string
  lastMessageAt: string
}

export interface HistoryDetail {
  sessionId: string
  title: string
  destination: string
  travelDays: number
  travelType: string
  status: HistoryStatus
  latestSummary: string
  finalPlan: ITravelPlan | null
  messages: HistoryMessage[]
  conversationSnapshot: ConversationRecord[]
  createdAt: string
  updatedAt: string
  lastMessageAt: string
}

export interface DeleteHistoryRequest {
  sessionId: string
}

export interface DeleteHistoryResponseData {
  sessionId: string
}

export type GetHistoryListResponse = ApiResponse<PaginatedData<HistoryListItem>>
export type GetHistoryDetailResponse = ApiResponse<HistoryDetail>
export type DeleteHistoryResponse = ApiResponse<DeleteHistoryResponseData>
