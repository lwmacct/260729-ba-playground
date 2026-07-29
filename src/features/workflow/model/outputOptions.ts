import { encodeInputSourceValue } from "./inputBindings";
import type {
  WorkflowPlanItem,
  WorkflowStepInputHint,
  WorkflowStepMetadata,
  WorkflowStepName,
} from "./types";

function outputPointer(outputName: string) {
  return `/${outputName.replace(/~/g, "~0").replace(/\//g, "~1")}`;
}

export function outputIsCompatibleWithInput(
  input: WorkflowStepInputHint,
  output: NonNullable<WorkflowStepMetadata["outputs"]>[number],
) {
  if (input.valueType === "unknown" || output.valueType === "unknown") {
    return input.valueType === "unknown";
  }
  if (input.valueType !== output.valueType) {
    return false;
  }
  return !input.valueFormat || input.valueFormat === output.valueFormat;
}

export function buildOutputSourceOptions(
  selectedPlan: WorkflowPlanItem[],
  stepById: Map<WorkflowStepName, WorkflowStepMetadata>,
) {
  const result: Record<
    string,
    Record<string, Array<{ label: string; value: string }>>
  > = {};
  selectedPlan.forEach((item, index) => {
    const inputs = stepById.get(item.name)?.inputHints ?? [];
    result[item.key] = Object.fromEntries(
      inputs.map((input) => [
        input.name,
        selectedPlan.slice(0, index).flatMap((sourceItem) =>
          (stepById.get(sourceItem.name)?.outputs ?? [])
            .filter((output) => outputIsCompatibleWithInput(input, output))
            .map((output) => ({
              label: `${sourceItem.name} (${sourceItem.key}).${output.name}`,
              value: encodeInputSourceValue({
                entry: sourceItem.key,
                pointer: outputPointer(output.name),
              }),
            }))
        ),
      ]),
    );
  });
  return result;
}
