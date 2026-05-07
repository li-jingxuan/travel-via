import type { IActivity } from "@repo/shared-types/travel"
import type { TravelStateAnnotation } from "../graph/state.js"
import type { RouteSkeletonActivity } from "../types/index.js"
import { AmapPoiCandidate, searchScenicPois } from "../lib/amap/index.js"
import { ERROR_CODE, createIssue, type IssueItem } from "../constants/error-code.js"
import { agentLog } from "../lib/logger.js"

// LLM 偶尔会把“参观/游览/打卡”等动作词拼到地点名后面。
// 这里做轻量兜底清洗，尽量保留标准 POI 名称，提高高德检索命中率。
const normalizeActivityPoiName = (name: string): string =>
  name
    .trim()
    .replace(/(参观|游览|打卡|体验|漫步|逛街|拍照|观光|休整|入住)$/, "")
    .trim()

const POI_NAME_SUFFIX_PATTERN = /(景区|风景区|旅游区|文化旅游区|国家森林公园|森林公园|湿地公园|公园|博物馆|纪念馆|遗址|旧址|广场)$/

// 名称归一化：
// - 去除空白/括号/连接符等噪声字符
// - 去掉常见后缀，减少“同一景点不同写法”带来的误判
const normalizePoiName = (name: string): string =>
  name
    .trim()
    .replace(/[()（）·•\-—_\s]/g, "")
    .replace(POI_NAME_SUFFIX_PATTERN, "")
    .trim()

// 字符级 Jaccard 相似度（适合中文短文本的轻量近似比较）。
// 这里不用复杂分词，目的是在性能可控前提下做一层兜底判定。
const calcCharJaccard = (a: string, b: string): number => {
  if (!a || !b) return 0
  const setA = new Set(a.split(""))
  const setB = new Set(b.split(""))
  const intersection = [...setA].filter((ch) => setB.has(ch)).length
  const union = new Set([...setA, ...setB]).size
  if (union === 0) return 0
  return intersection / union
}

// 名称匹配策略（从严到宽）：
// 1) 归一化后全等
// 2) 归一化后互相包含
// 3) 字符级相似度达到阈值（0.65）
// function isNameMatch(expectedName: string, candidateName: string): boolean {
//   const expected = normalizePoiName(expectedName)
//   const candidate = normalizePoiName(candidateName)
//   if (!expected || !candidate) return false
//   if (expected === candidate) return true
//   if (expected.includes(candidate) || candidate.includes(expected)) return true

//   // 相似度阈值先调低
//   // 比如：李子坝轻轨站 -> 李子坝（地铁站），实际是一个地方，但是相似度只有 0.4 左右。
//   return calcCharJaccard(expected, candidate) >= 0.4
// }

const buildFallbackActivity = ({
  name,
  description,
  suggestedHours,
}: RouteSkeletonActivity): IActivity => ({
  name,
  description,
  suggestedHours,
  ticketPriceCny: 0,
  openingHours: "",
  images: [],
})

const buildEnrichedDescription = (
  description: string,
  rating?: number | null,
  avgCostCny?: number | null,
) => {
  const ratingText = rating ? `评分${rating}` : ""
  const costText = avgCostCny ? `人均约${avgCostCny}元` : ""

  return `${description}（${ratingText}，${costText}）`
}

const buildEnrichedActivity = (
  activity: RouteSkeletonActivity,
  {
    name,
    rating,
    avgCostCny,
    openingHours,
    images,
  }: Awaited<ReturnType<typeof searchScenicPois>>[number],
): IActivity => ({
  name,
  description: buildEnrichedDescription(activity.description, rating, avgCostCny),
  suggestedHours: activity.suggestedHours,
  ticketPriceCny: avgCostCny ?? 0,
  openingHours: openingHours ?? "待查询",
  images,
})

// 候选选择策略：
// - 不再盲选第一个候选
// - 只选择与活动名通过 isNameMatch 的候选
function selectBestMatchedCandidate(
  activityName: string,
  candidates: Awaited<ReturnType<typeof searchScenicPois>>,
): AmapPoiCandidate | undefined {
  const firstCandidate = candidates[0]

  // TODO AI 返回的名称很有可能和实际地名不一致，暂时先选择第一个
  // return candidates.find((item) => isNameMatch(activityName, item.name))

  return firstCandidate && {
    ...firstCandidate,
    name: activityName,
  }
}

/**
 * POI enrich 节点：
 * - 读取 routeSkeleton 中每天的活动骨架
 * - 按活动名称向高德检索候选景点详情
 * - 产出 enrichedActivities(Map<dayIndex, IActivity[]>)
 *
 * 失败策略：单个景点查询失败时降级为 skeleton 原始数据，不中断整图。
 */
export async function poiEnricherNode(
  state: typeof TravelStateAnnotation.State,
) {
  const skeleton = state.routeSkeleton
  const intent = state.intent

  agentLog("景点增强", "开始进行景点增强", {
    routeDays: skeleton?.length ?? 0,
  })

  if (!skeleton || !intent) {
    agentLog("景点增强", "缺少 routeSkeleton 或 intent，跳过景点增强")
    return {}
  }

  const activityMap = new Map<number, IActivity[]>()
  const issues: IssueItem[] = []

  for (const dayPlan of skeleton) {
    const { day, activities } = dayPlan
    const dayIndex = Math.max(day - 1, 0)
    const dayActivities: IActivity[] = []

    for (const activity of activities) {
      const { city, name } = activity
      // 没有城市信息依旧进行检索
      const cityHint = city?.trim() || ''
      const keyword = normalizeActivityPoiName(name)

      if(!keyword) {
        issues.push(
          createIssue(ERROR_CODE.POI_ENRICH, `缺少 name - day${day} ${name || "unknown"}`),
        )
        continue
      }
      if (!cityHint) {
        issues.push(
          createIssue(ERROR_CODE.POI_ENRICH, `缺少 city - day${day} ${name || "unknown"}`),
        )
      }

      // 先召回候选，再做名称匹配守门，避免把“热门但不相关”的 POI 写回结果。
      const candidates = await searchScenicPois(cityHint, keyword, 3)
      const best = selectBestMatchedCandidate(name, candidates)

      if (!best) {
        // 名称不匹配时，宁可降级为骨架数据，也不写入错误景点详情。
        issues.push(
          createIssue(
            ERROR_CODE.POI_ENRICH,
            `未找到名称匹配景点 - day${day} ${cityHint} ${keyword} - params: ${JSON.stringify({ cityHint, keyword })}`,
          ),
        )
        dayActivities.push(buildFallbackActivity(activity))
        continue
      }

      console.log("[amap poi]: ", best)
      dayActivities.push(buildEnrichedActivity(activity, best))
    }

    activityMap.set(dayIndex, dayActivities)
    agentLog("景点增强", `第${day}天完成`, `活动数=${dayActivities.length}`)
  }

  agentLog("景点增强", "景点增强完成", {
    dayCount: activityMap.size,
    issueCount: issues.length,
    issues
  })

  return {
    enrichedActivities: activityMap,
    ...(issues.length > 0 ? { issues } : {}),
  }
}
