import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { routeAfterRequirementGuard } from "../dist/src/graph/routing.js"
import { preparePlannerIntentNode } from "../dist/src/nodes/system/prepare-planner-intent-node.js"

function createState(overrides = {}) {
  return {
    needUserInput: false,
    missingFields: [],
    collectedIntent: null,
    intent: null,
    ...overrides,
  }
}

describe("routeAfterRequirementGuard", () => {
  it("routes to ask_clarification when needUserInput is true", () => {
    const route = routeAfterRequirementGuard(
      createState({
        needUserInput: true,
        missingFields: [],
        collectedIntent: { destination: "新疆" },
      }),
    )

    assert.equal(route, "ask_clarification")
  })

  it("routes to prepare_planner_intent when no user input is needed", () => {
    const route = routeAfterRequirementGuard(
      createState({
        needUserInput: false,
        missingFields: [],
        collectedIntent: { destination: "新疆" },
      }),
    )

    assert.equal(route, "prepare_planner_intent")
  })
})

describe("preparePlannerIntentNode", () => {
  it("finalizes intent defaults only before planner stage", async () => {
    const result = await preparePlannerIntentNode(
      createState({
        collectedIntent: { destination: "新疆" },
      }),
    )

    assert.deepEqual(result.intent, {
      destination: "新疆",
      departurePoint: "新疆",
      days: 5,
      month: "未指定",
      travelType: "自由行",
    })
  })
})

