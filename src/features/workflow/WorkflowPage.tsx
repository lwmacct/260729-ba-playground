import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import {
  App as AntdApp,
  Form,
  Space,
} from "antd";
import { WorkbenchPage } from "@lwmacct/260627-antd-workbench";
import { useEffect, useMemo, useState } from "react";
import { createBaton } from "@lwmacct/260729-ba-context-baton";
import { updateWorkflowRouteParams } from "../../app/routes";
import { ResizableWorkspace } from "../../shared/ui/ResizableWorkspace";
import { showErrorNotification } from "../../shared/ui/notifications";
import {
  WorkflowRightPanel,
} from "./components/WorkflowRightPanel";
import {
  WorkflowPlanPanel,
} from "./components/WorkflowPlanPanel";
import { WorkflowStepsPanel } from "./components/WorkflowStepsPanel";
import { defaultFormValues } from "./model/workflowOptions";
import {
  getWorkflowExecutorById,
  readWorkflowExecutorSettings,
} from "./model/executorSettings";
import {
  createPlanRunStatusByKey,
} from "./model/contextStatus";
import type {
  WorkflowFormValues,
  ContextBaton,
  WorkflowStepType,
} from "./model/types";
import { formatErrorMessage } from "./model/errors";
import {
  getBrowserEndpointFromContext,
} from "./model/browserEndpoint";
import {
  buildOutputSourceOptions,
} from "./model/outputOptions";
import {
  createPlanItemsFromContext,
  createPlanStepInputsFromContext,
  createRunStateFromContext,
} from "./model/planItems";
import { useWorkflowRouteState } from "./hooks/useWorkflowRouteState";
import { useWorkflowSteps } from "./hooks/useWorkflowSteps";
import { usePlanExpansion } from "./hooks/usePlanExpansion";
import { useWorkflowContextRecords } from "./hooks/useWorkflowContextRecords";
import { useWorkflowContextState } from "./hooks/useWorkflowContextState";
import { useWorkflowExecution } from "./hooks/useWorkflowExecution";
import { useWorkflowPlanController } from "./hooks/useWorkflowPlanController";
import styles from "./WorkflowPage.module.css";

