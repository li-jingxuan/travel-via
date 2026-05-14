import {
  HISTORY_MESSAGE_KIND,
  HISTORY_MESSAGE_ROLE,
  HISTORY_STATUS,
} from '@repo/shared-types/history'
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

/**
 * 历史主表：
 * - 一条 session_id 对应一条主记录
 * - 保存当前会话的“最新结果”和列表页需要的摘要字段
 */
export const travelHistory = pgTable(
  'travel_history',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sessionId: varchar('session_id', { length: 128 }).notNull(),
    status: varchar('status', { length: 32 }).notNull().default(HISTORY_STATUS.Active),
    title: text('title').notNull().default('未命名行程'),
    destination: text('destination').notNull().default('未填写'),
    travelDays: integer('travel_days').notNull().default(0),
    travelType: text('travel_type').notNull().default('未填写'),
    latestSummary: text('latest_summary').notNull().default(''),
    finalPlanJson: jsonb('final_plan_json'),
    collectedIntentJson: jsonb('collected_intent_json'),
    clarificationJson: jsonb('clarification_json'),
    conversationSnapshotJson: jsonb('conversation_snapshot_json').$type<unknown[]>().notNull().default([]),
    errorJson: jsonb('error_json').$type<string[]>().notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    sessionIdUnique: uniqueIndex('travel_history_session_id_unique').on(table.sessionId),
    statusIdx: index('travel_history_status_idx').on(table.status),
    updatedAtIdx: index('travel_history_updated_at_idx').on(table.updatedAt),
    deletedAtIdx: index('travel_history_deleted_at_idx').on(table.deletedAt),
  }),
)

/**
 * 历史消息明细表：
 * - 保存完整聊天消息流
 * - 给 history 详情页展示和未来导出功能复用
 */
export const travelHistoryMessage = pgTable(
  'travel_history_message',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    historyId: uuid('history_id').notNull().references(() => travelHistory.id),
    sessionId: varchar('session_id', { length: 128 }).notNull(),
    seq: integer('seq').notNull(),
    role: varchar('role', { length: 32 }).notNull().default(HISTORY_MESSAGE_ROLE.User),
    kind: varchar('kind', { length: 32 }).notNull().default(HISTORY_MESSAGE_KIND.UserInput),
    content: text('content').notNull(),
    metaJson: jsonb('meta_json'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    sessionSeqUnique: uniqueIndex('travel_history_message_session_seq_unique').on(table.sessionId, table.seq),
    sessionIdIdx: index('travel_history_message_session_id_idx').on(table.sessionId),
    historyIdIdx: index('travel_history_message_history_id_idx').on(table.historyId),
    deletedAtIdx: index('travel_history_message_deleted_at_idx').on(table.deletedAt),
  }),
)
