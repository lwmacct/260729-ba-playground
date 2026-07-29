export type CdpViewerSettings = {
  autoApplyCanvasSize: boolean;
  displayScale: number;
  endpoint: string;
  followActiveTarget: boolean;
  maxWidth: number;
  maxHeight: number;
  quality: number;
  everyNthFrame: number;
};

const CDP_VIEWER_SETTINGS_STORAGE_KEY = "workflow.cdp-viewer-settings";

const displayScaleConfig = {
  defaultValue: 0.65,
  marks: [
    { label: "0.5x", value: 0.5 },
    { label: "0.75x", value: 0.75 },
    { label: "1x", value: 1 },
  ],
  max: 1,
  min: 0.5,
  precision: 2,
  step: 0.05,
};

const defaultCdpViewerSettings: CdpViewerSettings = {
  autoApplyCanvasSize: true,
  displayScale: displayScaleConfig.defaultValue,
  endpoint: "",
  followActiveTarget: true,
  maxWidth: 1440,
  maxHeight: 900,
  quality: 70,
  everyNthFrame: 1,
};

export function readCdpViewerSettings(): CdpViewerSettings {
  if (typeof window === "undefined") {
    return defaultCdpViewerSettings;
  }

  try {
    const raw = window.localStorage.getItem(CDP_VIEWER_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return defaultCdpViewerSettings;
    }

    const parsed = JSON.parse(raw) as Partial<CdpViewerSettings>;
    return normalizeCdpViewerSettings(parsed);
  } catch {
    return defaultCdpViewerSettings;
  }
}

export function saveCdpViewerSettings(settings: CdpViewerSettings) {
  if (typeof window === "undefined") {
    return;
  }

  const endpoint = typeof settings.endpoint === "string" ? settings.endpoint.trim() : "";
  const normalized = normalizeCdpViewerSettings({
    ...settings,
    endpoint,
  });
  window.localStorage.setItem(
    CDP_VIEWER_SETTINGS_STORAGE_KEY,
    JSON.stringify(normalized),
  );
}

function normalizeCdpViewerSettings(
  settings: Partial<CdpViewerSettings>,
): CdpViewerSettings {
  return {
    autoApplyCanvasSize:
      typeof settings.autoApplyCanvasSize === "boolean"
        ? settings.autoApplyCanvasSize
        : defaultCdpViewerSettings.autoApplyCanvasSize,
    displayScale: normalizeDisplayScale(settings.displayScale),
    endpoint: typeof settings.endpoint === "string" ? settings.endpoint.trim() : "",
    followActiveTarget:
      typeof settings.followActiveTarget === "boolean"
        ? settings.followActiveTarget
        : defaultCdpViewerSettings.followActiveTarget,
    maxWidth: normalizePositiveNumber(settings.maxWidth, defaultCdpViewerSettings.maxWidth),
    maxHeight: normalizePositiveNumber(settings.maxHeight, defaultCdpViewerSettings.maxHeight),
    quality: normalizeBoundedNumber(settings.quality, 1, 100, defaultCdpViewerSettings.quality),
    everyNthFrame: normalizeBoundedNumber(
      settings.everyNthFrame,
      1,
      10,
      defaultCdpViewerSettings.everyNthFrame,
    ),
  };
}

function normalizeDisplayScale(value: unknown) {
  return normalizeBoundedDecimal(
    value,
    displayScaleConfig.min,
    displayScaleConfig.max,
    displayScaleConfig.defaultValue,
  );
}

function normalizePositiveNumber(value: unknown, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.round(value);
}

function normalizeBoundedNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
}

function normalizeBoundedDecimal(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  const rounded = Math.round(value * 100) / 100;
  return Math.min(max, Math.max(min, rounded));
}

export {
  defaultCdpViewerSettings,
  displayScaleConfig,
  normalizeDisplayScale,
};