export function WorkflowPage() {
  const { message, notification } = AntdApp.useApp();
  const [form] = Form.useForm<WorkflowFormValues>();
  const [stepSearch, setStepSearch] = useState("");
  const [stepTypeFilter, setStepTypeFilter] = useState<WorkflowStepType | "">("");
  const [stepTagFilter, setStepTagFilter] = useState("");
  const [executorSettings] = useState(readWorkflowExecutorSettings);
  const {
    handleLeftTabChange,
    handleRightTabChange,
    leftTabKey,
    rightTabKey,
    selectContextId,
    selectedContextId,
  } = useWorkflowRouteState({});
  const selectedWorkflowId =
    Form.useWatch("workflowId", form) ?? defaultFormValues.workflowId;
  const selectedWorkflow = getWorkflowExecutorById(
    executorSettings,
    selectedWorkflowId,
  );
  const workflowSiteCode = selectedWorkflow.id;
  const workflowExecutorBaseUrl = selectedWorkflow.baseUrl;
  const workflowExecutorToken = selectedWorkflow.token ?? "";
  const currentWorkflowContextId = selectedContextId.trim();
  const expandedPlanStorageWorkflowId = selectedWorkflowId.trim() || selectedWorkflow.id;

  const {
    availableSteps,
    filteredSteps,
    stepTags,
    stepTypes,
    stepById,
    stepsQuery,
  } = useWorkflowSteps({
    baseUrl: workflowExecutorBaseUrl,
    executorToken: workflowExecutorToken,
    search: stepSearch,
    tag: stepTagFilter,
    type: stepTypeFilter,
  });

  const {
    createContext,
    deleteContexts,
    importContexts,
    lastSavedContextPayloadRef,
    renameContext,
    selectContext,
    setLoadedRecord,
    workflowContextOptions,
    workflowContextRecord,
    workflowContextRecordRef,
    workflowContextsQuery,
  } = useWorkflowContextRecords({
    enabled: Boolean(stepsQuery.data),
    notifyError,
    onContextLoaded: handleLoadedContext,
    onContextRouteChange: (contextId) => {
      selectContextId(contextId);
      updateWorkflowRouteParams({ context: contextId });
    },
    selectedContextId,
    workflowId: selectedWorkflow.id,
  });
  const {
    cancelPendingContextSave,
    persistWorkflowContext,
    updateWorkflowContext,
    workflowContext,
    workflowContextRef,
  } = useWorkflowContextState({
    lastSavedContextPayloadRef,
    notifyError,
    onContextCreated: (contextId) => {
      selectContextId(contextId);
      updateWorkflowRouteParams({ context: contextId });
    },
    selectedContextId,
    setLoadedRecord,
    siteCode: selectedWorkflow.id,
    workflowContextRecordRef,
    workflowId: selectedWorkflowId.trim() || selectedWorkflow.id,
  });
  const {
    addPlanStep,
    handlePlanDragEnd,
    removePlanStep,
    schedulePlanStepInputSave,
    selectedPlan,
  } = useWorkflowPlanController({
    form,
    messageWarning: message.warning,
    stepById,
    updateWorkflowContext,
    workflowContext,
    workflowContextRef,
  });
  const {
    handlePlanExecute,
    handleStop,
    runState,
    setRunState,
    testSinglePlanItem,
  } = useWorkflowExecution({
    executorBaseUrl: workflowExecutorBaseUrl,
    form,
    notifyError,
    selectedPlan,
    executorToken: workflowExecutorToken,
    stepById,
    stepsLoaded: Boolean(stepsQuery.data),
    syncBrowserEndpointFromContext,
    updateWorkflowContext,
    workflowContextRef,
  });
  const {
    collapseAllPlanItems,
    expandedPlanItems,
    expandAllPlanItems,
    togglePlanItem,
  } = usePlanExpansion({
    contextId: currentWorkflowContextId,
    planItems: selectedPlan,
    workflowId: expandedPlanStorageWorkflowId,
  });
  const activeContextIsLoaded = Boolean(currentWorkflowContextId) &&
    workflowContextRecord?.id === currentWorkflowContextId;
  const viewerBrowserEndpoint = activeContextIsLoaded
    ? getBrowserEndpointFromContext(workflowContext, stepById)
    : "";
  const browserEndpointKey = viewerBrowserEndpoint;

  useEffect(() => {
    if (
      executorSettings.workflows.some(
        (workflow) => workflow.id === selectedWorkflowId,
      )
    ) {
      return;
    }
    form.setFieldValue("workflowId", selectedWorkflow.id);
  }, [executorSettings.workflows, form, selectedWorkflow.id, selectedWorkflowId]);

  useEffect(() => {
    if (!currentWorkflowContextId) {
      const nextContext = createBaton({ workflowId: selectedWorkflow.id });
      updateWorkflowContext(nextContext, { persist: false });
      syncBrowserEndpointFromContext(nextContext);
      syncPlanFromContext(nextContext);
    }
  }, [currentWorkflowContextId, selectedWorkflow.id]);

  useEffect(() => {
    if (
      currentWorkflowContextId &&
      workflowContextRecord &&
      workflowContextRecord.workflow !== selectedWorkflow.id
    ) {
      cancelPendingContextSave();
      selectContextId("");
      updateWorkflowRouteParams({ context: "" });
    }
  }, [currentWorkflowContextId, selectedWorkflow.id, workflowContextRecord]);

  function syncBrowserEndpointFromContext(context: ContextBaton) {
    const endpoint = getBrowserEndpointFromContext(context, stepById);
    form.setFieldValue("browserEndpoint", endpoint);
  }

  function syncPlanFromContext(
    context: ContextBaton,
  ) {
    const nextItems = createPlanItemsFromContext(context);
    form.setFieldValue(
      "planStepInputs",
      createPlanStepInputsFromContext(context),
    );
    setRunState(createRunStateFromContext(context, runState));
  }

  function handleLoadedContext(context: ContextBaton) {
    updateWorkflowContext(context, { persist: false });
    syncBrowserEndpointFromContext(context);
    syncPlanFromContext(context);
  }

  const selectedPlanItems = selectedPlan.map((item, index) => ({
    ...item,
    index,
  }));
  const outputSourceOptions = useMemo(() => {
    return buildOutputSourceOptions(selectedPlan, stepById);
  }, [selectedPlan, stepById]);
  const runStatus = runState?.status ?? "idle";
  const runIsBusy = runStatus === "running" || runStatus === "stopping";
  const runStatusByPlanKey = createPlanRunStatusByKey({
    baton: workflowContext,
    currentStep: runState?.status === "running" ? runState.currentStep : undefined,
    planItems: selectedPlan,
  });
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function notifyError(
    title: string,
    description: React.ReactNode,
    key: string,
    copyText?: string,
  ) {
    showErrorNotification({ message, notification }, {
      key,
      message: title,
      description,
      copyText,
    });
  }

  function handleContextApply(context: ContextBaton) {
    updateWorkflowContext(context, { immediate: true });
    syncPlanFromContext(context);
  }

  async function handleContextCreate() {
    try {
      cancelPendingContextSave();
      const nextContext = createBaton({
        workflowId: selectedWorkflowId.trim() || selectedWorkflow.id,
      });
      await createContext(nextContext);
      message.success("Context 已创建。");
    } catch (error) {
      notifyError(
        "Context 创建失败",
        formatErrorMessage(error),
        "workflow-context-create-error",
      );
    }
  }

  function handleContextSelect(contextId: string) {
    cancelPendingContextSave();
    selectContext(contextId);
  }

  async function handleContextsDelete(contextIds: string[]) {
    try {
      cancelPendingContextSave();
      const deletedCount = await deleteContexts(contextIds);
      if (deletedCount === 0) {
        return;
      }
      message.success(
        deletedCount === 1 ? "Context 已删除。" : `已删除 ${deletedCount} 个 Context。`,
      );
    } catch (error) {
      notifyError(
        "Context 删除失败",
        formatErrorMessage(error),
        "workflow-context-delete-error",
      );
    }
  }

  async function handleContextRename(contextId: string, name: string) {
    try {
      cancelPendingContextSave();
      const saved = await renameContext(contextId, name);
      if (!saved) {
        return;
      }
      message.success("Context 名称已保存。");
    } catch (error) {
      notifyError(
        "Context 名称保存失败",
        formatErrorMessage(error),
        "workflow-context-rename-error",
      );
    }
  }

  async function handleContextImport(file: File) {
    try {
      cancelPendingContextSave();
      const text = await file.text();
      const payload = JSON.parse(text) as unknown;
      const imported = await importContexts(payload);
      message.success(`已导入 ${imported.length} 个 Context。`);
      void workflowContextsQuery.refetch();
    } catch (error) {
      notifyError(
        "Context 导入失败",
        formatErrorMessage(error),
        "workflow-context-import-error",
      );
    }
  }

  function handleContextExport(contextIds: string[]) {
    const ids = new Set(contextIds);
    const contexts = workflowContextOptions.filter((context) => ids.has(context.id));
    if (contexts.length === 0) {
      return;
    }
    const payload = contexts.length === 1 ? contexts[0] : { data: contexts };
    const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    link.href = url;
    link.download = contexts.length === 1
      ? `workflow-context-${contexts[0]?.id ?? timestamp}.json`
      : `workflow-contexts-${timestamp}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <WorkbenchPage
      className={styles.page}
      contentClassName={styles.pageContent}
    >
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        initialValues={defaultFormValues}
        className={styles.form}
      >
        <Space orientation="vertical" size={16} className={styles.stack}>
          <ResizableWorkspace
            className={styles.workspaceGrid}
            dividerLabels={[
              "调整步骤列表和步骤编排宽度",
              "调整步骤编排和右侧区域宽度",
            ]}
            layoutId="workflow.main"
            panels={[
              {
                className: styles.workspacePanel,
                content: (
                  <WorkflowStepsPanel
                    activeKey={leftTabKey}
                    contextLoading={workflowContextsQuery.isFetching}
                    contextOptions={workflowContextOptions}
                    currentContextId={selectedContextId}
                    filteredStepCount={filteredSteps.length}
                    filteredSteps={filteredSteps}
                    onAdd={addPlanStep}
                    onChange={handleLeftTabChange}
                    onContextChange={handleContextSelect}
                    onContextCreate={() => void handleContextCreate()}
                    onContextExport={handleContextExport}
                    onContextImport={(file) => void handleContextImport(file)}
                    onContextRename={(contextId, name) =>
                      void handleContextRename(contextId, name)}
                    onContextsDelete={(contextIds) =>
                      void handleContextsDelete(contextIds)}
                    onContextRefresh={() => void workflowContextsQuery.refetch()}
                    onStepFiltersClear={() => {
                      setStepSearch("");
                      setStepTypeFilter("");
                      setStepTagFilter("");
                    }}
                    onStepsRefresh={() => void stepsQuery.refetch()}
                    onSearchChange={setStepSearch}
                    onStepTagChange={setStepTagFilter}
                    onStepTypeChange={setStepTypeFilter}
                    search={stepSearch}
                    stepTag={stepTagFilter}
                    stepTags={stepTags}
                    stepType={stepTypeFilter}
                    stepTypes={stepTypes}
                    stepsLoading={stepsQuery.isLoading}
                    totalStepCount={availableSteps.length}
                    workflows={executorSettings.workflows}
                  />
                ),
                key: "steps",
                minSize: 260,
              },
              {
                className: styles.workspacePanel,
                content: (
                  <WorkflowPlanPanel
                    expandedPlanItems={expandedPlanItems}
                    onExecute={() => void handlePlanExecute()}
                    onExpandAll={expandAllPlanItems}
                    onCollapseAll={collapseAllPlanItems}
                    onInputChange={schedulePlanStepInputSave}
                    onPlanDragEnd={handlePlanDragEnd}
                    onRemove={removePlanStep}
                    onStop={() => void handleStop()}
                    onTest={(planItem) => void testSinglePlanItem(planItem)}
                    onToggle={togglePlanItem}
                    runIsBusy={runIsBusy}
                    runState={runState}
                    runStatus={runStatus}
                    selectedPlanItems={selectedPlanItems}
                    sensors={sensors}
                    stepById={stepById}
                    stepsLoaded={Boolean(stepsQuery.data)}
                    outputSourceOptions={outputSourceOptions}
                    workflowContext={workflowContext}
                  />
                ),
                key: "plan",
                minSize: 360,
              },
              {
                className: `${styles.workspacePanel} ${styles.pendingPanel}`,
                content: (
                  <WorkflowRightPanel
                    activeKey={rightTabKey}
                    browserEndpoint={viewerBrowserEndpoint}
                    browserEndpointKey={browserEndpointKey}
                    context={workflowContext}
                    onChange={handleRightTabChange}
                    onBrowserEndpointChange={() => undefined}
                    onContextApply={handleContextApply}
                  />
                ),
                key: "right",
                minSize: 360,
              },
            ]}
          />
        </Space>
      </Form>
    </WorkbenchPage>
  );
}
