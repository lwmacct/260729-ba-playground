import {
  ApiOutlined,
  CloudServerOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import type { ReactNode } from "react";

export type AppRoute = "workflow" | "adspower" | "settings";
export type WorkflowRouteParams = {
  context?: string;
  tabLeft?: string;
  tabRight?: string;
};

export const appRoutes: Array<{
  key: AppRoute;
  label: string;
  icon: ReactNode;
}> = [
  { key: "workflow", label: "Workflow", icon: <CloudServerOutlined /> },
  { key: "adspower", label: "AdsPower", icon: <ApiOutlined /> },
  { key: "settings", label: "系统设置", icon: <SettingOutlined /> },
];

export function getRouteFromHash(): AppRoute {
  if (typeof window === "undefined") {
    return "workflow";
  }

  const route = window.location.hash.replace(/^#\/?/, "").split("?")[0];
  return appRoutes.some((item) => item.key === route)
    ? (route as AppRoute)
    : "workflow";
}

function parseHashLocation() {
  const hash = window.location.hash || "#/workflow";
  const normalizedHash = hash.replace(/^#\/?/, "");
  const [routePart = "", query = ""] = normalizedHash.split("?", 2);
  const route = appRoutes.some((item) => item.key === routePart)
    ? (routePart as AppRoute)
    : "workflow";
  return {
    params: new URLSearchParams(query),
    route,
  };
}

function buildHash(route: AppRoute, params = new URLSearchParams()) {
  const query = params.toString();
  return `#/${route}${query ? `?${query}` : ""}`;
}

function getRawRouteFromHash() {
  const hash = window.location.hash || "#/workflow";
  return hash.replace(/^#\/?/, "").split("?")[0];
}

export function normalizeHashRoute() {
  if (typeof window === "undefined") {
    return "workflow";
  }

  const rawRoute = getRawRouteFromHash();
  if (appRoutes.some((item) => item.key === rawRoute)) {
    return rawRoute as AppRoute;
  }

  window.history.replaceState(null, "", buildHash("workflow"));
  return "workflow";
}

function getStoredWorkflowRouteParams() {
  if (typeof window === "undefined") {
    return new URLSearchParams();
  }

  const current = parseHashLocation();
  if (current.route === "workflow") {
    return current.params;
  }

  const text = window.sessionStorage.getItem("workflow-route-params") ?? "";
  return new URLSearchParams(text);
}

function storeWorkflowRouteParams(params: URLSearchParams) {
  window.sessionStorage.setItem("workflow-route-params", params.toString());
}

export function navigateHashRoute(route: AppRoute) {
  const params = route === "workflow"
    ? getStoredWorkflowRouteParams()
    : new URLSearchParams();
  window.location.hash = buildHash(route, params);
}

export function getWorkflowRouteParams(): WorkflowRouteParams {
  if (typeof window === "undefined") {
    return {};
  }

  const current = parseHashLocation();
  const params = current.route === "workflow"
    ? current.params
    : getStoredWorkflowRouteParams();
  return {
    context: params.get("context")?.trim() || undefined,
    tabLeft: params.get("tab-left")?.trim() || undefined,
    tabRight: params.get("tab-right")?.trim() || undefined,
  };
}

export function updateWorkflowRouteParams(updates: WorkflowRouteParams) {
  if (typeof window === "undefined") {
    return;
  }

  const current = parseHashLocation();
  const params = current.route === "workflow"
    ? current.params
    : getStoredWorkflowRouteParams();

  if (updates.context !== undefined) {
    if (updates.context) {
      params.set("context", updates.context);
    } else {
      params.delete("context");
    }
  }
  if (updates.tabLeft !== undefined) {
    if (updates.tabLeft) {
      params.set("tab-left", updates.tabLeft);
    } else {
      params.delete("tab-left");
    }
  }
  if (updates.tabRight !== undefined) {
    if (updates.tabRight) {
      params.set("tab-right", updates.tabRight);
    } else {
      params.delete("tab-right");
    }
  }

  storeWorkflowRouteParams(params);
  if (current.route === "workflow") {
    const nextHash = buildHash("workflow", params);
    if (window.location.hash !== nextHash) {
      window.history.replaceState(null, "", nextHash);
    }
  }
}
