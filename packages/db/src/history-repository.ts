import {
  DEFAULT_TRAVEL_ASSISTANT_GREETING,
  HISTORY_MESSAGE_KIND,
  HISTORY_MESSAGE_ROLE,
  HISTORY_STATUS,
  type ConversationRecord,
  type HistoryDetail,
  type HistoryListItem,
  type HistoryMessage,
  type HistoryStatus,
  type ITravelPlan,
  type PaginatedData,
} from '@repo/shared-types'
import { and, asc, count, desc, eq, isNull, sql } from 'drizzle-orm'
import { getDb } from './client.js'
import { travelHistory, travelHistoryMessage } from './schema/history.js'

/**
 * 主表汇总态更新所需的输入。
 *
 * 这里把 repository 需要的字段显式列出来，而不是直接传一整坨 Graph state，
 * 目的是保持数据库层与 agent 内部结构解耦。
 */
interface UpsertHistoryPayload {
  status: HistoryStatus
  title: string
  destination: string
  travelDays: number
  travelType: string
  latestSummary: string
  finalPlan: ITravelPlan | null
  collectedIntent: unknown
  clarification: unknown
  conversationSnapshot: ConversationRecord[]
  errors: string[]
}

/**
 * 数据库时间统一在 repository 层转为 ISO 字符串。
 *
 * 这样 controller/service/前端拿到的时间表现始终一致，
 * 不需要在多个调用层重复写 Date 序列化逻辑。
 */
function toIsoString(value: Date): string {
  return value.toISOString()
}

/**
 * 将消息表数据库行映射为前端可直接消费的消息对象。
 *
 * 这里显式做字段投影，而不是直接透传 row，主要是为了：
 * - 屏蔽数据库内部字段
 * - 统一时间格式
 * - 避免前端无意中依赖表结构细节
 */
function mapHistoryMessage(row: typeof travelHistoryMessage.$inferSelect): HistoryMessage {
  return {
    id: row.id,
    sessionId: row.sessionId,
    seq: row.seq,
    role: row.role as HistoryMessage['role'],
    kind: row.kind as HistoryMessage['kind'],
    content: row.content,
    meta: (row.metaJson as Record<string, unknown> | null | undefined) ?? null,
    createdAt: row.createdAt.getTime(),
  }
}

/**
 * 历史列表页只需要轻量摘要字段，因此这里单独做列表投影。
 */
function mapHistoryListItem(row: typeof travelHistory.$inferSelect): HistoryListItem {
  return {
    sessionId: row.sessionId,
    title: row.title,
    destination: row.destination,
    travelDays: row.travelDays,
    travelType: row.travelType,
    status: row.status as HistoryStatus,
    latestSummary: row.latestSummary,
    updatedAt: toIsoString(row.updatedAt),
    lastMessageAt: toIsoString(row.lastMessageAt),
  }
}

/**
 * 将主表摘要态与消息明细组合成详情页 DTO。
 */
function mapHistoryDetail(
  historyRow: typeof travelHistory.$inferSelect,
  messageRows: Array<typeof travelHistoryMessage.$inferSelect>,
): HistoryDetail {
  return {
    sessionId: historyRow.sessionId,
    title: historyRow.title,
    destination: historyRow.destination,
    travelDays: historyRow.travelDays,
    travelType: historyRow.travelType,
    status: historyRow.status as HistoryStatus,
    latestSummary: historyRow.latestSummary,
    finalPlan: (historyRow.finalPlanJson as ITravelPlan | null | undefined) ?? null,
    messages: messageRows.map(mapHistoryMessage),
    conversationSnapshot:
      (historyRow.conversationSnapshotJson as ConversationRecord[] | null | undefined) ?? [],
    createdAt: toIsoString(historyRow.createdAt),
    updatedAt: toIsoString(historyRow.updatedAt),
    lastMessageAt: toIsoString(historyRow.lastMessageAt),
  }
}

/**
 * 为 history 列表推导可读标题。
 *
 * 这样即使某条记录尚未完全成功生成 finalPlan，
 * 也能从 destination/days 兜底出一个相对友好的标题。
 */
function derivePlanTitle(finalPlan: ITravelPlan | null, destination: string, travelDays: number) {
  if (finalPlan?.planName?.trim()) {
    return finalPlan.planName.trim()
  }

  if (destination && travelDays > 0) {
    return `${destination} ${travelDays} 天行程`
  }

  if (destination) {
    return `${destination} 行程`
  }

  return '未命名行程'
}

