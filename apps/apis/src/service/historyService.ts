import { deleteGraphThread, historyRepository } from "@repo/db"
import type { HistoryDetail, PaginatedData, HistoryListItem } from "@repo/shared-types"

interface ListHistoryParams {
  page?: number
  pageSize?: number
}

/**
 * historyService 负责对外暴露稳定的业务语义：
 * - controller 不需要直接依赖 repository 细节
 * - 后续如果要加鉴权、筛选、审计日志，可以集中放在这里
 */
export async function listHistories(
  params: ListHistoryParams,
): Promise<PaginatedData<HistoryListItem>> {
  // controller 层拿到的是弱类型 query 参数；在 service 层做一次统一归一化，
  // 让 repository 后续只接收“已经清洗过”的分页入参。
  const page = Number.isFinite(params.page) ? Number(params.page) : 1
  const pageSize = Number.isFinite(params.pageSize) ? Number(params.pageSize) : 20
  return historyRepository.list(page, pageSize)
}

/**
 * 获取单条历史详情。
 *
 * 目前只是透传 repository，但保留这一层有助于未来补：
 * - 鉴权
 * - 埋点
 * - 数据脱敏
 */
export async function getHistoryDetail(sessionId: string): Promise<HistoryDetail | null> {
  return historyRepository.getDetail(sessionId)
}

/**
 * 删除历史时同时清掉 Graph checkpoints，避免旧 session_id 再次恢复出上下文。
 */
export async function deleteHistoryBySessionId(sessionId: string) {
  await historyRepository.softDelete(sessionId)
  await deleteGraphThread(sessionId)
}
