import { useEffect, useState } from "react";
import {
  pruneExpandedPlanItems,
  readStoredExpandedPlanItems,
  writeStoredExpandedPlanItems,
} from "../model/expandedPlanItems";
import type { WorkflowPlanItem } from "../model/types";

export function usePlanExpansion(options: {
  contextId: string;
  planItems: WorkflowPlanItem[];
  workflowId: string;
}) {
  const [expandedPlanItems, setExpandedPlanItems] = useState<
    Record<string, boolean>
  >({});

  useEffect(() => {
    setExpandedPlanItems(
      readStoredExpandedPlanItems(
        options.workflowId,
        options.contextId,
        options.planItems,
      ),
    );
  }, [options.contextId, options.planItems, options.workflowId]);

  function updateExpandedPlanItems(nextExpandedItems: Record<string, boolean>) {
    const prunedItems = pruneExpandedPlanItems(nextExpandedItems, options.planItems);
    writeStoredExpandedPlanItems(
      options.workflowId,
      options.contextId,
      prunedItems,
    );
    setExpandedPlanItems(prunedItems);
  }

  function togglePlanItem(itemKey: string) {
    setExpandedPlanItems((current) => {
      const nextExpandedItems = pruneExpandedPlanItems({
        ...current,
        [itemKey]: !current[itemKey],
      }, options.planItems);
      writeStoredExpandedPlanItems(
        options.workflowId,
        options.contextId,
        nextExpandedItems,
      );
      return nextExpandedItems;
    });
  }

  function expandAllPlanItems() {
    updateExpandedPlanItems(
      Object.fromEntries(options.planItems.map((item) => [item.key, true])),
    );
  }

  function collapseAllPlanItems() {
    updateExpandedPlanItems({});
  }

  return {
    collapseAllPlanItems,
    expandedPlanItems,
    expandAllPlanItems,
    togglePlanItem,
  };
}
