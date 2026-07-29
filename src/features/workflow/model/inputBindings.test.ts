import assert from "node:assert/strict";
import test from "node:test";
import type { WorkflowStepInputHint } from "./types";
import {
  compileStepInputBindings,
  isJsonInputHint,
  parseJsonInputLiteral,
} from "./inputBindings";

const jsonHint: WorkflowStepInputHint = {
  name: "body",
  label: "Body",
  type: "object",
  valueType: "unknown",
};

test("parses every finite JSON literal for generic JSON inputs", () => {
  assert.equal(isJsonInputHint(jsonHint), true);
  assert.deepEqual(parseJsonInputLiteral("[1, true]", jsonHint), [1, true]);
  assert.equal(parseJsonInputLiteral("null", jsonHint), null);
  assert.equal(parseJsonInputLiteral('"  text  "', jsonHint), "  text  ");
  assert.throws(() => parseJsonInputLiteral("not-json", jsonHint));
});

test("preserves JSON null and omits invalid editor drafts", () => {
  const metadata: Parameters<typeof compileStepInputBindings>[0] = {
    defaultPolicy: { onFailure: "stop", timeoutMs: 30_000 },
    limits: { minTimeoutMs: 1_000, maxTimeoutMs: 300_000 },
    inputHints: [jsonHint],
    name: "example/request",
    outputs: [],
    resources: [],
    tags: [],
    title: "Request",
    type: "action",
  };

  assert.deepEqual(compileStepInputBindings(metadata, {
    body: { mode: "literal", value: null },
  }), { body: null });
  assert.deepEqual(compileStepInputBindings(metadata, {
    body: { mode: "invalid_json", draft: "{" },
  }), {});
});
