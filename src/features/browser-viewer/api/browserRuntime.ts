import type {
  CdpResponsePayload,
  CdpTransport,
} from "./cdpTransport";
import { PageRuntime } from "./pageRuntime";
import type {
  CdpViewerMode,
  CdpViewerTarget,
  CdpViewerTargetsChange,
  PageMetadata,
  TargetActivity,
} from "./cdpViewerTypes";
import {
  delay,
  TARGET_ATTACH_TIMEOUT_MS,
  isUserPageTarget,
  normalizeTarget,
  normalizeOptionalString,
} from "./cdpViewerUtils";

const TARGET_METADATA_PROBE_DELAY_MS = 300;
const TARGET_METADATA_PROBE_INTERVAL_MS = 700;
const TARGET_METADATA_PROBE_ROUNDS = 8;

type BrowserRuntimeEvents = {
  onDialogDetail?: (detail: string) => void;
  onPageRuntimeStale?: (runtime: PageRuntime, detail?: string) => void;
  onTargetRemoved?: (targetId: string) => void;
  onTargetsChange?: (
    targets: CdpViewerTarget[],
    change?: CdpViewerTargetsChange,
  ) => void;
};

type BrowserRuntimeOptions = {
  events?: BrowserRuntimeEvents;
  mode: CdpViewerMode;
  transport: CdpTransport;
};

export class BrowserRuntime {
  private readonly pageRuntime: PageRuntime;

  private readonly runtimes = new Map<string, PageRuntime>();

  private readonly metadataProbeVersions = new Map<string, number>();

  private targets = new Map<string, CdpViewerTarget>();

  constructor(private readonly options: BrowserRuntimeOptions) {
    this.pageRuntime = new PageRuntime({
      mode: "page",
      targetId: null,
      transport: this.options.transport,
      events: {
        onDialogHandled: (detail) => this.options.events?.onDialogDetail?.(detail),
        onDialogHandleFailed: (detail) => this.options.events?.onDialogDetail?.(detail),
        onStale: (detail) => this.options.events?.onPageRuntimeStale?.(this.pageRuntime, detail),
      },
    });
  }

  get mode() {
    return this.options.mode;
  }

  getTargetList() {
    return [...this.targets.values()];
  }

  async connect() {
    if (this.options.mode !== "browser") {
      return;
    }

    await this.options.transport.send("Target.setDiscoverTargets", { discover: true });
    await this.refreshTargets();
  }

  async refreshTargets() {
    if (this.options.mode !== "browser") {
      this.publishTargets([], { reason: "refresh" });
      return [];
    }

    const nextTargets = await this.fetchTargets();
    this.targets = new Map(nextTargets.map((item) => [item.targetId, item]));
    this.publishTargets(nextTargets, { reason: "refresh" });
    for (const target of nextTargets) {
      this.scheduleMetadataProbe(target.targetId);
    }
    return nextTargets;
  }

  getPageRuntime(targetId: string | null) {
    if (this.options.mode === "page") {
      return this.pageRuntime;
    }

    if (!targetId) {
      throw new Error("请选择一个页面 target。");
    }

    let runtime = this.runtimes.get(targetId);
    if (!runtime) {
      runtime = new PageRuntime({
        mode: "browser",
        targetId,
        transport: this.options.transport,
        events: {
          hasPageTarget: (id, options) => this.hasPageTarget(id, options),
          onDialogHandled: (detail) => this.options.events?.onDialogDetail?.(detail),
          onDialogHandleFailed: (detail) => this.options.events?.onDialogDetail?.(detail),
          onStale: (detail) => this.options.events?.onPageRuntimeStale?.(runtime!, detail),
        },
      });
      this.runtimes.set(targetId, runtime);
    }

    return runtime;
  }

  async activateTarget(targetId: string) {
    if (this.options.mode !== "browser") {
      return;
    }

    await this.options.transport.send("Target.activateTarget", { targetId });
  }

  async createTarget(url = "about:blank") {
    if (this.options.mode !== "browser") {
      throw new Error("只有 browser 级 endpoint 支持新建标签页。");
    }

    const result = await this.options.transport.send("Target.createTarget", { url });
    return typeof result.targetId === "string" ? result.targetId : null;
  }

