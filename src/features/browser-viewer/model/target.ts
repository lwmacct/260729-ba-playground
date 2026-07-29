import type { CdpViewerTarget } from "../api/cdpViewerClient";

export function formatTargetTabLabel(target: CdpViewerTarget) {
  return normalizeOptionalString(target.title) || normalizeOptionalString(target.url) || "New Tab";
}

export function formatTargetDetail(target?: CdpViewerTarget) {
  if (!target) {
    return "未选择页面";
  }
  return normalizeOptionalString(target.url) || target.targetId;
}

export function isAboutBlankTarget(target?: CdpViewerTarget) {
  return normalizeOptionalString(target?.url) === "about:blank";
}

export function normalizeOptionalString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeCreateTargetUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "about:blank";
  }
  if (/^(about:|blob:|chrome:|data:|devtools:|edge:|file:|https?:\/\/)/i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

export function resolveReplacementTargetId(
  previousTargets: CdpViewerTarget[],
  currentTargetId: string | null,
  nextTargets: CdpViewerTarget[],
) {
  if (currentTargetId && nextTargets.some((item) => item.targetId === currentTargetId)) {
    return currentTargetId;
  }
  if (nextTargets.length === 0) {
    return null;
  }

  const previousIndex = currentTargetId
    ? previousTargets.findIndex((item) => item.targetId === currentTargetId)
    : -1;
  if (previousIndex < 0) {
    return nextTargets[0]?.targetId ?? null;
  }

  return (
    nextTargets[Math.min(previousIndex, nextTargets.length - 1)]?.targetId ??
    nextTargets[previousIndex - 1]?.targetId ??
    nextTargets[0]?.targetId ??
    null
  );
}
