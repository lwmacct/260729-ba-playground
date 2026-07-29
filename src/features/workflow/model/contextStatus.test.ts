import assert from "node:assert/strict";
import test from "node:test";
import {
  applyBatonCommand,
  createBaton,
  createBatonEntry,
} from "@lwmacct/260729-ba-context-baton";
import {
  createPlanRunStatusByKey,
  deriveWorkflowStatusFromBaton,
} from "./contextStatus";

test("derives plan and workflow status from Baton", () => {
  let baton = createBaton({ workflowId: "openai" });
  baton = applyBatonCommand(baton, {
    type: "entry.add",
    entry: createBatonEntry({ id: "prompt", uses: "send-chat-prompt" }),
  });
  baton = applyBatonCommand(baton, {
    type: "execution.start",
    entryId: "prompt",
  });
  assert.deepEqual(createPlanRunStatusByKey({
    baton,
    planItems: [{ key: "prompt", name: "send-chat-prompt" }],
  }), { prompt: "running" });
  assert.equal(deriveWorkflowStatusFromBaton(baton), "running");
});
