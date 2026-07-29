import { useQuery } from "@tanstack/react-query";
import type { AdsPowerSettings } from "../model/config";
import {
  fetchAdsPowerBrowserActive,
  fetchAdsPowerGroups,
  fetchAdsPowerProfiles,
} from "./client";
import type { AdsPowerProfileListFilters } from "../model/types";

export function useAdsPowerGroupsQuery(
  settings: AdsPowerSettings,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["adspower-groups", settings],
    queryFn: () => fetchAdsPowerGroups(settings),
    enabled,
    staleTime: 0,
  });
}

export function useAdsPowerProfilesQuery(
  settings: AdsPowerSettings,
  filters: AdsPowerProfileListFilters,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["adspower-profiles", settings, filters],
    queryFn: () => fetchAdsPowerProfiles(settings, filters),
    enabled,
    staleTime: 0,
  });
}

export function useAdsPowerBrowserActiveQuery(
  settings: AdsPowerSettings,
  profileId: string,
  lastOpenTime: string | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["adspower-browser-active", settings, profileId, lastOpenTime ?? ""],
    queryFn: () => fetchAdsPowerBrowserActive(settings, profileId),
    enabled: enabled && Boolean(profileId),
    staleTime: 0,
    refetchInterval: 15_000,
  });
}
