export type AdsPowerSettings = {
  apiKey: string;
  apiUrl: string;
  browserGatewayUrl: string;
};

const ADSPOWER_SETTINGS_STORAGE_KEY = "workflow.adspower-settings";
const defaultAdsPowerSettings: AdsPowerSettings = {
  apiKey: "",
  apiUrl: "http://127.0.0.1:50325",
  browserGatewayUrl: "",
};

function readAdsPowerSettings(): AdsPowerSettings {
  if (typeof window === "undefined") {
    return defaultAdsPowerSettings;
  }

  try {
    const text = window.localStorage.getItem(ADSPOWER_SETTINGS_STORAGE_KEY);
    if (!text) {
      return defaultAdsPowerSettings;
    }
    const parsed = JSON.parse(text) as Partial<AdsPowerSettings>;
    return {
      apiKey: parsed.apiKey?.trim() ?? "",
      apiUrl: parsed.apiUrl?.trim() || defaultAdsPowerSettings.apiUrl,
      browserGatewayUrl: normalizeBrowserGatewayUrl(parsed.browserGatewayUrl),
    };
  } catch {
    return defaultAdsPowerSettings;
  }
}

function saveAdsPowerSettings(settings: AdsPowerSettings) {
  window.localStorage.setItem(
    ADSPOWER_SETTINGS_STORAGE_KEY,
    JSON.stringify({
      apiKey: settings.apiKey.trim(),
      apiUrl: trimAdsPowerApiUrl(settings.apiUrl),
      browserGatewayUrl: normalizeBrowserGatewayUrl(settings.browserGatewayUrl),
    }),
  );
}

function trimAdsPowerApiUrl(value: string) {
  const trimmed = value.trim();
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

function normalizeBrowserGatewayUrl(value: unknown) {
  if (typeof value !== "string") {
    return defaultAdsPowerSettings.browserGatewayUrl;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return defaultAdsPowerSettings.browserGatewayUrl;
  }

  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

export {
  defaultAdsPowerSettings,
  normalizeBrowserGatewayUrl,
  readAdsPowerSettings,
  saveAdsPowerSettings,
  trimAdsPowerApiUrl,
};
