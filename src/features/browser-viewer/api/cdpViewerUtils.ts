import type {
  CdpViewerKeyboardEvent,
  CdpViewerMode,
  CdpViewerMouseEvent,
  CdpViewerTarget,
  CdpViewerViewportSize,
} from "./cdpViewerTypes";

export const CDP_INPUT_REQUEST_TIMEOUT_MS = 1000;
export const TARGET_ATTACH_RETRY_DELAY_MS = 150;
export const TARGET_ATTACH_RETRY_COUNT = 3;
export const TARGET_ATTACH_TIMEOUT_MS = 1000;
export const TARGET_ACTIVITY_TIMEOUT_MS = 1500;
export const TARGET_VIEWPORT_METRICS_TIMEOUT_MS = 2000;
export const VIEWPORT_APPLY_TIMEOUT_MS = 2000;
export const VIEWPORT_POLL_INTERVAL_MS = 100;
export const VIEWPORT_SIZE_TOLERANCE_PX = 2;

const JAVASCRIPT_DIALOG_DETAIL_MAX_LENGTH = 160;

export function endpointMode(endpoint: string): CdpViewerMode {
  const normalized = endpoint.toLowerCase();
  return normalized.includes("/devtools/page/") || normalized.includes("/devtools/tab/")
    ? "page"
    : "browser";
}

export function normalizeErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function isMissingSessionError(error: unknown) {
  return normalizeErrorMessage(error).toLowerCase().includes("session with given id not found");
}

export function isCdpRequestTimeoutError(error: unknown, method?: string) {
  const message = normalizeErrorMessage(error);
  if (!message.includes("CDP 请求超时")) {
    return false;
  }

  return !method || message.includes(method);
}

export function isBrowserHelpKeyPayload(
  payload?: CdpViewerKeyboardEvent | Record<string, unknown>,
) {
  return (
    payload?.key === "F1" ||
    payload?.code === "F1" ||
    payload?.windowsVirtualKeyCode === 112 ||
    payload?.nativeVirtualKeyCode === 112
  );
}

export function normalizeOptionalString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function delay(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function normalizeViewportSize(size: CdpViewerViewportSize): CdpViewerViewportSize {
  return {
    height: Math.max(1, Math.round(size.height)),
    width: Math.max(1, Math.round(size.width)),
  };
}

export function isViewportSizeMatch(
  current: CdpViewerViewportSize,
  desired: CdpViewerViewportSize,
) {
  return (
    Math.abs(current.width - desired.width) <= VIEWPORT_SIZE_TOLERANCE_PX &&
    Math.abs(current.height - desired.height) <= VIEWPORT_SIZE_TOLERANCE_PX
  );
}

export function formatJavaScriptDialogDetail(message: string, type: string) {
  const detail = message || type;
  if (detail.length <= JAVASCRIPT_DIALOG_DETAIL_MAX_LENGTH) {
    return detail;
  }

  return `${detail.slice(0, JAVASCRIPT_DIALOG_DETAIL_MAX_LENGTH)}...`;
}

export function buildPointerOverlayExpression(event: CdpViewerMouseEvent) {
  const payload = JSON.stringify({
    buttons: event.buttons ?? 0,
    button: event.button,
    type: event.type,
    x: event.x,
    y: event.y,
  });

  return `(() => {
  const payload = ${payload};
  const overlayId = "__cdp_mouse_sync_crosshair__";
  let root = document.getElementById(overlayId);

  if (!root) {
    root = document.createElement("div");
    root.id = overlayId;
    root.setAttribute("aria-hidden", "true");
    root.style.position = "fixed";
    root.style.inset = "0";
    root.style.pointerEvents = "none";
    root.style.zIndex = "2147483647";
    root.style.contain = "layout style paint";

    const center = document.createElement("div");
    center.dataset.role = "center";
    center.style.position = "absolute";
    center.style.width = "6px";
    center.style.height = "6px";
    center.style.marginLeft = "-3px";
    center.style.marginTop = "-3px";
    center.style.border = "1px solid rgba(255,255,255,0.92)";
    center.style.borderRadius = "999px";
    center.style.background = "rgba(220, 38, 38, 0.92)";
    center.style.boxShadow = "0 0 0 2px rgba(220, 38, 38, 0.18)";

    root.append(center);
    document.documentElement.appendChild(root);
  }

  const x = Math.max(0, Math.min(window.innerWidth, Number(payload.x) || 0));
  const y = Math.max(0, Math.min(window.innerHeight, Number(payload.y) || 0));
  const isPressed = payload.type === "mousePressed" || Number(payload.buttons) > 0;
  const center = root.querySelector('[data-role="center"]');
  const accent = isPressed ? "rgba(8, 145, 178, 0.96)" : "rgba(220, 38, 38, 0.92)";
  const softAccent = isPressed ? "rgba(8, 145, 178, 0.24)" : "rgba(220, 38, 38, 0.18)";

  root.dataset.pointerState = isPressed ? "pressed" : "idle";

  if (center) {
    center.style.left = x + "px";
    center.style.top = y + "px";
    center.style.background = accent;
    center.style.boxShadow = "0 0 0 2px " + softAccent;
  }
})()`;
}

export function normalizeTarget(value: unknown): CdpViewerTarget | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.targetId !== "string" || !record.targetId) {
    return null;
  }

  return {
    targetId: record.targetId,
    title: typeof record.title === "string" ? record.title : "",
    type: typeof record.type === "string" ? record.type : "unknown",
    url: typeof record.url === "string" ? record.url : "",
    attached: record.attached === true,
  };
}

export function isUserPageTarget(target: CdpViewerTarget) {
  if (target.type !== "page") {
    return false;
  }

  const title = normalizeOptionalString(target.title).toLowerCase();
  const url = normalizeOptionalString(target.url).toLowerCase();
  if (title.includes("omnibox") || url.includes("omnibox")) {
    return false;
  }

  return true;
}
