import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  getMissingRequiredIntentFields,
  inferExplicitIntentFields,
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

  it("does not let inferred days overwrite explicit historical days", () => {
    const previous = {
      destination: "",
      departurePoint: "",
      days: 5,
      month: "7月",
      travelType: "自驾",
    }

    const current = {
      destination: "",
      departurePoint: "",
      days: 7,
      month: "未指定",
      travelType: "自由行",
    }

    assert.deepEqual(mergeTravelIntent(previous, current, { explicitFields: [] }), {
      destination: "",
      departurePoint: "",
      days: 5,
      month: "7月",
      travelType: "自驾",
    })
  })

  it("allows explicitly mentioned days and travel type to update the collected intent", () => {
    const previous = {
      destination: "",
      departurePoint: "",
      days: 7,
      month: "7月",
      travelType: "自由行",
    }

    const current = {
      destination: "",
      departurePoint: "",
      days: 5,
      month: "未指定",
      travelType: "自驾",
    }

    assert.deepEqual(
      mergeTravelIntent(previous, current, {
        explicitFields: ["days", "travelType"],
      }),
      {
        destination: "",
        departurePoint: "",
        days: 5,
        month: "7月",
        travelType: "自驾",
      },
    )
  })

  it("infers explicit fields from user input for the reported case", () => {
    const current = {
      destination: "",
      departurePoint: "",
      days: 5,
      month: "未指定",
      travelType: "自驾",
    }

    assert.deepEqual(
      inferExplicitIntentFields("为期5天吧，自驾", current),
      ["days", "travelType"],
    )
    assert.deepEqual(
      inferExplicitIntentFields("还没想好，有什么推荐吗", {
        ...current,
        days: 7,
        travelType: "自由行",
      }),
      [],
    )
  })
})
