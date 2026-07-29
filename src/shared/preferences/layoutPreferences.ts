import {
  readWebUiPreferences,
  saveWebUiPreferences,
  type LayoutPreference,
} from "./preferencesStore";

export type LayoutPreferenceDefinition = {
  defaultSizes: number[];
  id: string;
  label: string;
  panelKeys: string[];
};

export type LayoutPreferenceRecord = LayoutPreferenceDefinition & {
  saved: LayoutPreference | null;
};

export const layoutPreferenceDefinitions: LayoutPreferenceDefinition[] = [
  {
    defaultSizes: [3, 3, 6],
    id: "workflow.main",
    label: "Workflow 页面三栏",
    panelKeys: ["steps", "plan", "right"],
  },
  {
    defaultSizes: [6, 6],
    id: "adspower.main",
    label: "AdsPower 页面左右分栏",
    panelKeys: ["profiles", "viewer"],
  },
];

function panelKeysMatch(left: string[], right: string[]) {
  return left.length === right.length &&
    left.every((key, index) => key === right[index]);
}

function getLayoutDefinition(id: string) {
  return layoutPreferenceDefinitions.find((definition) => definition.id === id);
}

function isValidLayoutPreference(
  layout: LayoutPreference | undefined,
  panelKeys: string[],
) {
  return Boolean(layout && panelKeysMatch(layout.panelKeys, panelKeys));
}

export function readLayoutPreferenceSizes(id: string, panelKeys: string[]) {
  const layout = readWebUiPreferences().layouts[id];
  return isValidLayoutPreference(layout, panelKeys) ? layout?.sizes ?? null : null;
}

export function readLayoutPreferenceDefaultSizes(id: string, panelKeys: string[]) {
  const definition = getLayoutDefinition(id);
  return definition && panelKeysMatch(definition.panelKeys, panelKeys)
    ? definition.defaultSizes
    : null;
}

export function saveLayoutPreference(
  id: string,
  panelKeys: string[],
  sizes: number[],
) {
  const definition = getLayoutDefinition(id);
  if (!definition || !panelKeysMatch(definition.panelKeys, panelKeys)) {
    return;
  }

  const preferences = readWebUiPreferences();
  saveWebUiPreferences({
    ...preferences,
    layouts: {
      ...preferences.layouts,
      [id]: {
        panelKeys,
        sizes,
        updatedAt: new Date().toISOString(),
      },
    },
  });
}

export function listLayoutPreferenceRecords(): LayoutPreferenceRecord[] {
  const preferences = readWebUiPreferences();
  return layoutPreferenceDefinitions.map((definition) => {
    const saved = preferences.layouts[definition.id];
    return {
      ...definition,
      saved: isValidLayoutPreference(saved, definition.panelKeys) ? saved ?? null : null,
    };
  });
}

export function removeLayoutPreference(id: string) {
  const preferences = readWebUiPreferences();
  const { [id]: _removed, ...layouts } = preferences.layouts;
  saveWebUiPreferences({ ...preferences, layouts });
}

export function removeAllLayoutPreferences() {
  const preferences = readWebUiPreferences();
  saveWebUiPreferences({ ...preferences, layouts: {} });
}
