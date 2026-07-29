import { BrowserRuntime } from "./browserRuntime";
import {
  CdpTransport,
  type CdpResponsePayload,
} from "./cdpTransport";
import type { PageRuntime } from "./pageRuntime";
import {
  ScreencastController,
  type ScreencastOptions,
  type ScreencastStream,
} from "./screencastController";
import type {
  CdpViewerConnectionState,
  CdpViewerFrame,
  CdpViewerKeyboardInput,
  CdpViewerMode,
  CdpViewerMouseEvent,
  CdpViewerStreamState,
  CdpViewerTarget,
  CdpViewerTargetsChange,
  CdpViewerViewportSize,
} from "./cdpViewerTypes";
import {
  VIEWPORT_APPLY_TIMEOUT_MS,
  VIEWPORT_POLL_INTERVAL_MS,
  delay,
  endpointMode,
  isCdpRequestTimeoutError,
  isMissingSessionError,
  isViewportSizeMatch,
  normalizeErrorMessage,
  normalizeOptionalString,
  normalizeViewportSize,
} from "./cdpViewerUtils";

export type {
  CdpViewerConnectionState,
  CdpViewerFrame,
  CdpViewerKeyboardEvent,
  CdpViewerKeyboardInput,
  CdpViewerMode,
  CdpViewerMouseEvent,
  CdpViewerStreamState,
  CdpViewerTarget,
  CdpViewerTargetsChange,
  CdpViewerViewportSize,
} from "./cdpViewerTypes";

export type CdpViewerClientEvents = {
  onConnectionStateChange?: (
    state: CdpViewerConnectionState,
    detail?: string,
  ) => void;
  onFrame?: (frame: CdpViewerFrame) => void;
  onStreamStateChange?: (state: CdpViewerStreamState, detail?: string) => void;
  onTargetsChange?: (
    targets: CdpViewerTarget[],
    change?: CdpViewerTargetsChange,
  ) => void;
  onVersion?: (version: string) => void;
};

type PointerOverlayQueue = {
  flushing: boolean;
  ordered: CdpViewerMouseEvent[];
  pendingMove?: CdpViewerMouseEvent;
};

type QueuedMouseInputEvent = {
  event: CdpViewerMouseEvent;
  runtime: PageRuntime;
  streamVersion: number;
};

type MouseInputQueue = {
  flushing: boolean;
  ordered: QueuedMouseInputEvent[];
  pendingMove?: QueuedMouseInputEvent;
  pendingWheel?: QueuedMouseInputEvent;
};

type QueuedKeyboardInputEvent = {
  input: CdpViewerKeyboardInput;
  runtime: PageRuntime;
  streamVersion: number;
};

type KeyboardInputQueue = {
  disabledUntil: number;
  flushing: boolean;
  ordered: QueuedKeyboardInputEvent[];
};

const KEYBOARD_INPUT_COOLDOWN_MS = 1500;

export class CdpViewerClient {
  private readonly endpoint: string;

  private readonly events: CdpViewerClientEvents;

  private browserRuntime: BrowserRuntime | null = null;

  private currentRuntime: PageRuntime | null = null;

  private currentStream: ScreencastStream | undefined;

  private keyboardInputQueue: KeyboardInputQueue = {
    disabledUntil: 0,
    flushing: false,
    ordered: [],
  };

  private mouseInputQueue: MouseInputQueue = {
    flushing: false,
    ordered: [],
    pendingMove: undefined,
    pendingWheel: undefined,
  };

  private pointerOverlayQueue: PointerOverlayQueue = {
    flushing: false,
    ordered: [],
    pendingMove: undefined,
  };

  private screencast: ScreencastController | null = null;

  private state: CdpViewerConnectionState = "idle";

  private streamOperation: Promise<void> = Promise.resolve();

  private streamRequestVersion = 0;

  private streamState: CdpViewerStreamState = "idle";

