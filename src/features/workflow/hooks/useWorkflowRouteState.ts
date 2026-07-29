import { useEffect, useRef, useState } from "react";
import {
  getWorkflowRouteParams,
  updateWorkflowRouteParams,
} from "../../../app/routes";
import {
  RIGHT_TAB_BROWSER_VIEWER,
  RIGHT_TAB_CONTEXT,
} from "../components/WorkflowRightPanel";

const WORKFLOW_RIGHT_TABS = [
  RIGHT_TAB_BROWSER_VIEWER,
  RIGHT_TAB_CONTEXT,
] as const;
const WORKFLOW_LEFT_TABS = [
  "steps",
  "contexts",
] as const;

type WorkflowRightTabKey = typeof WORKFLOW_RIGHT_TABS[number];
type WorkflowLeftTabKey = typeof WORKFLOW_LEFT_TABS[number];

function isWorkflowRightTabKey(value: string): value is WorkflowRightTabKey {
  return WORKFLOW_RIGHT_TABS.includes(value as WorkflowRightTabKey);
}

function isWorkflowLeftTabKey(value: string): value is WorkflowLeftTabKey {
  return WORKFLOW_LEFT_TABS.includes(value as WorkflowLeftTabKey);
}

function getWorkflowRightTabFromHash() {
  const tab = getWorkflowRouteParams().tabRight ?? "";
  return isWorkflowRightTabKey(tab) ? tab : RIGHT_TAB_BROWSER_VIEWER;
}

function getWorkflowLeftTabFromHash() {
  const tab = getWorkflowRouteParams().tabLeft ?? "";
  return isWorkflowLeftTabKey(tab) ? tab : "steps";
}

function getWorkflowContextIDFromHash() {
  return getWorkflowRouteParams().context ?? "";
}

export function useWorkflowRouteState(options: {
  onContextRouteChange?: () => void;
}) {
  const selectedContextIdRef = useRef(getWorkflowContextIDFromHash());
  const [leftTabKey, setLeftTabKey] = useState<WorkflowLeftTabKey>(
    getWorkflowLeftTabFromHash,
  );
  const [rightTabKey, setRightTabKey] = useState<WorkflowRightTabKey>(
    getWorkflowRightTabFromHash,
  );
  const [selectedContextId, setSelectedContextId] = useState(
    getWorkflowContextIDFromHash,
  );

  function selectContextId(contextId: string) {
    selectedContextIdRef.current = contextId;
    setSelectedContextId(contextId);
  }

  function handleRightTabChange(activeKey: string) {
    if (isWorkflowRightTabKey(activeKey)) {
      setRightTabKey(activeKey);
    }
  }

  function handleLeftTabChange(activeKey: string) {
    if (isWorkflowLeftTabKey(activeKey)) {
      setLeftTabKey(activeKey);
    }
  }

  useEffect(() => {
    updateWorkflowRouteParams({ tabLeft: leftTabKey });
  }, [leftTabKey]);

  useEffect(() => {
    updateWorkflowRouteParams({ tabRight: rightTabKey });
  }, [rightTabKey]);

  useEffect(() => {
    function handleHashChange() {
      const nextContextId = getWorkflowContextIDFromHash();
      if (nextContextId !== selectedContextIdRef.current) {
        options.onContextRouteChange?.();
      }
      setLeftTabKey(getWorkflowLeftTabFromHash());
      setRightTabKey(getWorkflowRightTabFromHash());
      selectContextId(nextContextId);
    }

    window.addEventListener("hashchange", handleHashChange);
    return () => {
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, [options]);

  return {
    handleLeftTabChange,
    handleRightTabChange,
    leftTabKey,
    rightTabKey,
    selectContextId,
    selectedContextId,
  };
}
