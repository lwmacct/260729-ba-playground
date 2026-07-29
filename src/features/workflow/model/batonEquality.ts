import type { ContextBaton } from "./types";

export function contextsEqual(left: ContextBaton, right: ContextBaton) {
  return JSON.stringify(left) === JSON.stringify(right);
}
