import { deriveBatonStatus } from "@lwmacct/260729-ba-context-baton";
import type {
  ContextBaton,
  WorkflowCurrentStep,
  WorkflowPlanItem,
  WorkflowRunStatus,
} from "./types";

export function createPlanRunStatusByKey(options: {
  baton: ContextBaton;
  currentStep?: WorkflowCurrentStep;
  planItems: WorkflowPlanItem[];
}): Record<string, string> {
  const statuses = Object.fromEntries(
    options.baton.entries.map((entry) => [entry.id, entry.execution.status]),
  );
  if (options.currentStep?.key) {
    statuses[options.currentStep.key] = "running";
  }
  return statuses;
}

export function deriveWorkflowStatusFromBaton(
  baton: ContextBaton,
): WorkflowRunStatus {
  return deriveBatonStatus(baton);
}
