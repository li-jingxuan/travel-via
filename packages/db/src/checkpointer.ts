import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres'
import { getDatabaseConfig } from './config.js'

let checkpointerPromise: Promise<PostgresSaver> | null = null

/**
 * LangGraph 的 PostgresSaver 需要在首次使用时执行 setup() 建表。
 *
 * 这里做成单例 Promise，避免：
 * 1. 并发请求同时触发 setup()，造成重复初始化
 * 2. 每次调用都重新创建 checkpointer 实例
 *
 * 额外考虑：
 * - API 服务与 Graph 可能在同一进程内多次读取这个实例
 * - setup() 本身是 I/O 操作，用 Promise 单例能天然吸收并发等待
 */
export function getGraphCheckpointer(): Promise<PostgresSaver> {
  if (checkpointerPromise) {
    return checkpointerPromise
  }

  checkpointerPromise = (async () => {
    const { connectionString } = getDatabaseConfig()
    const checkpointer = PostgresSaver.fromConnString(connectionString)

    await checkpointer.setup()
    return checkpointer
  })()

  return checkpointerPromise
}

/**
 * 删除一条历史记录时，要一并清掉对应 thread 的 checkpoints，
 * 否则同一个 session_id 仍可能被 Graph 当作旧线程继续恢复。
 */
export async function deleteGraphThread(threadId: string) {
  const checkpointer = await getGraphCheckpointer()
  await checkpointer.deleteThread(threadId)
}
