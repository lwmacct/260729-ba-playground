import type {
  CdpResponsePayload,
  CdpTransport,
} from "./cdpTransport";
import {
  ScreencastController,
  type ScreencastOptions,
  type ScreencastStream,
} from "./screencastController";
import type {
  CdpViewerEditCommand,
  CdpViewerKeyboardInput,
  CdpViewerMouseEvent,
  CdpViewerMode,
  PageMetadata,
  TargetActivity,
  WindowMetrics,
} from "./cdpViewerTypes";
import {
  CDP_INPUT_REQUEST_TIMEOUT_MS,
  TARGET_ACTIVITY_TIMEOUT_MS,
  TARGET_ATTACH_RETRY_COUNT,
  TARGET_ATTACH_RETRY_DELAY_MS,
  TARGET_ATTACH_TIMEOUT_MS,
  TARGET_VIEWPORT_METRICS_TIMEOUT_MS,
  buildPointerOverlayExpression,
  delay,
  formatJavaScriptDialogDetail,
  isBrowserHelpKeyPayload,
  isMissingSessionError,
  normalizeErrorMessage,
} from "./cdpViewerUtils";

type AttachResult =
  | {
    ok: true;
    sessionId?: string;
  }
  | {
    ok: false;
    reason: "missing-session" | "target-gone";
  };

type PageRuntimeEvents = {
  hasPageTarget?: (targetId: string, options: { allowCache: boolean }) => Promise<boolean>;
  onDialogHandled?: (detail: string) => void;
  onDialogHandleFailed?: (detail: string) => void;
  onStale?: (detail?: string) => void;
};

export type PageRuntimeOptions = {
  events?: PageRuntimeEvents;
  mode: CdpViewerMode;
  targetId: string | null;
  transport: CdpTransport;
};

export class PageRuntime {
  private pageEnabled = false;

  private sessionId: string | undefined;

  private stale = false;

  constructor(private readonly options: PageRuntimeOptions) {}

  get id() {
    return this.options.targetId;
  }

  get currentSessionId() {
    return this.sessionId;
  }

  get isStale() {
    return this.stale;
  }

  ownsSession(sessionId: string | undefined) {
    return Boolean(sessionId && sessionId === this.sessionId);
  }

  async attach() {
    if (this.options.mode === "page") {
      this.stale = false;
      return { ok: true } satisfies AttachResult;
    }

    if (!this.options.targetId) {
      throw new Error("请选择一个页面 target。");
    }

    if (this.sessionId && !this.stale) {
      return {
        ok: true,
        sessionId: this.sessionId,
      } satisfies AttachResult;
    }

    for (let attempt = 0; attempt < TARGET_ATTACH_RETRY_COUNT; attempt += 1) {
      if (!(await this.hasPageTarget({ allowCache: true }))) {
        this.markStale();
        return { ok: false, reason: "target-gone" };
      }

      const attached = await this.options.transport.send(
        "Target.attachToTarget",
        {
          targetId: this.options.targetId,
          flatten: true,
        },
        undefined,
        TARGET_ATTACH_TIMEOUT_MS,
      ).catch(() => null);
      const sessionId =
        attached && typeof attached.sessionId === "string" && attached.sessionId
          ? attached.sessionId
          : "";

      if (sessionId) {
        this.sessionId = sessionId;
        this.stale = false;
        this.pageEnabled = false;
        return { ok: true, sessionId };
      }

      if (attempt < TARGET_ATTACH_RETRY_COUNT - 1) {
        await delay(TARGET_ATTACH_RETRY_DELAY_MS);
      }
    }

    if (!(await this.hasPageTarget({ allowCache: false }))) {
      this.markStale();
      return { ok: false, reason: "target-gone" };
    }

    return { ok: false, reason: "missing-session" };
  }

  async detach() {
    const sessionId = this.sessionId;
    this.sessionId = undefined;
    this.pageEnabled = false;
    this.stale = true;
    if (this.options.mode !== "browser" || !sessionId) {
      return;
    }

    await this.options.transport.send(
      "Target.detachFromTarget",
      { sessionId },
      undefined,
      TARGET_ATTACH_TIMEOUT_MS,
    ).catch(() => undefined);
  }

  async enablePage() {
    await this.ensureAttached();
    if (this.pageEnabled) {
      return;
    }

    await this.send("Page.enable", undefined, TARGET_ATTACH_TIMEOUT_MS);
    this.pageEnabled = true;
  }