  private transport: CdpTransport | null = null;

  readonly mode: CdpViewerMode;

  readonly readableEndpoint: string;

  version = "";

  constructor(endpoint: unknown, events: CdpViewerClientEvents = {}) {
    this.endpoint = normalizeOptionalString(endpoint);
    this.mode = endpointMode(this.endpoint);
    this.readableEndpoint = this.endpoint;
    this.events = events;
  }

  async connect() {
    if (!this.endpoint) {
      throw new Error("CDP endpoint 不能为空。");
    }
    if (this.transport?.isOpen) {
      return;
    }

    this.setState("connecting");
    const transport = new CdpTransport(this.endpoint, {
      onClose: () => {
        const detail =
          this.state === "disconnecting" ? "已断开连接。" : "CDP 连接已关闭。";
        this.finishConnection(detail);
      },
      onEvent: (payload) => {
        this.handleCdpEvent(payload);
      },
    });
    this.transport = transport;
    this.screencast = new ScreencastController({
      mode: this.mode,
      transport,
    });
    this.browserRuntime = new BrowserRuntime({
      mode: this.mode,
      transport,
      events: {
        onDialogDetail: (detail) => {
          this.setStreamState(this.streamState, detail);
        },
        onPageRuntimeStale: (runtime, detail) => {
          this.handleRuntimeStale(runtime, detail);
        },
        onTargetRemoved: (targetId) => {
          if (this.currentStream?.targetId === targetId) {
            void this.stopStream();
          }
        },
        onTargetsChange: (targets, change) => {
          this.events.onTargetsChange?.(targets, change);
        },
      },
    });

    try {
      await transport.connect();
    } catch (error) {
      this.setState("disconnected", normalizeErrorMessage(error));
      throw error;
    }

    this.setState("connected");

    try {
      await this.loadVersion();
      await this.browserRuntime.connect();
    } catch (error) {
      await this.disconnect();
      throw error;
    }
  }

  async disconnect() {
    if (!this.transport) {
      this.finishConnection("已断开连接。");
      return;
    }

    this.setState("disconnecting");
    try {
      await this.stopStream();
      await this.browserRuntime?.dispose();
    } catch {
      // Ignore cleanup errors and continue closing the transport.
    }

    this.transport.close();
    this.transport = null;
    this.finishConnection("已断开连接。");
  }

  async refreshTargets() {
    return this.browserRuntime?.refreshTargets() ?? [];
  }

  async activateTarget(targetId: string) {
    await this.browserRuntime?.activateTarget(targetId);
  }

  async dispatchMouseEvent(event: CdpViewerMouseEvent) {
    const runtime = this.currentRuntime;
    const stream = this.currentStream;
    if (!runtime || !stream || this.streamState !== "streaming") {
      return false;
    }

    this.enqueuePointerOverlay(event);
    this.enqueueMouseInput(event, runtime);
    return true;
  }

  async dispatchKeyboardInput(input: CdpViewerKeyboardInput) {
    const runtime = this.currentRuntime;
    if (!runtime || !this.currentStream || this.streamState !== "streaming") {
      return false;
    }

    if (Date.now() < this.keyboardInputQueue.disabledUntil) {
      return false;
    }

    this.enqueueKeyboardInput(input, runtime);
    return true;
  }

  async ensureViewportSize(
    targetId: string | null,
    width: number,
    height: number,
  ) {
    const runtime = this.getRuntime(targetId);
    const desiredSize = normalizeViewportSize({ height, width });
    const currentMetrics = await runtime.measureWindowMetrics();
    if (isViewportSizeMatch(currentMetrics, desiredSize)) {
      return currentMetrics;
    }

    const transport = this.requireTransport();
    const params =
      this.mode === "browser"
        ? targetId
          ? { targetId }
          : null
        : {};
    if (!params) {
      throw new Error("请选择一个页面 target。");
    }

    const result = await transport.send("Browser.getWindowForTarget", params);
    if (typeof result.windowId !== "number") {
      throw new Error("Browser.getWindowForTarget 没有返回 windowId。");
    }

    await transport.send("Browser.setWindowBounds", {
      windowId: result.windowId,
      bounds: {
        windowState: "normal",
        width: desiredSize.width + currentMetrics.chromeWidth,
        height: desiredSize.height + currentMetrics.chromeHeight,
      },
    });

    return this.waitForViewportSize(runtime, desiredSize);
  }

