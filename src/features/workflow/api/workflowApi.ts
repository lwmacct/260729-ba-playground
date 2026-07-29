import type {
  StepInvocation,
  StepInvocationResponse,
} from "@lwmacct/260729-ba-context-baton";
import { createExecutorClient } from "@lwmacct/260729-ba-framework/client";
import { normalizeWorkflowExecutorBaseUrl } from "../model/executorSettings";

export async function fetchWorkflowHealth(
  executorToken: string,
  executorBaseUrl: string,
) {
  return await createExecutorClient({
    baseUrl: normalizeWorkflowExecutorBaseUrl(executorBaseUrl),
    token: executorToken,
  }).health();
}

export async function fetchWorkflowManifest(
  executorToken: string,
  executorBaseUrl: string,
) {
  return createExecutorClient({
    baseUrl: normalizeWorkflowExecutorBaseUrl(executorBaseUrl),
    token: executorToken,
  }).manifest();
}

export async function executeWorkflowStep(
  executorToken: string,
  invocation: StepInvocation,
  executorBaseUrl: string,
  signal?: AbortSignal,
): Promise<StepInvocationResponse> {
  return await createExecutorClient({
    baseUrl: normalizeWorkflowExecutorBaseUrl(executorBaseUrl),
    token: executorToken,
  }).execute(invocation, signal);
}

export { normalizeWorkflowExecutorBaseUrl };
