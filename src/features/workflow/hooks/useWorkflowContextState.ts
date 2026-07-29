import { useEffect, useRef, useState } from "react";
import { createBaton } from "@lwmacct/260729-ba-context-baton";
import { createWorkflowContext, saveWorkflowContext } from "../api/workflowContextApi";
import type { WorkflowContextRecord } from "../api/workflowContextApi";
import { contextsEqual } from "../model/batonEquality";
import type { ContextBaton } from "../model/types";

const CONTEXT_SAVE_DEBOUNCE_MS = 600;

export function useWorkflowContextState(options: {
  lastSavedContextPayloadRef: React.MutableRefObject<string>;
  notifyError(title: string, description: string, key: string): void;
  onContextCreated(contextId: string): void;
  selectedContextId: string;
  setLoadedRecord(record: WorkflowContextRecord): void;
  siteCode: string;
  workflowContextRecordRef: React.MutableRefObject<WorkflowContextRecord | null>;
  workflowId: string;
}) {
  const initialBaton = createBaton({ workflowId: options.workflowId || options.siteCode });
  const contextSaveTimerRef = useRef<number | null>(null);
  const contextSaveGenerationRef = useRef(0);
  const workflowContextRef = useRef<ContextBaton>(initialBaton);
  const [workflowContext, setWorkflowContextState] = useState(initialBaton);

  useEffect(() => () => {
    if (contextSaveTimerRef.current) {
      window.clearTimeout(contextSaveTimerRef.current);
    }
  }, []);

  function cancelPendingContextSave() {
    contextSaveGenerationRef.current += 1;
    if (contextSaveTimerRef.current) {
      window.clearTimeout(contextSaveTimerRef.current);
      contextSaveTimerRef.current = null;
    }
  }

  function persistWorkflowContext(
    baton: ContextBaton,
    persistOptions: { immediate?: boolean } = {},
  ) {
    const scheduledGeneration = contextSaveGenerationRef.current;
    const scheduledRecord = options.workflowContextRecordRef.current;
    const scheduledContextId = options.selectedContextId.trim();
    const runSave = async () => {
      if (contextSaveGenerationRef.current !== scheduledGeneration) {
        return;
      }
      if (
        scheduledRecord?.id &&
        scheduledContextId !== options.selectedContextId.trim()
      ) {
        return;
      }
      try {
        const payload = {
          title: scheduledRecord?.title || baton.workflow.id,
          meta: {
            ...(scheduledRecord?.meta ?? {}),
            siteCode: options.siteCode,
          },
          baton,
        };
        const payloadKey = JSON.stringify(payload);
        if (payloadKey === options.lastSavedContextPayloadRef.current) {
          return;
        }
        const saved = scheduledRecord?.id
          ? await saveWorkflowContext(scheduledRecord.id, payload)
          : await createWorkflowContext(payload);
        if (contextSaveGenerationRef.current !== scheduledGeneration) {
          return;
        }
        options.setLoadedRecord(saved);
        if (!scheduledRecord?.id) {
          options.onContextCreated(saved.id);
        }
      } catch (error) {
        options.notifyError(
          "Context 保存失败",
          error instanceof Error ? error.message : String(error),
          "workflow-context-save-error",
        );
      }
    };
    if (contextSaveTimerRef.current) {
      window.clearTimeout(contextSaveTimerRef.current);
    }
    if (persistOptions.immediate) {
      void runSave();
      return;
    }
    contextSaveTimerRef.current = window.setTimeout(
      () => void runSave(),
      CONTEXT_SAVE_DEBOUNCE_MS,
    );
  }

  function updateWorkflowContext(
    nextContext: ContextBaton,
    updateOptions: { persist?: boolean; immediate?: boolean } = {},
  ) {
    if (contextsEqual(workflowContextRef.current, nextContext)) {
      return;
    }
    workflowContextRef.current = nextContext;
    setWorkflowContextState(nextContext);
    if (updateOptions.persist !== false) {
      persistWorkflowContext(nextContext, { immediate: updateOptions.immediate });
    }
  }

  return {
    cancelPendingContextSave,
    persistWorkflowContext,
    updateWorkflowContext,
    workflowContext,
    workflowContextRef,
  };
}
