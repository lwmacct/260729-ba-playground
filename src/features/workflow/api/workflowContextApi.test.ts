import assert from "node:assert/strict";
import test from "node:test";
import "fake-indexeddb/auto";
import {
  applyBatonCommand,
  createBaton,
  createBatonEntry,
} from "@lwmacct/260729-ba-context-baton";
import {
  clearWorkflowContextStoreForTest,
  createWorkflowContext,
  fetchWorkflowContext,
  importWorkflowContexts,
  saveWorkflowContext,
} from "./workflowContextApi";

test.beforeEach(clearWorkflowContextStoreForTest);

test("persists a v1 Baton in the IndexedDB record envelope", async () => {
  let baton = createBaton({ id: "context-one", workflowId: "openai" });
  baton = applyBatonCommand(baton, {
    type: "entry.add",
    entry: createBatonEntry({ id: "init", uses: "init-data" }),
  });
  const created = await createWorkflowContext({ baton, meta: { siteCode: "openai" } });
  assert.equal(created.revision, baton.revision);
  assert.equal(created.baton.entries.length, 1);

  baton = applyBatonCommand(baton, {
    type: "entry.input.replace",
    entryId: "init",
    input: { account: "alice" },
  });
  const saved = await saveWorkflowContext(created.id, { baton, meta: created.meta });
  assert.equal(saved.revision, baton.revision);
  assert.deepEqual((await fetchWorkflowContext(created.id)).baton, baton);
});

test("imports raw Batons and record envelopes", async () => {
  const baton = createBaton({ id: "imported", workflowId: "openai" });
  const imported = await importWorkflowContexts([
    baton,
    { title: "copy", baton: createBaton({ id: "copy", workflowId: "openai" }) },
  ], {});
  assert.equal(imported.data.length, 2);
});
