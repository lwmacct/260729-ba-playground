import {
  isBatonReference,
} from "@lwmacct/260729-ba-context-baton";
import type {
  JsonObject,
  JsonValue,
} from "@lwmacct/260729-ba-context-baton";
import type {
  WorkflowInputLiteralValue,
  WorkflowInputReference,
  WorkflowInputSource,
  WorkflowPlanItem,
  WorkflowStepInputBinding,
  WorkflowStepInputHint,
  WorkflowStepMetadata,
} from "./types";

function isWorkflowInputSource(value: unknown): value is WorkflowInputSource {
  return Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as WorkflowInputSource).entry === "string" &&
    typeof (value as WorkflowInputSource).pointer === "string";
}

function isWorkflowInputLiteralValue(value: unknown): value is WorkflowInputLiteralValue {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
    return typeof value !== "number" || Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return value.every(isWorkflowInputLiteralValue);
  }
  return Boolean(value) &&
    typeof value === "object" &&
    Object.values(value as Record<string, unknown>).every(isWorkflowInputLiteralValue);
}

export function isWorkflowInputReference(
  value: unknown,
): value is WorkflowInputReference {
  return isBatonReference(value);
}

export function readInputBindingSource(
  binding: WorkflowStepInputBinding | undefined,
) {
  return binding?.mode === "step_output" ? binding.source : undefined;
}

export function encodeInputSourceValue(source: WorkflowInputSource) {
  return JSON.stringify([source.entry, source.pointer]);
}

export function decodeInputSourceValue(value: string): WorkflowInputSource | undefined {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (
      !Array.isArray(parsed) ||
      parsed.length !== 2 ||
      typeof parsed[0] !== "string" ||
      typeof parsed[1] !== "string"
    ) {
      return undefined;
    }
    return { entry: parsed[0], pointer: parsed[1] };
  } catch {
    return undefined;
  }
}

export function isWorkflowStepInputBinding(
  value: unknown,
): value is WorkflowStepInputBinding {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const binding = value as WorkflowStepInputBinding;
  if (binding.mode === "invalid_json") {
    return typeof binding.draft === "string";
  }
  if (binding.mode === "literal") {
    return binding.value === undefined || isWorkflowInputLiteralValue(binding.value);
  }
  return binding.mode === "step_output" && isWorkflowInputSource(binding.source);
}

export function sanitizeStepInputBindings(
  value: unknown,
  metadata?: WorkflowStepMetadata,
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const input = value as Record<string, unknown>;
  const entries = metadata
    ? metadata.inputHints.map((hint) => [hint.name, input[hint.name]] as const)
    : Object.entries(input);
  return Object.fromEntries(
    entries.filter(([, binding]) => isWorkflowStepInputBinding(binding)),
  ) as Record<string, WorkflowStepInputBinding>;
}

export function isPresentLiteralValue(value: unknown) {
  return typeof value === "string"
    ? value.trim().length > 0
    : value !== undefined && value !== null;
}

export function isJsonInputHint(hint: WorkflowStepInputHint) {
  return hint.type === "object" && hint.valueType === "unknown";
}

export function parseJsonInputLiteral(
  value: string,
  hint: WorkflowStepInputHint,
): WorkflowInputLiteralValue {
  const parsed = JSON.parse(value) as unknown;
  if (
    hint.valueType === "object" &&
    (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
  ) {
    throw new Error(`${hint.label || hint.name} must be a JSON object.`);
  }
  return toJsonValue(parsed);
}

export function isPresentInputBinding(
  binding: WorkflowStepInputBinding | undefined,
  hint?: WorkflowStepInputHint,
) {
  return Boolean(binding) &&
    binding?.mode !== "invalid_json" &&
    (binding?.mode !== "literal" ||
      (binding.value === null && hint && isJsonInputHint(hint)) ||
      isPresentLiteralValue(binding.value));
}

function normalizeLiteralValue(
  value: WorkflowInputLiteralValue | undefined,
  hint?: WorkflowStepInputHint,
) {
  return typeof value === "string" && (!hint || !isJsonInputHint(hint))
    ? value.trim()
    : value;
}

export function compileInputBinding(
  binding: WorkflowStepInputBinding | undefined,
  hint?: WorkflowStepInputHint,
) {
  if (!binding || binding.mode === "invalid_json") {
    return undefined;
  }
  return binding.mode === "literal"
    ? normalizeLiteralValue(binding.value, hint)
    : { $from: binding.source };
}

export function createLiteralInputBinding(
  value?: WorkflowInputLiteralValue,
): WorkflowStepInputBinding {
  return { mode: "literal", value };
}

export function createInputBindingFromPayload(
  value: unknown,
): WorkflowStepInputBinding | undefined {
  if (isWorkflowInputReference(value)) {
    return { mode: "step_output", source: value.$from };
  }
  return isWorkflowInputLiteralValue(value)
    ? createLiteralInputBinding(value)
    : undefined;
}

function resolveDefaultSource(
  hint: WorkflowStepInputHint,
  planItems: WorkflowPlanItem[],
): WorkflowInputSource | undefined {
  const value = hint.defaultValue;
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !("$from" in value) ||
    !value.$from ||
    typeof value.$from !== "object" ||
    Array.isArray(value.$from)
  ) {
    return undefined;
  }
  const source = value.$from as unknown as {
    type?: unknown;
    uses?: unknown;
    match?: unknown;
    pointer?: unknown;
  };
  if (
    source.type !== "step_output_selector" ||
    typeof source.uses !== "string" ||
    source.match !== "latest" ||
    typeof source.pointer !== "string"
  ) {
    return undefined;
  }
  let entry: WorkflowPlanItem | undefined;
  for (let index = planItems.length - 1; index >= 0; index -= 1) {
    if (planItems[index]?.name === source.uses) {
      entry = planItems[index];
      break;
    }
  }
  return entry ? { entry: entry.key, pointer: source.pointer } : undefined;
}

export function createDefaultInputBinding(
  hint: WorkflowStepInputHint,
  planItems: WorkflowPlanItem[] = [],
): WorkflowStepInputBinding | undefined {
  const source = resolveDefaultSource(hint, planItems);
  if (source) {
    return { mode: "step_output", source };
  }
  return createInputBindingFromPayload(hint.defaultValue);
}

export function createDefaultStepInputBindings(
  metadata: WorkflowStepMetadata | undefined,
  planItems: WorkflowPlanItem[] = [],
) {
  if (!metadata) {
    return {};
  }
  return Object.fromEntries(
    metadata.inputHints
      .map((hint) => [hint.name, createDefaultInputBinding(hint, planItems)] as const)
      .filter(([, binding]) => binding !== undefined),
  ) as Record<string, WorkflowStepInputBinding>;
}

export function compileStepInputBindings(
  metadata: WorkflowStepMetadata,
  input: Record<string, WorkflowStepInputBinding | undefined>,
): JsonObject {
  return Object.fromEntries(
    metadata.inputHints
      .map((hint) => [hint, input[hint.name]] as const)
      .filter(([hint, binding]) => isPresentInputBinding(binding, hint))
      .map(([hint, binding]) => [
        hint.name,
        compileInputBinding(binding, hint),
      ] as const),
  ) as JsonObject;
}

export function toJsonValue(value: unknown): JsonValue {
  if (!isWorkflowInputLiteralValue(value)) {
    throw new Error("value must be JSON serializable.");
  }
  return value;
}
