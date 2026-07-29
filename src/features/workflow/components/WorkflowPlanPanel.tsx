import { DndContext } from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  PlayCircleOutlined,
  CompressOutlined,
  ExpandOutlined,
  StopOutlined,
} from "@ant-design/icons";
import {
  Button,
  Space,
} from "antd";
import { WorkbenchPanel } from "@lwmacct/260627-antd-workbench";
import type { ComponentProps } from "react";
import type {
  WorkflowStepName,
  ContextBaton,
  WorkflowPlanItem,
  WorkflowRunState,
  WorkflowStepMetadata,
} from "../model/types";
import {
  createPlanRunStatusByKey,
} from "../model/contextStatus";
import { findContextEntry } from "../model/contextEntries";
import {
  PlanDropZone,
  SortablePlanStep,
} from "./WorkflowStepCards";
import styles from "./WorkflowPlanPanel.module.css";

type SelectedPlanItem = WorkflowPlanItem & {
  index: number;
};

export type WorkflowOutputSourceOption = {
  label: string;
  value: string;
};

type WorkflowPlanPanelProps = {
  expandedPlanItems: Record<string, boolean>;
  onExecute(): void;
  onCollapseAll(): void;
  onExpandAll(): void;
  onInputChange(step: WorkflowStepName, itemKey?: string): void;
  onPlanDragEnd(event: DragEndEvent): void;
  onRemove(index: number): void;
  onStop(): void;
  onTest(item: WorkflowPlanItem): void;
  onToggle(itemKey: string): void;
  runIsBusy: boolean;
  runState: WorkflowRunState | null;
  runStatus: string;
  selectedPlanItems: SelectedPlanItem[];
  sensors: ComponentProps<typeof DndContext>["sensors"];
  stepById: Map<WorkflowStepName, WorkflowStepMetadata>;
  stepsLoaded: boolean;
  workflowContext: ContextBaton;
  outputSourceOptions: Record<string, Record<string, Array<{ label: string; value: string }>>>;
};

export function WorkflowPlanPanel({
  expandedPlanItems,
  onExecute,
  onCollapseAll,
  onExpandAll,
  onInputChange,
  onPlanDragEnd,
  onRemove,
  onStop,
  onTest,
  onToggle,
  runIsBusy,
  runState,
  runStatus,
  selectedPlanItems,
  sensors,
  stepById,
  stepsLoaded,
  workflowContext,
  outputSourceOptions,
}: WorkflowPlanPanelProps) {
  const statusByKey = createPlanRunStatusByKey({
    baton: workflowContext,
    currentStep: runState?.status === "running" ? runState.currentStep : undefined,
    planItems: selectedPlanItems,
  });

  return (
    <Space
      orientation="vertical"
      size={16}
      className={styles.stack}
    >
      <WorkbenchPanel
        title="步骤编排"
        className={styles.card}
        extra={
          <Button
            danger={runIsBusy}
            type={runIsBusy ? "default" : "primary"}
            icon={runIsBusy ? <StopOutlined /> : <PlayCircleOutlined />}
            disabled={!stepsLoaded}
            loading={runStatus === "stopping"}
            onClick={() => (runIsBusy ? onStop() : onExecute())}
          >
            {runStatus === "stopping" ? "停止中" : runIsBusy ? "停止" : "执行"}
          </Button>
        }
      >
        <div className={styles.tabPane}>
          <PlanListToolbar
            disabled={!stepsLoaded}
            onCollapseAll={onCollapseAll}
            onExpandAll={onExpandAll}
          />
          <DndContext sensors={sensors} onDragEnd={onPlanDragEnd}>
            <SortableContext
              items={selectedPlanItems.map((item) => item.key)}
              strategy={verticalListSortingStrategy}
            >
              <PlanDropZone isEmpty={selectedPlanItems.length === 0}>
                {selectedPlanItems.map((item) => (
                  <SortablePlanStep
                    key={item.key}
                    expanded={Boolean(expandedPlanItems[item.key])}
                    item={item}
                    metadata={stepById.get(item.name)}
                    onInputChange={() => onInputChange(item.name, item.key)}
                    onRemove={() => onRemove(item.index)}
                    onTest={onTest}
                    onToggle={() => onToggle(item.key)}
                    order={item.index}
                    outputSourceOptions={outputSourceOptions[item.key] ?? {}}
                    contextOutput={
                      findContextEntry(
                        workflowContext,
                        item.key,
                      )?.execution.output
                    }
                    runStatus={statusByKey[item.key]}
                    sortId={item.key}
                  />
                ))}
              </PlanDropZone>
            </SortableContext>
          </DndContext>
        </div>
      </WorkbenchPanel>
    </Space>
  );
}

function PlanListToolbar({
  disabled,
  onCollapseAll,
  onExpandAll,
}: {
  disabled: boolean;
  onCollapseAll(): void;
  onExpandAll(): void;
}) {
  return (
    <div className={styles.toolbar}>
      <Space size={8}>
        <Button
          icon={<ExpandOutlined />}
          disabled={disabled}
          onClick={onExpandAll}
        >
          全部展开
        </Button>
        <Button
          icon={<CompressOutlined />}
          disabled={disabled}
          onClick={onCollapseAll}
        >
          全部折叠
        </Button>
      </Space>
    </div>
  );
}
