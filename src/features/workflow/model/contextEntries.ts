import type { ContextBaton, ContextBatonEntry } from "./types";

export function findContextEntry(
  baton: ContextBaton,
  entryId: string,
): ContextBatonEntry | undefined {
  return baton.entries.find((entry) => entry.id === entryId);
}

export function findContextEntryArrayIndex(
  baton: ContextBaton,
  entryId: string,
) {
  return baton.entries.findIndex((entry) => entry.id === entryId);
}
