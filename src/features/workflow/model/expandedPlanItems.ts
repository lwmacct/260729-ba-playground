import type { WorkflowPlanItem } from "./types";

const PLAN_STEP_EXPANDED_STORAGE_PREFIX = "workflow.planStepExpanded";

function getPlanStepExpandedStorageKey(workflowId: string, contextId: string) {
  return [
    PLAN_STEP_EXPANDED_STORAGE_PREFIX,
    workflowId.trim() || "default",
    contextId.trim() || "draft",
  ].join(":");
}

export function pruneExpandedPlanItems(
  expandedItems: Record<string, boolean>,
  planItems: WorkflowPlanItem[],
) {
  const planItemKeys = new Set(planItems.map((item) => item.key));
  return Object.fromEntries(
    Object.entries(expandedItems)
      .filter(([key, expanded]) => expanded && planItemKeys.has(key)),
  );
}

export function readStoredExpandedPlanItems(
  workflowId: string,
  contextId: string,
  planItems: WorkflowPlanItem[],
) {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const rawValue = window.localStorage.getItem(
      getPlanStepExpandedStorageKey(workflowId, contextId),
    );
    const parsed = rawValue ? JSON.parse(rawValue) as unknown : [];
    if (!Array.isArray(parsed)) {
      return {};
    }
    const expandedItems = Object.fromEntries(
      parsed
        .filter((key): key is string => typeof key === "string" && key.trim().length > 0)
        .map((key) => [key, true]),
    );
    return pruneExpandedPlanItems(expandedItems, planItems);
  } catch {
    return {};
  }
}

export function writeStoredExpandedPlanItems(
  workflowId: string,
  contextId: string,
  expandedItems: Record<string, boolean>,
) {
  if (typeof window === "undefined") {
    return;
  }
  const storageKey = getPlanStepExpandedStorageKey(workflowId, contextId);
  const expandedKeys = Object.entries(expandedItems)
    .filter(([, expanded]) => expanded)
    .map(([key]) => key);
  if (expandedKeys.length === 0) {
    window.localStorage.removeItem(storageKey);
    return;
  }
  window.localStorage.setItem(storageKey, JSON.stringify(expandedKeys));
}
