import type {
  ContextBaton,
  WorkflowStepMetadata,
  WorkflowStepName,
} from "./types";

export const BROWSER_ENDPOINT_VALUE_FORMAT = "browser-endpoint";

export function getBrowserEndpointFromContext(
  baton: ContextBaton,
  stepById: Map<WorkflowStepName, WorkflowStepMetadata>,
) {
  for (let index = baton.entries.length - 1; index >= 0; index -= 1) {
    const entry = baton.entries[index];
    const metadata = stepById.get(entry.uses);
    const output = entry.execution.output;
    if (!metadata?.outputs || !output) {
      continue;
    }
    const endpointOutput = metadata.outputs.find((candidate) =>
      candidate.valueType === "string" &&
      candidate.valueFormat === BROWSER_ENDPOINT_VALUE_FORMAT
    );
    const endpoint = endpointOutput ? output[endpointOutput.name] : undefined;
    if (typeof endpoint === "string" && endpoint.trim()) {
      return endpoint.trim();
    }
  }
  return "";
}
