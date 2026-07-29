import { deriveBatonStatus } from "@lwmacct/260729-ba-context-baton";
import {
  createDefaultStepInputBindings,
  createInputBindingFromPayload,
} from "./inputBindings";
import type {
  ContextBaton,
  WorkflowPlanItem,
  WorkflowRunState,
  WorkflowStepMetadata,
  WorkflowStepName,
} from "./types";

export function createPlanItem(step: WorkflowStepName): WorkflowPlanItem {
  return { key: crypto.randomUUID(), name: step };
}

export function getDefaultStepInput(
  metadata?: WorkflowStepMetadata,
  existingItems: WorkflowPlanItem[] = [],
) {
  return createDefaultStepInputBindings(metadata, existingItems);
}

export function createPlanItemsFromContext(baton: ContextBaton) {
  return baton.entries.map((entry) => ({
    key: entry.id,
    name: entry.uses,
    policy: entry.policy,
  }));
}

export function createPlanStepInputsFromContext(baton: ContextBaton) {
  return Object.fromEntries(
    baton.entries.map((entry) => [
      entry.id,
      Object.fromEntries(
        Object.entries(entry.input)
          .map(([key, value]) => [key, createInputBindingFromPayload(value)] as const)
          .filter(([, value]) => value !== undefined),
      ),
    ]),
  );
}

export function createRunStateFromContext(
  baton: ContextBaton,
  previous: WorkflowRunState | null,
): WorkflowRunState | null {
  if (baton.entries.length === 0) {
    return null;
  }
  const status = deriveBatonStatus(baton);
  const runningIndex = baton.entries.findIndex(
    (entry) => entry.execution.status === "running",
  );
  const runningEntry = runningIndex >= 0 ? baton.entries[runningIndex] : undefined;
  return {
    status,
    ...(runningEntry
      ? {
          currentStep: {
            key: runningEntry.id,
            name: runningEntry.uses,
            deadlineAt: new Date(
              new Date(runningEntry.execution.startedAt ?? baton.updatedAt).getTime() +
                runningEntry.policy.timeoutMs,
            ).toISOString(),
            index: runningIndex,
            startedAt: runningEntry.execution.startedAt ?? baton.updatedAt,
            status: "running" as const,
          },
        }
      : {}),
    ...(previous?.startedAt ? { startedAt: previous.startedAt } : {}),
    ...(status !== "draft" && status !== "running"
      ? { finishedAt: baton.updatedAt }
      : {}),
  };
}
