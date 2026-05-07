import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  getMissingRequiredIntentFields,
  mergeTravelIntentPatch,
} from "../dist/src/intent/intent-collection.js"
import { finalizeTravelIntent } from "../dist/src/intent/travel-intent-schema.js"

describe("intent collection", () => {
  it("reports destination as the only required missing field", () => {
    assert.deepEqual(getMissingRequiredIntentFields(null), ["destination"])
    assert.deepEqual(getMissingRequiredIntentFields({}), ["destination"])
  })

  it("does not report missing fields after destination is collected", () => {
    assert.deepEqual(
      getMissingRequiredIntentFields({
        destination: "新疆",
      }),
      [],
    )
  })

  it("preserves previous fields when the next turn only changes destination", () => {
    const previous = {
      destination: "新疆",
      days: 15,
      month: "6月",
      travelType: "自驾",
      travelers: "朋友",
      preferences: ["摄影"],
    }

    const current = {
      destination: "云南",
    }

    const merged = mergeTravelIntentPatch(previous, current, ["destination"])

    assert.deepEqual(merged, {
      destination: "云南",
      days: 15,
      month: "6月",
      travelType: "自驾",
      travelers: "朋友",
      preferences: ["摄影"],
    })
    assert.deepEqual(finalizeTravelIntent(merged), {
      destination: "云南",
      departurePoint: "云南",
      days: 15,
      month: "6月",
      travelType: "自驾",
      travelers: "朋友",
      preferences: ["摄影"],
    })
  })

  it("updates explicitly mentioned days and travel type", () => {
    const previous = {
      destination: "新疆",
      days: 15,
      month: "6月",
      travelType: "自驾",
    }

    const current = {
      days: 7,
      travelType: "骑行",
    }

    assert.deepEqual(
      mergeTravelIntentPatch(previous, current, ["days", "travelType"]),
      {
        destination: "新疆",
        days: 7,
        month: "6月",
        travelType: "骑行",
      },
    )
  })

  it("does not use unmarked patch fields to overwrite collected intent", () => {
    const previous = {
      destination: "新疆",
      days: 15,
      travelType: "自驾",
    }

    const current = {
      days: 5,
      travelType: "自由行",
    }

    assert.deepEqual(mergeTravelIntentPatch(previous, current, []), {
      destination: "新疆",
      days: 15,
      travelType: "自驾",
    })
  })

  it("supports semantic normalization supplied by the IntentAgent", () => {
    const previous = {
      destination: "新疆",
      travelType: "自驾",
    }

    // 模拟用户说“去魔都玩一周”：LLM 已经把魔都归一为上海、一周归一为 7 天。
    const current = {
      destination: "上海",
      days: 7,
    }

    assert.deepEqual(
      mergeTravelIntentPatch(previous, current, ["destination", "days"]),
      {
        destination: "上海",
        travelType: "自驾",
        days: 7,
      },
    )
  })

  it("merges preferences without duplicates", () => {
    const previous = {
      destination: "云南",
      preferences: ["摄影", "美食"],
    }

    const current = {
      budget: "人均五千",
      preferences: ["美食", "避人流"],
    }

    assert.deepEqual(
      mergeTravelIntentPatch(previous, current, ["budget", "preferences"]),
      {
        destination: "云南",
        budget: "人均五千",
        preferences: ["摄影", "美食", "避人流"],
      },
    )
  })

  it("keeps an explicit departure point independent from later destination changes", () => {
    const previous = {
      destination: "新疆",
      departurePoint: "北京",
      days: 10,
    }

    const current = {
      destination: "云南",
    }

    assert.deepEqual(
      finalizeTravelIntent(
        mergeTravelIntentPatch(previous, current, ["destination"]),
      ),
      {
        destination: "云南",
        departurePoint: "北京",
        days: 10,
        month: "未指定",
        travelType: "自由行",
      },
    )
  })
})
