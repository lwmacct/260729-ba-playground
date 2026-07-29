import { arrayMove } from "@dnd-kit/sortable";
import type { DragEndEvent } from "@dnd-kit/core";
import type { FormInstance } from "antd";
import {
  applyBatonCommand,
  collectDependentEntryIds,
  createBatonEntry,
} from "@lwmacct/260729-ba-context-baton";
import { useMemo } from "react";
import { compileStepInputBindings } from "../model/inputBindings";
import {
  createPlanItem,
  getDefaultStepInput,
} from "../model/planItems";
import type {
  ContextBaton,
  WorkflowFormValues,
  WorkflowPlanItem,
  WorkflowStepInputBinding,
  WorkflowStepMetadata,
  WorkflowStepName,
} from "../model/types";
import { formatErrorMessage } from "../model/errors";

export function useWorkflowPlanController(options: {
  form: FormInstance<WorkflowFormValues>;
  messageWarning(message: string): void;
  stepById: Map<WorkflowStepName, WorkflowStepMetadata>;
  updateWorkflowContext(context: ContextBaton): void;
  workflowContext: ContextBaton;
  workflowContextRef: React.MutableRefObject<ContextBaton>;
}) {
  const selectedPlan = useMemo(
    () => options.workflowContext.entries.map((entry) => ({
      key: entry.id,
      name: entry.uses,
      policy: entry.policy,
    })),
    [options.workflowContext],
  );

  function schedulePlanStepInputSave(
    step: WorkflowStepName,
    itemKey?: string,
  ) {
    if (!itemKey) {
      return;
    }
    window.setTimeout(() => {
      const input = options.form.getFieldValue(["planStepInputs", itemKey]) as
        | Record<string, WorkflowStepInputBinding>
        | undefined;
      const metadata = options.stepById.get(step);
      if (!metadata) {
        return;
      }
      const nextBaton = applyBatonCommand(options.workflowContextRef.current, {
        type: "entry.input.replace",
        entryId: itemKey,
        input: compileStepInputBindings(metadata, input ?? {}),
      });
      options.updateWorkflowContext(nextBaton);
    }, 0);
  }

  function addPlanStep(step: WorkflowStepName) {
    try {
      const item = createPlanItem(step);
      const metadata = options.stepById.get(step);
      const defaultBindings = getDefaultStepInput(metadata, selectedPlan);
      options.form.setFieldValue(["planStepInputs", item.key], defaultBindings);
      const input = metadata
        ? compileStepInputBindings(metadata, defaultBindings)
        : {};
      const entry = createBatonEntry({
        id: item.key,
        uses: step,
        input,
        policy: metadata?.defaultPolicy,
        ...(metadata?.resources.some(
          (resource) => resource.name === "browser" && resource.required,
        )
          ? {
              resources: {
                browser: {
                  $from: {
                    entry: findLatestBrowserEntryId(
                      options.workflowContextRef.current,
                      options.stepById,
                    ),
                    pointer: "",
                  },
                },
              },
            }
          : {}),
      });
      options.updateWorkflowContext(applyBatonCommand(
        options.workflowContextRef.current,
        { type: "entry.add", entry },
      ));
    } catch (error) {
      options.messageWarning(formatErrorMessage(error));
    }
  }

  function removePlanStep(index: number) {
    const item = selectedPlan[index];
    if (!item) {
      return;
    }
    const baton = options.workflowContextRef.current;
    const removedIds = new Set([
      item.key,
      ...collectDependentEntryIds(baton.entries, item.key),
    ]);
    let nextBaton = baton;
    for (const entry of [...baton.entries].reverse()) {
      if (removedIds.has(entry.id)) {
        nextBaton = applyBatonCommand(nextBaton, {
          type: "entry.remove",
          entryId: entry.id,
        });
      }
    }
    options.updateWorkflowContext(nextBaton);
    if (removedIds.size > 1) {
      options.messageWarning(`已同时移除 ${removedIds.size - 1} 个依赖步骤。`);
    }
  }

  function handlePlanDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }
    const activeIndex = selectedPlan.findIndex((item) => item.key === active.id);
    const overIndex = selectedPlan.findIndex((item) => item.key === over.id);
    if (activeIndex < 0 || overIndex < 0) {
      return;
    }
    try {
      arrayMove(selectedPlan, activeIndex, overIndex);
      options.updateWorkflowContext(applyBatonCommand(
        options.workflowContextRef.current,
        { type: "entry.move", entryId: String(active.id), index: overIndex },
      ));
    } catch (error) {
      options.messageWarning(formatErrorMessage(error));
    }
  }

  return {
    addPlanStep,
    handlePlanDragEnd,
    removePlanStep,
    schedulePlanStepInputSave,
    selectedPlan,
  };
}

function findLatestBrowserEntryId(
  baton: ContextBaton,
  stepById: Map<WorkflowStepName, WorkflowStepMetadata>,
) {
  for (let index = baton.entries.length - 1; index >= 0; index -= 1) {
    const entry = baton.entries[index];
    if (
      stepById.get(entry.uses)?.outputs?.some(
        (output) => output.valueFormat === "browser-endpoint",
      )
    ) {
      return entry.id;
    }
  }
  throw new Error("请先添加浏览器连接步骤。");
}