  async createTarget(url = "about:blank") {
    return this.requireBrowserRuntime().createTarget(url);
  }

  async closeTarget(targetId: string) {
    await this.requireBrowserRuntime().closeTarget(targetId);
  }

  async reloadTarget(targetId: string | null) {
    await this.requireBrowserRuntime().reloadTarget(targetId);
  }

  async readClipboardText(targetId: string | null) {
    return this.requireBrowserRuntime().readClipboardText(
      this.mode === "browser" ? targetId : null,
    );
  }

  async writeClipboardText(targetId: string | null, text: string) {
    await this.requireBrowserRuntime().writeClipboardText(
      this.mode === "browser" ? targetId : null,
      text,
    );
  }

  async findActiveTargetId() {
    return this.requireBrowserRuntime().findActiveTargetId();
  }

  async startStream(targetId: string | null, options: ScreencastOptions) {
    const version = ++this.streamRequestVersion;
    const operation = this.streamOperation
      .catch(() => undefined)
      .then(() => this.startStreamNow(targetId, options, version));
    this.streamOperation = operation;
    await operation;
  }

  async stopStream() {
    const operation = this.queueStopStream();
    await operation;
  }

  private queueStopStream() {
    ++this.streamRequestVersion;
    const operation = this.streamOperation
      .catch(() => undefined)
      .then(() => this.stopStreamNow({ publishState: true }));
    this.streamOperation = operation;
    return operation;
  }

  private async startStreamNow(
    targetId: string | null,
    options: ScreencastOptions,
    version: number,
  ) {
    if (version !== this.streamRequestVersion) {
      return;
    }

    this.setStreamState("starting");
    await this.stopStreamNow({ publishState: false });
    if (version !== this.streamRequestVersion) {
      return;
    }

    let nextStream: ScreencastStream | undefined;
    const runtime = this.getRuntime(targetId);
    try {
      if (!this.screencast) {
        throw new Error("CDP WebSocket 尚未连接。");
      }
      nextStream = await runtime.startScreencast(this.screencast, options);
      this.currentRuntime = runtime;
      this.currentStream = nextStream;
      if (version !== this.streamRequestVersion) {
        if (this.currentStream === nextStream) {
          this.currentStream = undefined;
          this.currentRuntime = null;
        }
        await runtime.stopScreencast(this.screencast, nextStream);
        return;
      }

      this.setStreamState("streaming");
    } catch (error) {
      if (nextStream && this.currentStream === nextStream) {
        this.currentStream = undefined;
        this.currentRuntime = null;
      }
      if (this.screencast) {
        await runtime.stopScreencast(this.screencast, nextStream);
      }
      if (version === this.streamRequestVersion) {
        this.setStreamState("stopped", normalizeErrorMessage(error));
      }
      throw error;
    }
  }

  private async stopStreamNow({ publishState }: { publishState: boolean }) {
    if (!this.currentStream) {
      if (publishState) {
        this.setStreamState(this.transport?.isOpen ? "stopped" : "idle");
      }
      return;
    }

    if (publishState) {
      this.setStreamState("stopping");
    }
    const stream = this.currentStream;
    const runtime = this.currentRuntime;
    this.currentStream = undefined;
    this.currentRuntime = null;
    this.resetKeyboardInputQueue();
    this.resetMouseInputQueue();
    await this.closeStream(runtime, stream);

    if (publishState) {
      this.setStreamState(this.transport?.isOpen ? "stopped" : "idle");
    }
  }

