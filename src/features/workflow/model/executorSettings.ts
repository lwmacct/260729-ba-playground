export type WorkflowExecutorDefinition = {
  baseUrl: string;
  token?: string;
  id: string;
};

export type WorkflowExecutorSettings = {
  workflows: WorkflowExecutorDefinition[];
};

const WORKFLOW_EXECUTOR_SETTINGS_STORAGE_KEY =
  "workflow.executor-settings";

const defaultWorkflow: WorkflowExecutorDefinition = {
  baseUrl: "http://127.0.0.1:3000/api",
  id: "openai",
};

const defaultWorkflowExecutorSettings: WorkflowExecutorSettings = {
  workflows: [defaultWorkflow],
};

function readWorkflowExecutorSettings(): WorkflowExecutorSettings {
  if (typeof window === "undefined") {
    return defaultWorkflowExecutorSettings;
  }

  try {
    const raw = window.localStorage.getItem(
      WORKFLOW_EXECUTOR_SETTINGS_STORAGE_KEY,
    );
    if (!raw) {
      return defaultWorkflowExecutorSettings;
    }

    return normalizeWorkflowExecutorSettings(JSON.parse(raw));
  } catch {
    return defaultWorkflowExecutorSettings;
  }
}

function saveWorkflowExecutorSettings(settings: WorkflowExecutorSettings) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    WORKFLOW_EXECUTOR_SETTINGS_STORAGE_KEY,
    JSON.stringify(normalizeWorkflowExecutorSettings(settings)),
  );
}

function getWorkflowExecutorById(
  settings: WorkflowExecutorSettings,
  workflowId: string,
) {
  const normalized = normalizeWorkflowExecutorSettings(settings);
  return normalized.workflows.find(
    (workflow) => workflow.id === workflowId,
  ) ?? normalized.workflows[0];
}

function normalizeWorkflowExecutorSettings(value: unknown) {
  const raw = value && typeof value === "object"
    ? value as Partial<WorkflowExecutorSettings> & {
      activeWorkflowId?: unknown;
      baseUrl?: unknown;
      workflowId?: unknown;
    }
    : {};

  const rawWorkflows = Array.isArray(raw.workflows)
    ? raw.workflows
    : [{
      baseUrl: raw.baseUrl,
      id: raw.workflowId,
    }];

  const workflows = dedupeWorkflows(
    rawWorkflows.map((workflow) =>
      normalizeWorkflowDefinition(workflow),
    ),
  );
  const safeWorkflows = workflows.length > 0
    ? workflows
    : [defaultWorkflow];

  return {
    workflows: safeWorkflows,
  };
}

function normalizeWorkflowDefinition(value: unknown): WorkflowExecutorDefinition {
  const raw = value && typeof value === "object"
    ? value as Partial<WorkflowExecutorDefinition>
    : {};

  return {
    baseUrl: normalizeWorkflowExecutorBaseUrl(raw.baseUrl),
    ...(normalizeWorkflowExecutorToken(raw.token)
      ? { token: normalizeWorkflowExecutorToken(raw.token) }
      : {}),
    id: normalizeWorkflowId(raw.id),
  };
}

function dedupeWorkflows(workflows: WorkflowExecutorDefinition[]) {
  const seen = new Set<string>();
  return workflows.filter((workflow) => {
    if (seen.has(workflow.id)) {
      return false;
    }
    seen.add(workflow.id);
    return true;
  });
}

function normalizeWorkflowExecutorBaseUrl(value: unknown) {
  if (typeof value !== "string") {
    return defaultWorkflow.baseUrl;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return defaultWorkflow.baseUrl;
  }

  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

function normalizeWorkflowId(value: unknown) {
  if (typeof value !== "string") {
    return defaultWorkflow.id;
  }

  const trimmed = value.trim();
  return trimmed || defaultWorkflow.id;
}

function normalizeWorkflowExecutorToken(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

export {
  defaultWorkflow,
  defaultWorkflowExecutorSettings,
  getWorkflowExecutorById,
  normalizeWorkflowExecutorBaseUrl,
  normalizeWorkflowExecutorSettings,
  normalizeWorkflowExecutorToken,
  normalizeWorkflowId,
  readWorkflowExecutorSettings,
  saveWorkflowExecutorSettings,
};
