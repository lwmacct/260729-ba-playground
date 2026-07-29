import { useEffect, useRef, useState } from "react";
import type { FormInstance } from "antd";
import {
  deriveBatonStatus,
  requireBatonEntry,
} from "@lwmacct/260729-ba-context-baton";
import { runBatonEntries } from "@lwmacct/260729-ba-framework/controller";
import { executeWorkflowStep } from "../api/workflowApi";
import { readInputBindingSource } from "../model/inputBindings";
import type {
  ContextBaton,
  WorkflowFormValues,
  WorkflowPlanItem,
  WorkflowRunState,
  WorkflowStepMetadata,
  WorkflowStepName,
} from "../model/types";
import { formatErrorMessage } from "../model/errors";

export function useWorkflowExecution(options: {
  executorBaseUrl: string;
  form: FormInstance<WorkflowFormValues>;
  notifyError(title: string, description: string, key: string): void;
  selectedPlan: WorkflowPlanItem[];
  executorToken: string;
  stepById: Map<WorkflowStepName, WorkflowStepMetadata>;
  stepsLoaded: boolean;
  syncBrowserEndpointFromContext(baton: ContextBaton): void;
  updateWorkflowContext(
    baton: ContextBaton,
    options?: { persist?: boolean; immediate?: boolean },
  ): void;
  workflowContextRef: React.MutableRefObject<ContextBaton>;
}) {
  const [runState, setRunState] = useState<WorkflowRunState | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const key = runState?.currentStep?.key;
    if (!key) {
      return;
    }
    const selector = `[data-plan-item-key="${CSS.escape(key)}"]`;
    window.requestAnimationFrame(() => {
      document.querySelector(selector)?.scrollIntoView({
        block: "center",
        behavior: "smooth",
      });
    });
  }, [runState?.currentStep?.key]);

  async function handlePlanExecute() {
    try {
      if (options.selectedPlan.length === 0) {
        throw new Error("请至少编排一个计划步骤。");
      }
      await runPlanItems(options.selectedPlan);
    } catch (error) {
      options.notifyError(
        "执行启动失败",
        formatErrorMessage(error),
        "workflow-run-start-error",
      );
    }
  }

  function handleStop() {
    abortControllerRef.current?.abort("user-cancelled");
    setRunState((current) => current ? { ...current, status: "stopping" } : current);
  }

  async function validatePlanItems(planItems: WorkflowPlanItem[]) {
    if (!options.stepsLoaded) {
      throw new Error("步骤元数据尚未加载。");
    }
    await options.form.validateFields(
      planItems.flatMap((planItem) =>
        (options.stepById.get(planItem.name)?.inputHints ?? [])
          .filter((hint) =>
            !readInputBindingSource(
              options.form.getFieldValue([
                "planStepInputs",
                planItem.key,
                hint.name,
              ]),
            ) &&
            (hint.required || hint.defaultValue !== undefined)
          )
          .map((hint) => ["planStepInputs", planItem.key, hint.name]),
      ),
    );
  }

  async function runPlanItems(planItems: WorkflowPlanItem[]) {
    await validatePlanItems(planItems);
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const startedAt = new Date().toISOString();
    setRunState({ status: "running", startedAt });
    let baton = options.workflowContextRef.current;
    const itemById = new Map(planItems.map((item) => [item.key, item]));
    try {
      const result = await runBatonEntries({
        baton,
        entryIds: planItems.map((item) => item.key),
        signal: abortController.signal,
        execute: (invocation, signal) =>
          executeWorkflowStep(
            options.executorToken,
            invocation,
            options.executorBaseUrl,
            signal,
          ),
        persist: ({ baton: nextBaton, entryId, phase }) => {
          baton = nextBaton;
          options.updateWorkflowContext(nextBaton, { immediate: true });
          if (phase === "running") {
            const entry = requireBatonEntry(nextBaton, entryId);
            const item = itemById.get(entryId);
            if (!item) return;
            setRunState({
              status: "running",
              startedAt,
              currentStep: {
                ...item,
                deadlineAt: new Date(
                  Date.parse(entry.execution.startedAt ?? startedAt) +
                    entry.policy.timeoutMs,
                ).toISOString(),
                index: nextBaton.entries.findIndex(
                  (candidate) => candidate.id === entryId,
                ),
                startedAt: entry.execution.startedAt ?? startedAt,
                status: "running",
              },
            });
            return;
          }
          options.syncBrowserEndpointFromContext(nextBaton);
          setRunState({ status: deriveBatonStatus(nextBaton), startedAt });
        },
      });
      baton = result.baton;
      setRunState({
        status: deriveBatonStatus(baton),
        startedAt,
        finishedAt: new Date().toISOString(),
      });
    } finally {
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
      }
    }
  }

  async function testSinglePlanItem(item: WorkflowPlanItem) {
    try {
      await runPlanItems([item]);
    } catch (error) {
      options.notifyError(
        "测试失败",
        formatErrorMessage(error),
        "workflow-test-step-error",
      );
    }
  }

  return {
    handlePlanExecute,
    handleStop,
    runState,
    setRunState,
    testSinglePlanItem,
  };
}
