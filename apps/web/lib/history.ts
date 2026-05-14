import type {
  DeleteHistoryResponse,
  GetHistoryDetailResponse,
  GetHistoryListResponse,
  HistoryDetail,
  HistoryListItem,
} from "@repo/shared-types/history";
import type { PaginatedData } from "@repo/shared-types/api";
import { request } from "./request";

interface HistoryListParams {
  page?: number;
  pageSize?: number;
}

function buildQuery(params: HistoryListParams) {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set("page", String(params.page));
  if (params.pageSize) searchParams.set("pageSize", String(params.pageSize));

  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

/**
 * 历史相关请求统一收敛在这里，页面层只拿“可直接消费”的数据。
 */
export async function fetchHistoryList(
  params: HistoryListParams = {},
): Promise<PaginatedData<HistoryListItem>> {
  const response = await request<GetHistoryListResponse>(`/api/history${buildQuery(params)}`, {
    method: "GET",
  });
  return response.data;
}

export async function fetchHistoryDetail(sessionId: string): Promise<HistoryDetail> {
  const response = await request<GetHistoryDetailResponse>(`/api/history/${encodeURIComponent(sessionId)}`, {
    method: "GET",
  });
  return response.data;
}

export async function deleteHistory(sessionId: string): Promise<void> {
  await request<DeleteHistoryResponse>("/api/history/delete", {
    method: "POST",
    body: { sessionId },
  });
}