  private async closeStream(
    runtime: PageRuntime | null,
    stream: ScreencastStream | undefined,
  ) {
    if (!stream || !this.screencast) {
      return;
    }

    await runtime?.removePointerOverlay().catch((error: unknown) => {
      if (isMissingSessionError(error)) {
        this.handleRuntimeStale(runtime);
      }
    });
    if (runtime) {
      await runtime.stopScreencast(this.screencast, stream);
      return;
    }

    await this.screencast.closeStream(stream);
  }

  private enqueueMouseInput(event: CdpViewerMouseEvent, runtime: PageRuntime) {
    const item: QueuedMouseInputEvent = {
      event,
      runtime,
      streamVersion: this.streamRequestVersion,
    };

    if (event.type === "mouseMoved") {
      this.mouseInputQueue.pendingMove = item;
    } else if (event.type === "mouseWheel") {
      this.mouseInputQueue.pendingWheel = item;
    } else {
      this.mouseInputQueue.ordered.push(item);
    }

    if (this.mouseInputQueue.flushing) {
      return;
    }

    this.mouseInputQueue.flushing = true;
    window.setTimeout(() => {
      void this.flushMouseInputQueue();
    }, 0);
  }

  private async flushMouseInputQueue() {
    try {
      while (this.streamState === "streaming") {
        const item = this.takeNextMouseInput();
        if (!item) {
          return;
        }

        if (
          item.streamVersion !== this.streamRequestVersion ||
          item.runtime !== this.currentRuntime
        ) {
          continue;
        }

        await item.runtime.dispatchMouse(item.event)
          .catch((error: unknown) => {
            if (isMissingSessionError(error)) {
              this.handleRuntimeStale(item.runtime, "页面会话已失效。");
            }
          });
      }
    } finally {
      this.mouseInputQueue.flushing = false;

      if (this.streamState !== "streaming") {
        this.resetMouseInputQueue();
        return;
      }

      if (this.hasQueuedMouseInput()) {
        this.mouseInputQueue.flushing = true;
        window.setTimeout(() => {
          void this.flushMouseInputQueue();
        }, 0);
      }
    }
  }

  private takeNextMouseInput() {
    const queue = this.mouseInputQueue;
    if (queue.ordered.length > 0) {
      const nextOrdered = queue.ordered.shift();
      if (nextOrdered?.event.type === "mouseReleased" && queue.pendingMove) {
        const pendingMove = queue.pendingMove;
        queue.pendingMove = undefined;
        queue.ordered.unshift(nextOrdered);
        return pendingMove;
      }
      return nextOrdered;
    }

    if (queue.pendingMove) {
      const pendingMove = queue.pendingMove;
      queue.pendingMove = undefined;
      return pendingMove;
    }

    if (queue.pendingWheel) {
      const pendingWheel = queue.pendingWheel;
      queue.pendingWheel = undefined;
      return pendingWheel;
    }

    return undefined;
  }

  private hasQueuedMouseInput() {
    return (
      this.mouseInputQueue.ordered.length > 0 ||
      Boolean(this.mouseInputQueue.pendingMove) ||
      Boolean(this.mouseInputQueue.pendingWheel)
    );
  }

  private resetMouseInputQueue() {
    this.mouseInputQueue = {
      flushing: false,
      ordered: [],
      pendingMove: undefined,
      pendingWheel: undefined,
    };
  }

  private enqueueKeyboardInput(input: CdpViewerKeyboardInput, runtime: PageRuntime) {
    this.keyboardInputQueue.ordered.push({
      input,
      runtime,
      streamVersion: this.streamRequestVersion,
    });

    if (this.keyboardInputQueue.flushing) {
      return;
    }

    this.keyboardInputQueue.flushing = true;
    window.setTimeout(() => {
      void this.flushKeyboardInputQueue();
    }, 0);
  }

