import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  getMissingRequiredIntentFields,
  mergeTravelIntent,
} from "../dist/src/intent/intent-collection.js"

describe("intent collection", () => {
  it("reports destination as the only required missing field", () => {
    assert.deepEqual(getMissingRequiredIntentFields(null), ["destination"])
    assert.deepEqual(
      getMissingRequiredIntentFields({
        destination: "",
        departurePoint: "",
        days: 5,
        month: "未指定",
        travelType: "自由行",
      }),
      ["destination"],
    )
  })

  it("does not report missing fields after destination is collected", () => {
    assert.deepEqual(
      getMissingRequiredIntentFields({
        destination: "新疆",
        departurePoint: "新疆",
        days: 5,
        month: "未指定",
        travelType: "自由行",
      }),
      [],
    )
  })

  it("preserves previous non-default fields when the next turn only adds destination", () => {
    const previous = {
      destination: "",
      departurePoint: "",
      days: 15,
      month: "6月",
      travelType: "自驾",
      travelers: "朋友",
      preferences: ["摄影"],
    }

    const current = {
      destination: "新疆",
      departurePoint: "新疆",
      days: 5,
      month: "未指定",
      travelType: "自由行",
    }

    assert.deepEqual(mergeTravelIntent(previous, current), {
      destination: "新疆",
      departurePoint: "新疆",
      days: 15,
      month: "6月",
      travelType: "自驾",
      travelers: "朋友",
      preferences: ["摄影"],
    })
  })

  it("merges preferences without duplicates", () => {
    const previous = {
      destination: "云南",
      departurePoint: "云南",
      days: 5,
      month: "未指定",
      travelType: "自由行",
      preferences: ["摄影", "美食"],
    }

    const current = {
      destination: "",
      departurePoint: "",
      days: 7,
      month: "国庆",
      travelType: "骑行",
      preferences: ["美食", "避人流"],
    }

    assert.deepEqual(mergeTravelIntent(previous, current), {
      destination: "云南",
      departurePoint: "云南",
      days: 7,
      month: "国庆",
      travelType: "骑行",
      preferences: ["摄影", "美食", "避人流"],
    })
  })

  it("moves default departurePoint with destination changes", () => {
    const previous = {
      destination: "新疆",
      departurePoint: "新疆",
      days: 5,
      month: "未指定",
      travelType: "自由行",
    }

    const current = {
      destination: "云南",
      departurePoint: "云南",
      days: 5,
      month: "未指定",
      travelType: "自由行",
    }

    assert.deepEqual(mergeTravelIntent(previous, current), {
      destination: "云南",
      departurePoint: "云南",
      days: 5,
      month: "未指定",
      travelType: "自由行",
    })
  })
})