/**
 * 从意图对象中提取列表页需要的摘要字段。
 *
 * 这里故意使用“尽力提取”而不是强类型断言，原因是：
 * - state.collectedIntent 是 Graph 内部结构，允许后续演进
 * - repository 不应强依赖 agents 包内部类型，避免形成循环依赖
 */
function deriveHistorySummary(
  finalPlan: ITravelPlan | null,
  collectedIntent: unknown,
) {
  const normalizedIntent =
    collectedIntent && typeof collectedIntent === 'object'
      ? (collectedIntent as Record<string, unknown>)
      : {}

  const destination =
    (typeof normalizedIntent.destination === 'string' ? normalizedIntent.destination : '')
      || '未填写'
  const travelDays =
    finalPlan?.totalDays
      || (typeof normalizedIntent.days === 'number' ? normalizedIntent.days : 0)
  const travelType =
    finalPlan?.vehicleType
      || (typeof normalizedIntent.travelType === 'string' ? normalizedIntent.travelType : '')
      || '未填写'

  return {
    title: derivePlanTitle(finalPlan, destination, travelDays),
    destination,
    travelDays,
    travelType,
  }
}

export class HistoryRepository {
  private readonly db = getDb()

  /**
   * 确保一条 session 对应的主 history 记录存在。
   *
   * 首次创建时还会自动补一条系统欢迎语消息，原因是：
   * - 首页初始聊天区与 history 详情页需要保持体验一致
   * - 消息事实源统一存放在 message 表里，不另搞一套前端硬编码回放
   */
  async ensureHistory(sessionId: string) {
    const existing = await this.db.query.travelHistory.findFirst({
      where: and(
        eq(travelHistory.sessionId, sessionId),
        isNull(travelHistory.deletedAt),
      ),
    })

    if (existing) {
      return existing
    }

    const [created] = await this.db
      .insert(travelHistory)
      .values({
        sessionId,
        status: HISTORY_STATUS.Active,
        title: '未命名行程',
        destination: '未填写',
        travelDays: 0,
        travelType: '未填写',
        latestSummary: '',
      })
      .returning()

    if (!created) {
      throw new Error(`Failed to create history for session ${sessionId}`)
    }

    await this.appendMessage(sessionId, {
      role: HISTORY_MESSAGE_ROLE.Assistant,
      kind: HISTORY_MESSAGE_KIND.System,
      content: DEFAULT_TRAVEL_ASSISTANT_GREETING,
      createdAt: Date.now(),
    })

    return created
  }

  /**
   * 追加一条消息明细。
   *
   * 关键职责：
   * - 统一生成 `seq`
   * - 写入 message 表
   * - 顺手刷新主表的 `lastMessageAt / updatedAt`
   *
   * 这样 history 列表按最近活跃时间排序时，会自然反映会话热度。
   */
  async appendMessage(sessionId: string, record: ConversationRecord, meta?: Record<string, unknown>) {
    const history = await this.ensureHistory(sessionId)
    const nextSeq = await this.getNextSequence(sessionId)

    const [created] = await this.db
      .insert(travelHistoryMessage)
      .values({
        historyId: history.id,
        sessionId,
        seq: nextSeq,
        role: record.role,
        kind: record.kind,
        content: record.content,
        metaJson: meta ?? null,
        createdAt: new Date(record.createdAt),
      })
      .returning()

    await this.db
      .update(travelHistory)
      .set({
        lastMessageAt: new Date(record.createdAt),
        updatedAt: new Date(),
      })
      .where(eq(travelHistory.sessionId, sessionId))

    if (!created) {
      throw new Error(`Failed to append history message for session ${sessionId}`)
    }

    return created
  }

  /**
   * 更新主表上的“最新摘要态”。
   *
   * 这里不处理消息明细，只处理列表/详情都会依赖的汇总字段：
   * - status
   * - latestSummary
   * - finalPlan
   * - conversation snapshot
   * - collectedIntent / clarification / errors
   */
  async upsertHistoryState(sessionId: string, payload: UpsertHistoryPayload) {
    const summary = deriveHistorySummary(payload.finalPlan, payload.collectedIntent)

    await this.ensureHistory(sessionId)
    await this.db
      .update(travelHistory)
      .set({
        status: payload.status,
        title: payload.title || summary.title,
        destination: payload.destination || summary.destination,
        travelDays: payload.travelDays || summary.travelDays,
        travelType: payload.travelType || summary.travelType,
        latestSummary: payload.latestSummary,
        finalPlanJson: payload.finalPlan,
        collectedIntentJson: payload.collectedIntent,
        clarificationJson: payload.clarification,
        conversationSnapshotJson: payload.conversationSnapshot,
        errorJson: payload.errors,
        updatedAt: new Date(),
      })
      .where(eq(travelHistory.sessionId, sessionId))
  }

