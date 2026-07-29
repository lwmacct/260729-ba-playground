import type { AdsPowerSettings } from "../model/config";
import type { AdsPowerProfileRecord } from "../model/types";
import {
  createAdsPowerProfile,
  deleteAdsPowerProfiles,
  startAdsPowerBrowser,
  stopAdsPowerBrowser,
} from "./client";

export type AdsPowerRebuildResult = {
  endpoint: string;
  name: string;
  profileId: string;
  profileNo?: string;
};

const defaultRebuildFingerprintConfig = {
  automatic_timezone: "1",
  browser_kernel_config: {
    type: "chrome",
    version: "ua_auto",
  },
  flash: "block",
  language: ["en-US", "en"],
  random_ua: {
    ua_browser: ["chrome"],
    ua_system_version: ["Windows 10"],
  },
  webrtc: "disabled",
};

function normalizeName(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEndpoint(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function rebuildAdsPowerProfilesByName(
  settings: AdsPowerSettings,
  profiles: AdsPowerProfileRecord[],
  rawNames: string[],
  options: { headless: boolean },
) {
  const names = Array.from(new Set(rawNames.map(normalizeName).filter(Boolean)));
  const results: AdsPowerRebuildResult[] = [];

  for (const name of names) {
    const existingProfileIds = profiles
      .filter((profile) => normalizeName(profile.name) === name)
      .map((profile) => profile.profile_id);

    for (const profileId of existingProfileIds) {
      await stopAdsPowerBrowser(settings, profileId).catch(() => undefined);
    }

    if (existingProfileIds.length > 0) {
      await deleteAdsPowerProfiles(settings, existingProfileIds);
    }

    const created = await createAdsPowerProfile(settings, {
      fingerprint_config: defaultRebuildFingerprintConfig,
      group_id: "0",
      name,
      remark: "Managed by WebUI rebuild action.",
      user_proxy_config: { proxy_soft: "no_proxy" },
    });
    const activeBrowser = await startAdsPowerBrowser(
      settings,
      created.profile_id,
      options,
    );

    results.push({
      endpoint: normalizeEndpoint(activeBrowser.ws?.puppeteer),
      name,
      profileId: created.profile_id,
      profileNo: created.profile_no,
    });
  }

  return results;
}
