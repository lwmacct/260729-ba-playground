import {
  normalizeBrowserGatewayUrl,
  trimAdsPowerApiUrl,
} from "../model/config";
import type { AdsPowerSettings } from "../model/config";
import type {
  AdsPowerApiResponse,
  AdsPowerBrowserActiveData,
  AdsPowerGroupListData,
  AdsPowerProfileInput,
  AdsPowerProfileListData,
  AdsPowerProfileListFilters,
} from "../model/types";

type RequestOptions = {
  body?: unknown;
  method?: "GET" | "POST";
  query?: Record<string, string | number | undefined>;
};

const adspowerBrowserLaunchArgs = ["--disable-popup-blocking"];

function adsPowerBaseUrl(settings: AdsPowerSettings) {
  const gatewayUrl = normalizeBrowserGatewayUrl(settings.browserGatewayUrl);
  if (!gatewayUrl) {
    throw new Error("Browser Gateway Base URL is required.");
  }

  return gatewayUrl;
}

async function adsPowerRequest<T>(
  settings: AdsPowerSettings,
  path: string,
  options: RequestOptions = {},
) {
  const url = new URL(`${adsPowerBaseUrl(settings)}${path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const headers: Record<string, string> = {
    "X-Browser-Gateway-Upstream": trimAdsPowerApiUrl(settings.apiUrl),
  };
  if (settings.apiKey.trim()) {
    headers.Authorization = `Bearer ${settings.apiKey.trim()}`;
  }
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? (options.body === undefined ? "GET" : "POST"),
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `${error.message}。请确认 AdsPower Local API 已启动，并允许当前页面访问。`
        : "AdsPower API 请求失败。",
    );
  }

  const body = await response.json().catch(() => null) as
    | AdsPowerApiResponse<T>
    | null;
  if (!response.ok) {
    throw new Error(body?.msg || `HTTP ${response.status}`);
  }
  if (!body || body.code !== 0) {
    throw new Error(body?.msg || "AdsPower API 请求失败。");
  }

  return body.data;
}

function fetchAdsPowerStatus(settings: AdsPowerSettings) {
  return adsPowerRequest<unknown>(settings, "/status");
}

function fetchAdsPowerGroups(settings: AdsPowerSettings) {
  return adsPowerRequest<AdsPowerGroupListData>(settings, "/api/v1/group/list", {
    query: { page: 1, page_size: 2000 },
  });
}

function fetchAdsPowerProfiles(
  settings: AdsPowerSettings,
  filters: AdsPowerProfileListFilters,
) {
  const body: Record<string, unknown> = {
    limit: String(filters.limit ?? 20),
    page: String(filters.page ?? 1),
    sort_order: filters.sort_order ?? "desc",
    sort_type: filters.sort_type ?? "profile_no",
  };
  if (filters.group_id) {
    body.group_id = filters.group_id;
  }
  if (filters.profile_no) {
    body.profile_no = [filters.profile_no];
  }

  return adsPowerRequest<AdsPowerProfileListData>(
    settings,
    "/api/v2/browser-profile/list",
    { body },
  );
}

function fetchAdsPowerBrowserActive(
  settings: AdsPowerSettings,
  profileId: string,
) {
  return adsPowerRequest<AdsPowerBrowserActiveData>(
    settings,
    "/api/v2/browser-profile/active",
    { query: { profile_id: profileId } },
  );
}

function createAdsPowerProfile(
  settings: AdsPowerSettings,
  input: AdsPowerProfileInput,
) {
  return adsPowerRequest<{ profile_id: string; profile_no: string }>(
    settings,
    "/api/v2/browser-profile/create",
    { body: input },
  );
}

function updateAdsPowerProfile(
  settings: AdsPowerSettings,
  input: AdsPowerProfileInput & { profile_id: string },
) {
  return adsPowerRequest<Record<string, never>>(
    settings,
    "/api/v2/browser-profile/update",
    { body: input },
  );
}

function startAdsPowerBrowser(
  settings: AdsPowerSettings,
  profileId: string,
  options: { headless: boolean },
) {
  return adsPowerRequest<AdsPowerBrowserActiveData>(
    settings,
    "/api/v2/browser-profile/start",
    {
      body: {
        headless: options.headless ? "1" : "0",
        launch_args: adspowerBrowserLaunchArgs,
        last_opened_tabs: "1",
        profile_id: profileId,
        proxy_detection: "1",
      },
    },
  );
}

function stopAdsPowerBrowser(settings: AdsPowerSettings, profileId: string) {
  return adsPowerRequest<Record<string, never>>(
    settings,
    "/api/v2/browser-profile/stop",
    { body: { profile_id: profileId } },
  );
}

function deleteAdsPowerProfiles(settings: AdsPowerSettings, profileIds: string[]) {
  return adsPowerRequest<Record<string, never>>(
    settings,
    "/api/v2/browser-profile/delete",
    { body: { profile_id: profileIds } },
  );
}

export {
  createAdsPowerProfile,
  deleteAdsPowerProfiles,
  fetchAdsPowerBrowserActive,
  fetchAdsPowerGroups,
  fetchAdsPowerProfiles,
  fetchAdsPowerStatus,
  startAdsPowerBrowser,
  stopAdsPowerBrowser,
  updateAdsPowerProfile,
};
