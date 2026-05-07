import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { mergeCollectedIntentNode } from "../dist/src/nodes/system/merge-collected-intent-node.js"

function createMergeState(overrides = {}) {
  return {
    userInput: "",
    intentExtraction: null,
    collectedIntent: null,
    userDeclinedOptionalInfo: false,
    ...overrides,
  }
}

describe("mergeCollectedIntentNode clarification flow", () => {
  it("keeps asking optional fields after destination is provided", async () => {
    const result = await mergeCollectedIntentNode(
      createMergeState({
        userInput: "去新疆",
        intentExtraction: {
          intentPatch: { destination: "新疆" },
          explicitFields: ["destination"],
        },
      }),
    )

    assert.equal(result.needUserInput, true)
    assert.deepEqual(result.missingFields, [])
    assert.deepEqual(result.softMissingFields, [
      "days",
      "month",
      "departurePoint",
      "travelType",
    ])
    assert.equal(result.userDeclinedOptionalInfo, false)
  })

  it("stops optional clarification only after explicit decline", async () => {
    const result = await mergeCollectedIntentNode(
      createMergeState({
        userInput: "就这些，直接生成",
        collectedIntent: { destination: "新疆" },
      }),
    )

    assert.equal(result.needUserInput, false)
    assert.deepEqual(result.missingFields, [])
    assert.equal(result.userDeclinedOptionalInfo, true)
  })

  it("resets decline flag when user later provides optional fields", async () => {
    const result = await mergeCollectedIntentNode(
      createMergeState({
        userInput: "那就7天",
        collectedIntent: { destination: "新疆" },
        userDeclinedOptionalInfo: true,
        intentExtraction: {
          intentPatch: { days: 7 },
          explicitFields: ["days"],
        },
      }),
    )

    assert.equal(result.userDeclinedOptionalInfo, false)
    // 只要仍有软缺失且用户未拒绝，就继续追问。
    assert.equal(result.needUserInput, true)
    assert.deepEqual(result.softMissingFields, [
      "month",
      "departurePoint",
      "travelType",
    ])
  })

  it("always asks when destination is missing", async () => {
    const result = await mergeCollectedIntentNode(
      createMergeState({
        userInput: "不补充，直接生成",
        collectedIntent: { days: 5 },
        userDeclinedOptionalInfo: true,
      }),
    )

    assert.equal(result.needUserInput, true)
    assert.deepEqual(result.missingFields, ["destination"])
    assert.deepEqual(result.softMissingFields, [])
  })
})
