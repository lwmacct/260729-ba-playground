import type {
  StepInvocation,
  StepInvocationResponse,
} from "@lwmacct/260729-ba-context-baton";
import { createExecutorClient } from "@lwmacct/260729-ba-framework/client";
import type { BrowserEndpointCheckResponse } from "../model/types";
import { normalizeWorkflowExecutorBaseUrl } from "../model/executorSettings";

async function readResponseBody(response: Response) {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function resolveErrorMessage(body: unknown, fallback: string) {
  if (
    body &&
    typeof body === "object" &&
    "error" in body &&
    typeof body.error === "string"
  ) {
    return body.error;
  }
  return fallback;
}

function authHeaders(executorToken: string): Record<string, string> {
  const token = executorToken.trim();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function workflowExecutorUrl(baseUrl: string, path: string) {
  return `${normalizeWorkflowExecutorBaseUrl(baseUrl)}${path}`;
}

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

export async function checkBrowserEndpoint(
  executorToken: string,
  endpoint: string,
  executorBaseUrl: string,
): Promise<BrowserEndpointCheckResponse> {
  const response = await fetch(workflowExecutorUrl(executorBaseUrl, "/browser/check"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(executorToken),
    },
    body: JSON.stringify({ endpoint }),
  });
  const body = await readResponseBody(response);
  if (!response.ok) {
    throw new Error(resolveErrorMessage(body, `HTTP ${response.status}`));
  }
  return body as BrowserEndpointCheckResponse;
}

export { normalizeWorkflowExecutorBaseUrl };