  async startScreencast(
    controller: ScreencastController,
    options: ScreencastOptions,
  ) {
    await this.enablePage();
    return controller.startStream(
      this.options.mode === "browser" ? this.options.targetId : null,
      options,
      this.sessionId,
    ).catch((error: unknown) => {
      if (this.sessionId && isMissingSessionError(error)) {
        this.markStale("页面会话已失效。");
      }
      throw error;
    });
  }

  async stopScreencast(
    controller: ScreencastController,
    stream: ScreencastStream | undefined,
  ) {
    await controller.closeStream(stream);
  }

  async dispatchMouse(event: CdpViewerMouseEvent) {
    await this.sendInput("Input.dispatchMouseEvent", event);
  }

  async dispatchKeyboard(input: CdpViewerKeyboardInput) {
    if (input.kind === "insertText") {
      await this.sendInput("Input.insertText", { text: input.text });
      return;
    }

    if (input.kind === "editCommand") {
      await this.sendInput("Input.dispatchKeyEvent", buildEditCommandEvent(input.command));
      return;
    }

    if (isBrowserHelpKeyPayload(input.event)) {
      return;
    }

    await this.sendInput("Input.dispatchKeyEvent", input.event);
  }

  async sendReload() {
    await this.send("Page.reload", { ignoreCache: false });
  }

  async readClipboardText() {
    await this.grantClipboardPermissions();
    const result = await this.evaluate(
      "navigator.clipboard.readText()",
      TARGET_ATTACH_TIMEOUT_MS,
      {
        awaitPromise: true,
        userGesture: true,
      },
    );
    return getRemoteStringValue(result);
  }

  async writeClipboardText(text: string) {
    await this.grantClipboardPermissions();
    await this.evaluate(
      `navigator.clipboard.writeText(${JSON.stringify(text)})`,
      TARGET_ATTACH_TIMEOUT_MS,
      {
        awaitPromise: true,
        userGesture: true,
      },
    );
  }

  async readPageMetadata(): Promise<PageMetadata> {
    await this.enablePage();
    const result = await this.evaluate(
      "JSON.stringify({ title: document.title, url: window.location.href })",
      TARGET_ATTACH_TIMEOUT_MS,
    );
    const payload = getRemoteStringValue(result);
    const parsed = payload ? JSON.parse(payload) as Partial<PageMetadata> : {};

    return {
      title: typeof parsed.title === "string" ? parsed.title : "",
      url: typeof parsed.url === "string" ? parsed.url : "",
    };
  }

  async evaluate(
    expression: string,
    timeoutMs?: number,
    options: Record<string, unknown> = {},
  ) {
    return this.send(
      "Runtime.evaluate",
      {
        expression,
        returnByValue: true,
        ...options,
      },
      timeoutMs,
    );
  }

  async syncPointerOverlay(event: CdpViewerMouseEvent) {
    await this.sendInput("Runtime.evaluate", {
      expression: buildPointerOverlayExpression(event),
      returnByValue: false,
    });
  }

  async removePointerOverlay() {
    await this.sendInput("Runtime.evaluate", {
      expression: 'document.getElementById("__cdp_mouse_sync_crosshair__")?.remove();',
      returnByValue: false,
    });
  }

  async inspectActivity(): Promise<TargetActivity | null> {
    try {
      const result = await this.evaluate(
        "JSON.stringify({ visibilityState: document.visibilityState, hasFocus: document.hasFocus() })",
        TARGET_ACTIVITY_TIMEOUT_MS,
      );
      const payload = getRemoteStringValue(result);
      if (!payload) {
        return null;
      }

      const parsed = JSON.parse(payload) as Partial<TargetActivity>;
      return {
        hasFocus: parsed.hasFocus === true,
        visibilityState:
          typeof parsed.visibilityState === "string"
            ? parsed.visibilityState
            : "unknown",
      };
    } catch {
      return null;
    }
  }

  async measureWindowMetrics(): Promise<WindowMetrics> {
    const result = await this.evaluate(
      "JSON.stringify({ width: Math.round(window.innerWidth), height: Math.round(window.innerHeight), chromeWidth: Math.max(0, Math.round(window.outerWidth - window.innerWidth)), chromeHeight: Math.max(0, Math.round(window.outerHeight - window.innerHeight)) })",
      TARGET_VIEWPORT_METRICS_TIMEOUT_MS,
    );
    const payload = getRemoteStringValue(result);
    const parsed = payload ? JSON.parse(payload) as Partial<WindowMetrics> : {};

    return {
      chromeHeight: typeof parsed.chromeHeight === "number" ? parsed.chromeHeight : 0,
      chromeWidth: typeof parsed.chromeWidth === "number" ? parsed.chromeWidth : 0,
      height: typeof parsed.height === "number" ? parsed.height : 0,
      width: typeof parsed.width === "number" ? parsed.width : 0,
    };
  }

