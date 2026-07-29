import assert from "node:assert/strict";
import test from "node:test";
import {
  applyBatonCommand,
  createBaton,
  createBatonEntry,
} from "@lwmacct/260729-ba-context-baton";
import {
  findContextEntry,
  findContextEntryArrayIndex,
} from "./contextEntries";

test("finds Baton entries by stable id", () => {
  let baton = createBaton({ workflowId: "openai" });
  baton = applyBatonCommand(baton, {
    type: "entry.add",
    entry: createBatonEntry({ id: "prompt", uses: "send-chat-prompt" }),
  });
  assert.equal(findContextEntryArrayIndex(baton, "prompt"), 0);
  assert.equal(findContextEntry(baton, "prompt")?.uses, "send-chat-prompt");
});