  async closeTarget(targetId: string) {
    if (this.options.mode !== "browser") {
      throw new Error("只有 browser 级 endpoint 支持关闭标签页。");
    }

    await this.options.transport.send("Target.closeTarget", { targetId });
  }

  async reloadTarget(targetId: string | null) {
    await this.getPageRuntime(targetId).sendReload();
  }

  async readClipboardText(targetId: string | null) {
    return this.getPageRuntime(targetId).readClipboardText();
  }

  async writeClipboardText(targetId: string | null, text: string) {
    await this.getPageRuntime(targetId).writeClipboardText(text);
  }

  async findActiveTargetId() {
    if (this.options.mode !== "browser") {
      return null;
    }

    let targets = this.getTargetList();
    if (targets.length === 0) {
      targets = await this.refreshTargets();
    }

    const visibleTargets: Array<{ activity: TargetActivity; target: CdpViewerTarget }> = [];
    for (const target of targets) {
      const activity = await this.getPageRuntime(target.targetId).inspectActivity();
      if (!activity) {
        continue;
      }
      if (activity.visibilityState === "visible") {
        visibleTargets.push({ target, activity });
      }
    }

    const focusedTarget = visibleTargets.find((item) => item.activity.hasFocus);
    return focusedTarget?.target.targetId ?? visibleTargets[0]?.target.targetId ?? null;
  }

  handleEvent(payload: CdpResponsePayload) {
    if (!payload.method) {
      return false;
    }

    if (payload.method === "Page.javascriptDialogOpening") {
      return this.handleJavaScriptDialogOpening(payload);
    }

    if (payload.method === "Target.targetCreated") {
      return this.handleTargetCreated(payload);
    }

    if (payload.method === "Target.targetInfoChanged") {
      return this.handleTargetInfoChanged(payload);
    }

    if (payload.method === "Target.targetDestroyed") {
      return this.handleTargetDestroyed(payload);
    }

    if (payload.method === "Target.detachedFromTarget") {
      return this.handleDetachedFromTarget(payload);
    }

    return false;
  }

  async dispose() {
    await Promise.all(
      [...this.runtimes.values()].map((runtime) => runtime.detach()),
    );
    this.runtimes.clear();
    this.targets.clear();
    this.publishTargets([]);
  }

  forgetSession(sessionId: string | undefined, detail?: string) {
    if (!sessionId) {
      return null;
    }

    for (const runtime of this.runtimes.values()) {
      if (runtime.ownsSession(sessionId)) {
        runtime.markDetached(detail);
        return runtime;
      }
    }

    return null;
  }

  private async fetchTargets() {
    const result = await this.options.transport.send("Target.getTargets");
    const rawTargets = Array.isArray(result.targetInfos) ? result.targetInfos : [];
    return rawTargets
      .map((item) => normalizeTarget(item))
      .filter((item): item is CdpViewerTarget => Boolean(item))
      .filter(isUserPageTarget);
  }

  private async hasPageTarget(
    targetId: string,
    options: { allowCache: boolean },
  ) {
    const cachedTarget = options.allowCache ? this.targets.get(targetId) : undefined;
    if (cachedTarget && isUserPageTarget(cachedTarget)) {
      return true;
    }

    const result = await this.options.transport.send(
      "Target.getTargets",
      undefined,
      undefined,
      TARGET_ATTACH_TIMEOUT_MS,
    ).catch(() => null);
    const targetInfos = Array.isArray(result?.targetInfos) ? result.targetInfos : [];
    return targetInfos
      .map((item) => normalizeTarget(item))
      .some((target) => target?.targetId === targetId && isUserPageTarget(target));
  }

  private handleJavaScriptDialogOpening(payload: CdpResponsePayload) {
    const runtime =
      typeof payload.sessionId === "string"
        ? this.findRuntimeBySession(payload.sessionId)
        : this.options.mode === "page"
          ? this.pageRuntime
          : null;
    return runtime?.handleDialog(payload) ?? false;
  }

  private handleTargetCreated(payload: CdpResponsePayload) {
    const target = normalizeTarget(payload.params?.targetInfo);
    if (!target || !isUserPageTarget(target)) {
      void this.refreshTargets().catch(() => undefined);
      return true;
    }

    this.targets.set(target.targetId, target);
    this.publishTargets([...this.targets.values()], {
      reason: "created",
      targetId: target.targetId,
    });
    this.scheduleMetadataProbe(target.targetId, TARGET_METADATA_PROBE_DELAY_MS);
    void this.refreshTargets().catch(() => undefined);
    return true;
  }