  handleDialog(payload: CdpResponsePayload) {
    const params = payload.params;
    const message =
      typeof params?.message === "string" ? params.message.trim() : "";
    const type = typeof params?.type === "string" ? params.type : "unknown";
    const safeMessage = message || type;
    if (!safeMessage) {
      return false;
    }

    const detail = formatJavaScriptDialogDetail(safeMessage, type);
    void this.send(
      "Page.handleJavaScriptDialog",
      { accept: true },
      TARGET_ATTACH_TIMEOUT_MS,
    )
      .then(() => {
        this.options.events?.onDialogHandled?.(`已确认页面原生弹窗：${detail}`);
      })
      .catch((error: unknown) => {
        if (isMissingSessionError(error)) {
          this.markStale();
          return;
        }
        this.options.events?.onDialogHandleFailed?.(
          `页面原生弹窗处理失败：${normalizeErrorMessage(error)}`,
        );
      });
    return true;
  }

  markDetached(detail?: string) {
    this.markStale(detail);
  }

  private async ensureAttached() {
    const attached = await this.attach();
    if (!attached.ok) {
      if (attached.reason === "target-gone") {
        throw new Error("页面 target 已关闭。");
      }
      throw new Error("Target.attachToTarget 没有返回 sessionId。");
    }
  }

  private send(
    method: string,
    params?: Record<string, unknown>,
    timeoutMs?: number,
  ) {
    return this.sendRaw(method, params, timeoutMs);
  }

  private async grantClipboardPermissions() {
    const origin = await this.readPageOrigin();
    if (!origin) {
      return;
    }

    await this.options.transport.send(
      "Browser.grantPermissions",
      {
        origin,
        permissions: [
          "clipboardReadWrite",
          "clipboardSanitizedWrite",
        ],
      },
      undefined,
      TARGET_ATTACH_TIMEOUT_MS,
    ).catch(() => undefined);
  }

  private async readPageOrigin() {
    const result = await this.evaluate(
      "location.origin === 'null' ? '' : location.origin",
      TARGET_ATTACH_TIMEOUT_MS,
    );
    return getRemoteStringValue(result);
  }

  private sendInput(
    method: string,
    params?: Record<string, unknown>,
  ) {
    return this.sendRaw(method, params, CDP_INPUT_REQUEST_TIMEOUT_MS);
  }

  private async sendRaw(
    method: string,
    params?: Record<string, unknown>,
    timeoutMs?: number,
  ) {
    await this.ensureAttachedForSessionCommand();
    return this.options.transport.send(method, params, this.sessionId, timeoutMs)
      .catch((error: unknown) => {
        if (this.sessionId && isMissingSessionError(error)) {
          this.markStale("页面会话已失效。");
        }
        throw error;
      });
  }

  private async ensureAttachedForSessionCommand() {
    if (this.options.mode === "page") {
      return;
    }

    if (!this.sessionId || this.stale) {
      await this.ensureAttached();
    }
  }

  private async hasPageTarget(options: { allowCache: boolean }) {
    if (this.options.mode !== "browser" || !this.options.targetId) {
      return true;
    }

    return this.options.events?.hasPageTarget?.(this.options.targetId, options) ?? true;
  }

  private markStale(detail?: string) {
    const wasLive = Boolean(this.sessionId) && !this.stale;
    this.sessionId = undefined;
    this.pageEnabled = false;
    this.stale = true;
    if (wasLive || detail) {
      this.options.events?.onStale?.(detail);
    }
  }
}

function buildEditCommandEvent(command: CdpViewerEditCommand) {
  const key = editCommandKeys[command];
  const code = `Key${key.toUpperCase()}`;
  const virtualKeyCode = key.toUpperCase().charCodeAt(0);
  return {
    type: "rawKeyDown" as const,
    key,
    code,
    windowsVirtualKeyCode: virtualKeyCode,
    nativeVirtualKeyCode: virtualKeyCode,
    commands: [command],
  };
}

const editCommandKeys: Record<CdpViewerEditCommand, string> = {
    copy: "c",
    cut: "x",
    paste: "v",
    selectAll: "a",
    undo: "z",
};

function getRemoteStringValue(result: Record<string, unknown>) {
  const remoteObject =
    result.result && typeof result.result === "object"
      ? (result.result as Record<string, unknown>)
      : null;
  return remoteObject && typeof remoteObject.value === "string"
    ? remoteObject.value
    : "";
}