  private async flushKeyboardInputQueue() {
    try {
      while (this.streamState === "streaming") {
        if (Date.now() < this.keyboardInputQueue.disabledUntil) {
          this.keyboardInputQueue.ordered = [];
          return;
        }

        const item = this.keyboardInputQueue.ordered.shift();
        if (!item) {
          return;
        }

        if (
          item.streamVersion !== this.streamRequestVersion ||
          item.runtime !== this.currentRuntime
        ) {
          continue;
        }

        try {
          await item.runtime.dispatchKeyboard(item.input);
        } catch (error) {
          if (isMissingSessionError(error)) {
            this.keyboardInputQueue.ordered = [];
            this.handleRuntimeStale(item.runtime, "页面会话已失效。");
            return;
          }

          if (isCdpRequestTimeoutError(error)) {
            this.tripKeyboardInputCircuit(
              item.runtime,
              "键盘输入通道超时，已暂停并丢弃积压按键。",
            );
            return;
          }

          throw error;
        }
      }
    } catch (error) {
      this.setStreamState(this.streamState, normalizeErrorMessage(error));
    } finally {
      this.keyboardInputQueue.flushing = false;

      if (this.streamState !== "streaming") {
        this.resetKeyboardInputQueue();
        return;
      }

      if (
        this.keyboardInputQueue.ordered.length > 0 &&
        Date.now() >= this.keyboardInputQueue.disabledUntil
      ) {
        this.keyboardInputQueue.flushing = true;
        window.setTimeout(() => {
          void this.flushKeyboardInputQueue();
        }, 0);
      }
    }
  }

  private tripKeyboardInputCircuit(runtime: PageRuntime, detail: string) {
    this.keyboardInputQueue.disabledUntil = Date.now() + KEYBOARD_INPUT_COOLDOWN_MS;
    this.keyboardInputQueue.ordered = [];
    runtime.markDetached(detail);
    this.handleRuntimeStale(runtime, detail);
  }

  private resetKeyboardInputQueue() {
    this.keyboardInputQueue = {
      disabledUntil: 0,
      flushing: false,
      ordered: [],
    };
  }

  private enqueuePointerOverlay(event: CdpViewerMouseEvent) {
    if (!this.currentRuntime || event.type === "mouseWheel") {
      return;
    }

    if (event.type === "mouseMoved") {
      this.pointerOverlayQueue.pendingMove = event;
    } else {
      this.pointerOverlayQueue.ordered.push(event);
    }

    if (this.pointerOverlayQueue.flushing) {
      return;
    }

    this.pointerOverlayQueue.flushing = true;
    window.setTimeout(() => {
      void this.flushPointerOverlayQueue();
    }, 0);
  }

  private async flushPointerOverlayQueue() {
    try {
      while (
        this.currentRuntime &&
        (this.pointerOverlayQueue.ordered.length > 0 ||
          this.pointerOverlayQueue.pendingMove)
      ) {
        let event: CdpViewerMouseEvent | undefined;

        if (
          this.pointerOverlayQueue.pendingMove &&
          (this.pointerOverlayQueue.ordered.length === 0 ||
            this.pointerOverlayQueue.ordered[0]?.type === "mouseReleased")
        ) {
          event = this.pointerOverlayQueue.pendingMove;
          this.pointerOverlayQueue.pendingMove = undefined;
        } else {
          event = this.pointerOverlayQueue.ordered.shift();
        }

        if (event) {
          await this.currentRuntime.syncPointerOverlay(event).catch(() => undefined);
        }
      }
    } finally {
      this.pointerOverlayQueue.flushing = false;

      if (
        this.currentRuntime &&
        (this.pointerOverlayQueue.ordered.length > 0 ||
          this.pointerOverlayQueue.pendingMove)
      ) {
        this.pointerOverlayQueue.flushing = true;
        window.setTimeout(() => {
          void this.flushPointerOverlayQueue();
        }, 0);
      }
    }
  }