  private handleTargetInfoChanged(payload: CdpResponsePayload) {
    const target = normalizeTarget(payload.params?.targetInfo);
    if (!target || !isUserPageTarget(target)) {
      void this.refreshTargets().catch(() => undefined);
      return true;
    }

    this.targets.set(target.targetId, target);
    this.publishTargets([...this.targets.values()], {
      reason: "changed",
      targetId: target.targetId,
    });
    this.scheduleMetadataProbe(target.targetId, TARGET_METADATA_PROBE_DELAY_MS);
    return true;
  }

  private handleTargetDestroyed(payload: CdpResponsePayload) {
    const targetId = payload.params?.targetId;
    if (typeof targetId !== "string") {
      return true;
    }

    this.removeTarget(targetId);
    return true;
  }

  private handleDetachedFromTarget(payload: CdpResponsePayload) {
    const sessionId = payload.params?.sessionId;
    if (typeof sessionId !== "string") {
      return true;
    }

    this.forgetSession(sessionId, "页面会话已断开。");
    return true;
  }

  private findRuntimeBySession(sessionId: string) {
    for (const runtime of this.runtimes.values()) {
      if (runtime.ownsSession(sessionId)) {
        return runtime;
      }
    }

    return null;
  }

  private removeTarget(targetId: string) {
    this.runtimes.get(targetId)?.markDetached("页面 target 已关闭。");
    this.runtimes.delete(targetId);
    this.metadataProbeVersions.delete(targetId);
    if (!this.targets.delete(targetId)) {
      return;
    }

    this.options.events?.onTargetRemoved?.(targetId);
    this.publishTargets([...this.targets.values()], {
      reason: "destroyed",
      targetId,
    });
  }

  private publishTargets(
    targets: CdpViewerTarget[],
    change?: CdpViewerTargetsChange,
  ) {
    this.options.events?.onTargetsChange?.(targets, change);
  }

  private scheduleMetadataProbe(targetId: string, initialDelayMs = 0) {
    if (this.options.mode !== "browser" || !this.targets.has(targetId)) {
      return;
    }

    const version = (this.metadataProbeVersions.get(targetId) ?? 0) + 1;
    this.metadataProbeVersions.set(targetId, version);
    void this.runMetadataProbe(targetId, version, initialDelayMs);
  }

  private async runMetadataProbe(
    targetId: string,
    version: number,
    initialDelayMs: number,
  ) {
    if (initialDelayMs > 0) {
      await delay(initialDelayMs);
    }

    for (let round = 0; round < TARGET_METADATA_PROBE_ROUNDS; round += 1) {
      if (!this.isCurrentMetadataProbe(targetId, version)) {
        return;
      }

      const target = this.targets.get(targetId);
      if (!target) {
        return;
      }

      const metadata = await this.getPageRuntime(targetId)
        .readPageMetadata()
        .catch(() => null);
      if (!this.isCurrentMetadataProbe(targetId, version)) {
        return;
      }
      if (metadata && this.applyMetadata(targetId, metadata)) {
        this.publishTargets([...this.targets.values()], {
          reason: "changed",
          targetId,
        });
      }

      if (round < TARGET_METADATA_PROBE_ROUNDS - 1) {
        await delay(TARGET_METADATA_PROBE_INTERVAL_MS);
      }
    }

    if (this.metadataProbeVersions.get(targetId) === version) {
      this.metadataProbeVersions.delete(targetId);
    }
  }

  private isCurrentMetadataProbe(targetId: string, version: number) {
    return (
      this.options.mode === "browser" &&
      this.targets.has(targetId) &&
      this.metadataProbeVersions.get(targetId) === version
    );
  }

  private applyMetadata(targetId: string, metadata: PageMetadata) {
    const current = this.targets.get(targetId);
    if (!current) {
      return false;
    }

    const title = normalizeOptionalString(metadata.title) || current.title;
    const url = normalizeOptionalString(metadata.url) || current.url;
    if (title === current.title && url === current.url) {
      return false;
    }

    this.targets.set(targetId, {
      ...current,
      title,
      url,
    });
    return true;
  }
}
