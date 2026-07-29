import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  createWorkflowContext,
  deleteWorkflowContext,
  fetchWorkflowContext,
  importWorkflowContexts,
  listWorkflowContexts,
  saveWorkflowContext,
} from "../api/workflowContextApi";
import type { WorkflowContextRecord } from "../api/workflowContextApi";
import type { ContextBaton } from "../model/types";

const EMPTY_WORKFLOW_CONTEXTS: WorkflowContextRecord[] = [];

export function useWorkflowContextRecords(options: {
  enabled: boolean;
  notifyError(title: string, description: string, key: string): void;
  onContextLoaded(baton: ContextBaton): void;
  onContextRouteChange(contextId: string): void;
  selectedContextId: string;
  workflowId: string;
}) {
  const loadedWorkflowContextIDRef = useRef("");
  const lastSavedContextPayloadRef = useRef("");
  const workflowContextRecordRef = useRef<WorkflowContextRecord | null>(null);
  const [workflowContextRecord, setWorkflowContextRecord] =
    useState<WorkflowContextRecord | null>(null);
  const workflowContextsQuery = useQuery({
    queryKey: ["workflow-contexts", options.workflowId],
    queryFn: () => listWorkflowContexts({ workflow: options.workflowId, limit: 100 }),
    enabled: options.enabled && Boolean(options.workflowId),
  });

  useEffect(() => {
    if (!options.enabled) {
      return;
    }
    const contextId = options.selectedContextId.trim();
    if (!contextId) {
      resetLoadedRecord();
      return;
    }
    if (loadedWorkflowContextIDRef.current === contextId) {
      return;
    }
    let ignore = false;
    fetchWorkflowContext(contextId)
      .then((record) => {
        if (!ignore) {
          setLoadedRecord(record);
          options.onContextLoaded(record.baton);
        }
      })
      .catch((error) => {
        if (!ignore) {
          options.notifyError(
            "Context 加载失败",
            error instanceof Error ? error.message : String(error),
            "workflow-context-load-error",
          );
        }
      });
    return () => {
      ignore = true;
    };
  }, [options.enabled, options.selectedContextId]);

  function resetLoadedRecord() {
    loadedWorkflowContextIDRef.current = "";
    workflowContextRecordRef.current = null;
    lastSavedContextPayloadRef.current = "";
    setWorkflowContextRecord(null);
  }

  function setLoadedRecord(record: WorkflowContextRecord) {
    loadedWorkflowContextIDRef.current = record.id;
    workflowContextRecordRef.current = record;
    lastSavedContextPayloadRef.current = JSON.stringify({
      title: record.title || record.workflow,
      meta: record.meta,
      baton: record.baton,
    });
    setWorkflowContextRecord(record);
  }

  async function createContext(baton: ContextBaton) {
    const saved = await createWorkflowContext({
      title: baton.workflow.id,
      meta: { siteCode: baton.workflow.id },
      baton,
    });
    setLoadedRecord(saved);
    options.onContextRouteChange(saved.id);
    options.onContextLoaded(saved.baton);
    void workflowContextsQuery.refetch();
    return saved;
  }

  async function deleteContexts(contextIds: string[]) {
    const ids = Array.from(new Set(contextIds.map((id) => id.trim()).filter(Boolean)));
    await Promise.all(ids.map(deleteWorkflowContext));
    if (ids.includes(options.selectedContextId.trim())) {
      resetLoadedRecord();
      options.onContextRouteChange("");
    }
    void workflowContextsQuery.refetch();
    return ids.length;
  }

  async function renameContext(contextId: string, name: string) {
    const title = name.trim();
    const record = (workflowContextsQuery.data?.data ?? [])
      .find((candidate) => candidate.id === contextId);
    if (!record || !title) {
      return undefined;
    }
    const saved = await saveWorkflowContext(contextId, {
      title,
      meta: record.meta,
      baton: record.baton,
    });
    if (options.selectedContextId.trim() === saved.id) {
      setLoadedRecord(saved);
    }
    void workflowContextsQuery.refetch();
    return saved;
  }

  async function importContexts(payload: unknown) {
    const imported = await importWorkflowContexts(payload, {
      title: options.workflowId,
      meta: { siteCode: options.workflowId },
    });
    void workflowContextsQuery.refetch();
    return imported.data;
  }

  function selectContext(contextId: string) {
    if (!contextId) {
      resetLoadedRecord();
    }
    options.onContextRouteChange(contextId);
  }

  return {
    createContext,
    deleteContexts,
    importContexts,
    lastSavedContextPayloadRef,
    renameContext,
    selectContext,
    setLoadedRecord,
    workflowContextOptions: workflowContextsQuery.data?.data ?? EMPTY_WORKFLOW_CONTEXTS,
    workflowContextRecord,
    workflowContextRecordRef,
    workflowContextsQuery,
  };
}
