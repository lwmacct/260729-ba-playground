import type {
  BatonEntryPolicy,
  BatonReference,
  BatonReferenceSource,
  BatonStatus,
  ContextBaton,
  ContextBatonEntry,
  JsonObject,
  JsonValue,
} from "@lwmacct/260729-ba-context-baton";
import type { StepMetadata } from "@lwmacct/260729-ba-framework/manifest";

export type BrowserEngine = "chromium" | "firefox" | "webkit";
export type WorkflowStepName = string;
export type WorkflowStepFailurePolicy = BatonEntryPolicy["onFailure"];
export type WorkflowStepPolicy = BatonEntryPolicy;

export type WorkflowPlanItem = {
  key: string;
  name: WorkflowStepName;
  policy?: Partial<WorkflowStepPolicy>;
};

export type WorkflowInputSource = BatonReferenceSource;
export type WorkflowInputReference = BatonReference;
export type WorkflowInputLiteralValue = JsonValue;

export type WorkflowStepInputBinding =
  | {
      mode: "literal";
      value?: WorkflowInputLiteralValue;
    }
  | {
      mode: "step_output";
      source: WorkflowInputSource;
    };

export type WorkflowStepStatus = ContextBatonEntry["execution"]["status"];
export type WorkflowStepType = "setup" | "router" | "action" | "export";
export type WorkflowStepValueType = StepMetadata["outputs"][number]["valueType"];
export type WorkflowStepValueFormat = string;
export type WorkflowStepDefaultSource = NonNullable<
  Extract<StepMetadata["inputHints"][number]["defaultValue"], { $from: unknown }>
>["$from"];
export type WorkflowStepInputHint = StepMetadata["inputHints"][number];

export type WorkflowStepDetails = {
  name: WorkflowStepName;
  policy?: WorkflowStepPolicy;
  tags?: string[];
  type: WorkflowStepType;
  title: string;
  description?: string;
};

export type WorkflowStepMetadata = Omit<StepMetadata, "name"> &
  WorkflowStepDetails & {
  requiresBrowser: boolean;
};

export type WorkflowStepsResponse = {
  ok: true;
  steps: WorkflowStepMetadata[];
};

export type WorkflowRunStatus = "idle" | "stopping" | BatonStatus;

export type WorkflowCurrentStep = WorkflowPlanItem & {
  deadlineAt: string;
  index: number;
  startedAt: string;
  status: "running";
};

export type WorkflowRunState = {
  status: WorkflowRunStatus;
  currentStep?: WorkflowCurrentStep;
  startedAt?: string;
  finishedAt?: string;
};

export type BrowserEndpointCheckResponse = {
  ok: true;
  contextCount: number;
  endpoint: string;
  mode: "cdp" | "playwright";
  pageCount: number;
  reachable: true;
  version: string;
};

export type WorkflowFormValues = {
  workflowId: string;
  browserEndpoint: string;
  planStepInputs?: Partial<
    Record<string, Record<string, WorkflowStepInputBinding>>
  >;
};

export type {
  ContextBaton,
  ContextBatonEntry,
  JsonObject,
  JsonValue,
};
