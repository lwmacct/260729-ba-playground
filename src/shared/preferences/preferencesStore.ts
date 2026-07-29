const WEBUI_PREFERENCES_STORAGE_KEY = "workflow.webui-preferences";

export type LayoutPreference = {
  panelKeys: string[];
  sizes: number[];
  updatedAt: string;
};

export type WebUiPreferences = {
  layouts: Record<string, LayoutPreference>;
};

const emptyPreferences: WebUiPreferences = {
  layouts: {},
};

function normalizeLayoutPreference(value: unknown): LayoutPreference | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<LayoutPreference>;
  const panelKeys = Array.isArray(candidate.panelKeys)
    ? candidate.panelKeys.filter((key): key is string => typeof key === "string")
    : [];
  const sizes = Array.isArray(candidate.sizes)
    ? candidate.sizes.filter((size): size is number =>
      typeof size === "number" && Number.isFinite(size) && size > 0)
    : [];

  if (panelKeys.length === 0 || panelKeys.length !== sizes.length) {
    return null;
  }

  return {
    panelKeys,
    sizes,
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : "",
  };
}

function normalizePreferences(value: unknown): WebUiPreferences {
  if (!value || typeof value !== "object") {
    return emptyPreferences;
  }

  const candidate = value as Partial<WebUiPreferences>;
  const layouts: Record<string, LayoutPreference> = {};
  if (candidate.layouts && typeof candidate.layouts === "object") {
    Object.entries(candidate.layouts).forEach(([id, layout]) => {
      const normalizedLayout = normalizeLayoutPreference(layout);
      if (normalizedLayout) {
        layouts[id] = normalizedLayout;
      }
    });
  }

  return { layouts };
}

export function readWebUiPreferences(): WebUiPreferences {
  if (typeof window === "undefined") {
    return emptyPreferences;
  }

  try {
    const text = window.localStorage.getItem(WEBUI_PREFERENCES_STORAGE_KEY);
    return normalizePreferences(text ? JSON.parse(text) : null);
  } catch {
    return emptyPreferences;
  }
}

export function saveWebUiPreferences(preferences: WebUiPreferences) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    WEBUI_PREFERENCES_STORAGE_KEY,
    JSON.stringify(normalizePreferences(preferences)),
  );
}
