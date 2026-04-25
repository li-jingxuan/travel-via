import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { normalizeIntent } from "../dist/src/intent/travel-intent-schema.js"

describe("normalizeIntent", () => {
  it("keeps missing destination as an empty string for clarification flow", () => {
    assert.deepEqual(normalizeIntent({}), {
      destination: "",
      departurePoint: "",
      days: 5,
      month: "未指定",
      travelType: "自由行",
    })
  })

  it("trims strings and defaults departurePoint to destination", () => {
    assert.deepEqual(
      normalizeIntent({
        destination: " 新疆 ",
        departurePoint: "",
        month: " 6月 ",
        travelType: "自驾",
      }),
      {
        destination: "新疆",
        departurePoint: "新疆",
        days: 5,
        month: "6月",
        travelType: "自驾",
      },
    )
  })

  it("coerces valid day values and falls back for invalid values", () => {
    assert.equal(normalizeIntent({ days: "15天" }).days, 15)
    assert.equal(normalizeIntent({ days: 4.6 }).days, 5)
    assert.equal(normalizeIntent({ days: -1 }).days, 5)
    assert.equal(normalizeIntent({ days: "abc" }).days, 5)
  })

  it("falls back to default travelType when model output is outside enum", () => {
    assert.equal(normalizeIntent({ travelType: "跟团游" }).travelType, "自由行")
  })

  it("keeps only non-empty optional fields", () => {
    assert.deepEqual(
      normalizeIntent({
        destination: "云南",
        budget: " 8000 ",
        travelers: " ",
        preferences: [" 摄影 ", "", 123, "美食"],
      }),
      {
        destination: "云南",
        departurePoint: "云南",
        days: 5,
        month: "未指定",
        travelType: "自由行",
        budget: "8000",
        preferences: ["摄影", "美食"],
      },
    )
  })
})