  /**
   * 获取历史列表。
   *
   * 约束：
   * - 仅返回未删除记录
   * - pageSize 上限保护，避免一次返回过多数据
   * - 默认按最近消息时间倒序，让最近聊过的记录排在前面
   */
  async list(page = 1, pageSize = 20): Promise<PaginatedData<HistoryListItem>> {
    const safePage = Math.max(page, 1)
    const safePageSize = Math.min(Math.max(pageSize, 1), 100)
    const offset = (safePage - 1) * safePageSize

    const [totalRow] = await this.db
      .select({ total: count() })
      .from(travelHistory)
      .where(isNull(travelHistory.deletedAt))

    const rows = await this.db.query.travelHistory.findMany({
      where: isNull(travelHistory.deletedAt),
      orderBy: [desc(travelHistory.lastMessageAt), desc(travelHistory.updatedAt)],
      limit: safePageSize,
      offset,
    })

    return {
      list: rows.map(mapHistoryListItem),
      total: totalRow?.total ?? 0,
      page: safePage,
      pageSize: safePageSize,
    }
  }

  /**
   * 获取单条历史详情。
   *
   * 详情由两部分构成：
   * 1. 主表中的 finalPlan / latestSummary / status 等摘要态
   * 2. 消息表中的完整聊天明细
   */
  async getDetail(sessionId: string): Promise<HistoryDetail | null> {
    const historyRow = await this.db.query.travelHistory.findFirst({
      where: and(
        eq(travelHistory.sessionId, sessionId),
        isNull(travelHistory.deletedAt),
      ),
    })

    if (!historyRow) {
      return null
    }

    const messageRows = await this.db.query.travelHistoryMessage.findMany({
      where: and(
        eq(travelHistoryMessage.sessionId, sessionId),
        isNull(travelHistoryMessage.deletedAt),
      ),
      orderBy: [asc(travelHistoryMessage.seq)],
    })

    return mapHistoryDetail(historyRow, messageRows)
  }

  /**
   * 为 Graph state 构建轻量 recent conversation snapshot。
   *
   * 这里直接从消息表反查，而不是完全信任 history 主表中的 snapshot，
   * 原因是消息表才是完整事实来源；主表 snapshot 只是为了加速读取。
   */
  async getConversationSnapshot(sessionId: string, limit = 16): Promise<ConversationRecord[]> {
    const rows = await this.db.query.travelHistoryMessage.findMany({
      where: and(
        eq(travelHistoryMessage.sessionId, sessionId),
        isNull(travelHistoryMessage.deletedAt),
      ),
      orderBy: [desc(travelHistoryMessage.seq)],
      limit,
    })

    return rows
      .reverse()
      .map((row) => ({
        role: row.role as ConversationRecord['role'],
        kind: row.kind as ConversationRecord['kind'],
        content: row.content,
        createdAt: row.createdAt.getTime(),
      }))
  }

  async softDelete(sessionId: string) {
    const now = new Date()

    // 先软删消息，再软删主表，确保不会出现“主表消失但明细仍可见”的不一致。
    await this.db
      .update(travelHistoryMessage)
      .set({ deletedAt: now })
      .where(
        and(
          eq(travelHistoryMessage.sessionId, sessionId),
          isNull(travelHistoryMessage.deletedAt),
        ),
      )

    await this.db
      .update(travelHistory)
      .set({
        deletedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(travelHistory.sessionId, sessionId),
          isNull(travelHistory.deletedAt),
        ),
      )
  }

  /**
   * 计算下一条消息的顺序号。
   *
   * 这里故意从数据库聚合，而不是在内存里自增：
   * - service 是无状态的，不能依赖本地计数器
   * - 多实例/并发场景下，数据库才是最终事实源
   */
  private async getNextSequence(sessionId: string) {
    const [row] = await this.db
      .select({
        nextSeq: sql<number>`COALESCE(MAX(${travelHistoryMessage.seq}), 0) + 1`,
      })
      .from(travelHistoryMessage)
      .where(eq(travelHistoryMessage.sessionId, sessionId))

    return row?.nextSeq ?? 1
  }
}

export const historyRepository = new HistoryRepository()