  private async waitForViewportSize(
    runtime: PageRuntime,
    desiredSize: CdpViewerViewportSize,
  ) {
    const deadline = Date.now() + VIEWPORT_APPLY_TIMEOUT_MS;
    let latestMetrics = await runtime.measureWindowMetrics();

    while (!isViewportSizeMatch(latestMetrics, desiredSize) && Date.now() < deadline) {
      await delay(VIEWPORT_POLL_INTERVAL_MS);
      latestMetrics = await runtime.measureWindowMetrics();
    }

    if (!isViewportSizeMatch(latestMetrics, desiredSize)) {
      throw new Error(
        `远程 viewport 未变为 ${desiredSize.width} x ${desiredSize.height}，当前 ${latestMetrics.width} x ${latestMetrics.height}。`,
      );
    }

    return latestMetrics;
  }

  private async loadVersion() {
    const transport = this.requireTransport();
    try {
      const result = await transport.send("Browser.getVersion");
      const product =
        typeof result.product === "string" && result.product
          ? result.product
          : "unknown";
      this.version = product;
      this.events.onVersion?.(product);
      return;
    } catch {
      this.version = "unknown";
      this.events.onVersion?.("unknown");
    }

    await transport.send("Schema.getDomains");
  }

  private handleCdpEvent(payload: CdpResponsePayload) {
    if (!payload.method) {
      return;
    }

    if (payload.method === "Page.screencastFrame") {
      this.handleScreencastFrame(payload);
      return;
    }

    if (this.browserRuntime?.handleEvent(payload)) {
      return;
    }
  }

  private handleScreencastFrame(payload: CdpResponsePayload) {
    const frame = this.screencast?.handleFrame(payload, this.currentStream);
    if (!frame) {
      return;
    }

    this.events.onFrame?.({
      dataUrl: `data:image/${this.currentStream?.format ?? "jpeg"};base64,${frame.data}`,
      displayHeight: frame.displayHeight,
      displayWidth: frame.displayWidth,
      width: frame.width,
      height: frame.height,
      receivedAt: Date.now(),
    });
  }

  private handleRuntimeStale(runtime: PageRuntime | null, detail?: string) {
    if (!runtime || this.currentRuntime !== runtime) {
      return;
    }

    this.currentStream = undefined;
    this.currentRuntime = null;
    this.resetKeyboardInputQueue();
    this.resetMouseInputQueue();
    this.setStreamState("stopped", detail ?? "页面会话已失效。");
  }

  private getRuntime(targetId: string | null) {
    return this.requireBrowserRuntime().getPageRuntime(
      this.mode === "browser" ? targetId : null,
    );
  }

  private requireTransport() {
    if (!this.transport?.isOpen) {
      throw new Error("CDP WebSocket 尚未连接。");
    }
    return this.transport;
  }

  private requireBrowserRuntime() {
    if (!this.browserRuntime) {
      throw new Error("CDP WebSocket 尚未连接。");
    }
    return this.browserRuntime;
  }

  private setState(state: CdpViewerConnectionState, detail?: string) {
    this.state = state;
    this.events.onConnectionStateChange?.(state, detail);
  }

  private setStreamState(state: CdpViewerStreamState, detail?: string) {
    this.streamState = state;
    this.events.onStreamStateChange?.(state, detail);
  }

  private finishConnection(detail: string) {
    ++this.streamRequestVersion;
    this.transport?.failPending(detail);
    this.currentStream = undefined;
    this.currentRuntime = null;
    this.resetKeyboardInputQueue();
    this.setStreamState("idle", detail);
    this.events.onTargetsChange?.([]);
    this.screencast = null;
    this.browserRuntime = null;
    this.transport = null;
    this.setState("disconnected", detail);
  }
}
