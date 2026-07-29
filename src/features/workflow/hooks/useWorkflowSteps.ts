import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { fetchWorkflowManifest } from "../api/workflowApi";
import type { WorkflowStepMetadata, WorkflowStepType } from "../model/types";

const EMPTY_WORKFLOW_STEPS: WorkflowStepMetadata[] = [];

export function useWorkflowSteps(options: {
  baseUrl: string;
  executorToken: string;
  search: string;
  tag: string;
  type: WorkflowStepType | "";
}) {
  const stepsQuery = useQuery({
    queryKey: ["workflow-steps", options.executorToken, options.baseUrl],
    queryFn: () => fetchWorkflowManifest(options.executorToken, options.baseUrl),
  });

  const availableSteps = stepsQuery.data?.steps ?? EMPTY_WORKFLOW_STEPS;
  const normalizedStepSearch = options.search.trim().toLowerCase();
  const filteredSteps = availableSteps.filter((step) => {
    if (options.type && step.type !== options.type) {
      return false;
    }
    if (options.tag && !(step.tags ?? []).includes(options.tag)) {
      return false;
    }
    if (!normalizedStepSearch) {
      return true;
    }
    return [step.name, step.title, step.type, step.description, ...(step.tags ?? [])].some((value) =>
      value?.toLowerCase().includes(normalizedStepSearch),
    );
  });
  const stepTypes = useMemo(
    () => Array.from(new Set(availableSteps.map((step) => step.type))).sort(),
    [availableSteps],
  );
  const stepTags = useMemo(
    () => Array.from(new Set(availableSteps.flatMap((step) => step.tags ?? []))).sort(),
    [availableSteps],
  );
  const stepById = useMemo(
    () => new Map(availableSteps.map((step) => [step.name, step])),
    [availableSteps],
  );

  return {
    availableSteps,
    filteredSteps,
    stepTags,
    stepTypes,
    stepById,
    stepsQuery,
  };
}
