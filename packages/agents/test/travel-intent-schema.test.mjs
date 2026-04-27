import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  finalizeTravelIntent,
  normalizeIntentExtraction,
} from "../dist/src/intent/travel-intent-schema.js"

describe("normalizeIntentExtraction", () => {
  it("keeps an empty extraction when the model provides no explicit user fields", () => {
    assert.deepEqual(normalizeIntentExtraction({}), {
      intentPatch: {},
      explicitFields: [],
    })
  })

  it("trims patch fields and only keeps explicit fields with valid patch values", () => {
    assert.deepEqual(
      normalizeIntentExtraction({
        intentPatch: {
          destination: " 新疆 ",
          departurePoint: " ",
          month: " 6月 ",
          travelType: "自驾",
          travelers: " 朋友 ",
        },
        explicitFields: [
          "destination",
          "departurePoint",
          "month",
          "travelType",
          "travelers",
          "unknown",
          "destination",
        ],
      }),
      {
        intentPatch: {
          destination: "新疆",
          month: "6月",
          travelType: "自驾",
          travelers: "朋友",
        },
        explicitFields: ["destination", "month", "travelType", "travelers"],
      },
    )
  })

  it("coerces valid day values but omits invalid day values from the patch", () => {
    assert.deepEqual(
      normalizeIntentExtraction({
        intentPatch: { days: "15天" },
        explicitFields: ["days"],
      }),
      {
        intentPatch: { days: 15 },
        explicitFields: ["days"],
      },
    )

    assert.deepEqual(
      normalizeIntentExtraction({
        intentPatch: { days: "abc" },
        explicitFields: ["days"],
      }),
      {
        intentPatch: {},
        explicitFields: [],
      },
    )
  })

  it("omits invalid travel type during extraction instead of defaulting early", () => {
    assert.deepEqual(
      normalizeIntentExtraction({
        intentPatch: { travelType: "跟团游" },
        explicitFields: ["travelType"],
      }),
      {
        intentPatch: {},
        explicitFields: [],
      },
    )
  })

  it("keeps only non-empty preferences", () => {
    assert.deepEqual(
      normalizeIntentExtraction({
        intentPatch: {
          preferences: [" 摄影 ", "", 123, "美食"],
        },
        explicitFields: ["preferences"],
      }),
      {
        intentPatch: {
          preferences: ["摄影", "美食"],
        },
        explicitFields: ["preferences"],
      },
    )
  })
})

describe("finalizeTravelIntent", () => {
  it("fills defaults only when entering the planning stage", () => {
    assert.deepEqual(finalizeTravelIntent({}), {
      destination: "",
      departurePoint: "",
      days: 5,
      month: "未指定",
      travelType: "自由行",
    })
  })

  it("defaults departurePoint to destination and preserves optional fields", () => {
    assert.deepEqual(
      finalizeTravelIntent({
        destination: "云南",
        days: 7,
        budget: "人均五千",
        preferences: ["古城", "美食"],
      }),
      {
        destination: "云南",
        departurePoint: "云南",
        days: 7,
        month: "未指定",
        travelType: "自由行",
        budget: "人均五千",
        preferences: ["古城", "美食"],
      },
    )
  })
})
