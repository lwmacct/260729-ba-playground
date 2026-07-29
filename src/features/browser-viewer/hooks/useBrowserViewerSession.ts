import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  CdpViewerClient,
  type CdpViewerConnectionState,
  type CdpViewerFrame,
  type CdpViewerKeyboardInput,
  type CdpViewerMouseEvent,
  type CdpViewerStreamState,
  type CdpViewerTarget,
  type CdpViewerTargetsChange,
} from "../api/cdpViewerClient";
import {
  type BrowserGatewayOptions,
  resolveViewerEndpoint,
} from "../api/proxy";
import type { CdpViewerSettings } from "../model/settings";
import {
  isAboutBlankTarget,
  normalizeCreateTargetUrl,
  normalizeOptionalString,
  resolveReplacementTargetId,
} from "../model/target";
import {
  isUsableViewportSize,
  normalizeViewportSize,
  viewportSizeKey,
  type DesiredViewport,
  type ViewportSize,
} from "../model/viewport";

export type BrowserViewerBusyAction =
  | "close"
  | "connect"
  | "create"
  | "disconnect"
  | "reload"
  | "refresh"
  | "resize"
  | "stream";

type UseBrowserViewerSessionOptions = {
  browserGateway?: BrowserGatewayOptions;
  selectionMode: BrowserViewerSelectionMode;
  settingsRef: RefObject<CdpViewerSettings>;
};

export type BrowserViewerSelectionMode =
  | "follow-active"
  | "manual";

const ACTIVE_TARGET_SYNC_INTERVAL_MS = 1500;
const STREAM_FRAME_STALL_CHECK_INTERVAL_MS = 1500;
const STREAM_FRAME_STALL_RESTART_MS = 4500;
const VIEWPORT_RECONCILE_DELAY_MS = 100;

export function useBrowserViewerSession({
  browserGateway,
  selectionMode,
  settingsRef,
}: UseBrowserViewerSessionOptions) {
  const clientRef = useRef<CdpViewerClient | null>(null);
  const targetsRef = useRef<CdpViewerTarget[]>([]);
  const activeTargetIdRef = useRef<string | null>(null);
  const busyActionTokenRef = useRef(0);
  const connectGenerationRef = useRef(0);
  const connectionStateRef = useRef<CdpViewerConnectionState>("idle");
  const selectionModeRef = useRef(selectionMode);
  const followSyncingRef = useRef(false);
  const modeRef = useRef<"browser" | "page" | null>(null);
  const desiredViewportRef = useRef<DesiredViewport>({
    enabled: false,
    height: 0,
    width: 0,
  });
  const lastReconciledViewportKeyRef = useRef("");
  const lastStreamFrameAtRef = useRef(0);
  const streamRecoveryRunningRef = useRef(false);
  const streamStateRef = useRef<CdpViewerStreamState>("idle");
  const targetSyncTimerRef = useRef<number | null>(null);
  const viewportReconcileGenerationRef = useRef(0);
  const viewportReconcilePendingForceRef = useRef(false);
  const viewportReconcilePendingRef = useRef(false);
  const viewportReconcilePendingRequireStreamingRef = useRef(true);
  const viewportReconcileRunningRef = useRef(false);
  const viewportReconcileTimerRef = useRef<number | null>(null);
  const [connectionState, setConnectionState] =
    useState<CdpViewerConnectionState>("idle");
  const [connectionDetail, setConnectionDetail] = useState("");
  const [streamState, setStreamState] = useState<CdpViewerStreamState>("idle");
  const [streamDetail, setStreamDetail] = useState("");
  const [targets, setTargets] = useState<CdpViewerTarget[]>([]);
  const [frame, setFrame] = useState<CdpViewerFrame | null>(null);
  const [version, setVersion] = useState("");
  const [mode, setMode] = useState<"browser" | "page" | null>(null);
  const [activeTargetId, setActiveTargetId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<BrowserViewerBusyAction | null>(null);

  const isStreaming = streamState === "streaming";
  const isConnected = connectionState === "connected";

  useEffect(() => {
    selectionModeRef.current = selectionMode;
  }, [selectionMode]);

  useEffect(() => {
    return () => {
      clearTargetSyncTimer();
      clearViewportReconcileTimer();
      const client = clientRef.current;
      clientRef.current = null;
      lastReconciledViewportKeyRef.current = "";
      viewportReconcilePendingForceRef.current = false;
      viewportReconcilePendingRef.current = false;
      viewportReconcilePendingRequireStreamingRef.current = true;
      viewportReconcileGenerationRef.current += 1;
      if (client) {
        void client.disconnect();
      }
    };
  }, []);

  useEffect(() => {
    if (selectionMode !== "follow-active") {
      return;
    }

    let disposed = false;

    const sync = async () => {
      if (disposed) {
        return;
      }
      try {
        await syncActiveTarget(settingsRef.current);
      } catch {
        // Follow sync is opportunistic; user actions surface their own errors.
      }
    };

    void sync();
    const timerId = window.setInterval(() => {
      void sync();
    }, ACTIVE_TARGET_SYNC_INTERVAL_MS);

    return () => {
      disposed = true;
      window.clearInterval(timerId);
    };
  }, [selectionMode, settingsRef]);

  useEffect(() => {
    if (
      connectionState !== "connected" ||
      (streamState !== "streaming" && streamState !== "stopped") ||
      mode !== "browser"
    ) {
      return;
    }

    const timerId = window.setInterval(() => {
      void recoverStalledStream().catch(() => undefined);
    }, STREAM_FRAME_STALL_CHECK_INTERVAL_MS);

    return () => {
      window.clearInterval(timerId);
    };
  }, [connectionState, mode, streamState]);

  useEffect(() => {
    requestViewportReconcile();
  }, [activeTargetId, connectionState, mode, streamState]);

  function clearTargetSyncTimer() {
    if (targetSyncTimerRef.current === null) {
      return;
    }

    window.clearTimeout(targetSyncTimerRef.current);
    targetSyncTimerRef.current = null;
  }

  function clearViewportReconcileTimer() {
    if (viewportReconcileTimerRef.current === null) {
      return;
    }

    window.clearTimeout(viewportReconcileTimerRef.current);
    viewportReconcileTimerRef.current = null;
  }

  function getCurrentTargetId(client: CdpViewerClient) {
    return client.mode === "browser" ? activeTargetIdRef.current : null;
  }

  function getViewportSurfaceKey(client: CdpViewerClient, size: ViewportSize) {
    return [
      connectGenerationRef.current,
      client.readableEndpoint,
      client.mode,
      client.mode === "browser" ? activeTargetIdRef.current ?? "" : "page",
      viewportSizeKey(size),
    ].join(":");
  }

  function requestViewportReconcile(
    options: { force?: boolean; requireStreaming?: boolean } = {},
  ) {
    const desiredViewport = desiredViewportRef.current;
    const client = clientRef.current;
    if (viewportReconcileRunningRef.current) {
      viewportReconcilePendingRef.current = true;
      viewportReconcilePendingForceRef.current =
        viewportReconcilePendingForceRef.current || options.force === true;
      viewportReconcilePendingRequireStreamingRef.current =
        viewportReconcilePendingRequireStreamingRef.current &&
        options.requireStreaming !== false;
      return;
    }

    if (
      !desiredViewport.enabled ||
      !client ||
      connectionStateRef.current !== "connected" ||
      (options.requireStreaming !== false && streamStateRef.current !== "streaming")
    ) {
      return;
    }

    const nextSize = normalizeViewportSize(desiredViewport);
    if (!isUsableViewportSize(nextSize)) {
      return;
    }

    if (client.mode === "browser" && !activeTargetIdRef.current) {
      return;
    }

    const surfaceKey = getViewportSurfaceKey(client, nextSize);
    if (!options.force && surfaceKey === lastReconciledViewportKeyRef.current) {
      return;
    }

    const generation = viewportReconcileGenerationRef.current + 1;
    viewportReconcileGenerationRef.current = generation;
    clearViewportReconcileTimer();
    viewportReconcileTimerRef.current = window.setTimeout(() => {
      viewportReconcileTimerRef.current = null;
      void reconcileViewport({
        force: options.force === true,
        generation,
        requireStreaming: options.requireStreaming !== false,
      }).catch((error: unknown) => {
        if (generation === viewportReconcileGenerationRef.current) {
          setConnectionDetail(
            error instanceof Error ? error.message : "画板大小同步失败。",
          );
        }
      });
    }, options.force ? 0 : VIEWPORT_RECONCILE_DELAY_MS);
  }

  async function reconcileViewport(options: {
    force: boolean;
    generation: number;
    requireStreaming: boolean;
  }) {
    if (viewportReconcileRunningRef.current) {
      viewportReconcilePendingRef.current = true;
      viewportReconcilePendingForceRef.current =
        viewportReconcilePendingForceRef.current || options.force;
      viewportReconcilePendingRequireStreamingRef.current =
        viewportReconcilePendingRequireStreamingRef.current &&
        options.requireStreaming;
      return;
    }

    const client = clientRef.current;
    const desiredViewport = desiredViewportRef.current;
    if (
      !desiredViewport.enabled ||
      !client ||
      connectionStateRef.current !== "connected" ||
      (options.requireStreaming && streamStateRef.current !== "streaming")
    ) {
      return;
    }

    const nextSize = normalizeViewportSize(desiredViewport);
    if (!isUsableViewportSize(nextSize)) {
      return;
    }

    const targetId = getCurrentTargetId(client);
    if (client.mode === "browser" && !targetId) {
      return;
    }

    const surfaceKey = getViewportSurfaceKey(client, nextSize);
    if (!options.force && surfaceKey === lastReconciledViewportKeyRef.current) {
      return;
    }

    viewportReconcileRunningRef.current = true;
    viewportReconcilePendingRef.current = false;
    try {
      await client.ensureViewportSize(targetId, nextSize.width, nextSize.height);
      if (options.generation !== viewportReconcileGenerationRef.current) {
        viewportReconcilePendingRef.current = true;
        viewportReconcilePendingForceRef.current = true;
        viewportReconcilePendingRequireStreamingRef.current = false;
        return;
      }

      const values = {
        ...settingsRef.current,
        maxHeight: nextSize.height,
        maxWidth: nextSize.width,
      };
      settingsRef.current = values;
      await startViewerStream(values, targetId, client);
      lastReconciledViewportKeyRef.current = surfaceKey;
      setConnectionDetail("");
    } finally {
      viewportReconcileRunningRef.current = false;
      if (viewportReconcilePendingRef.current) {
        const pendingForce = viewportReconcilePendingForceRef.current;
        const pendingRequireStreaming = viewportReconcilePendingRequireStreamingRef.current;
        viewportReconcilePendingForceRef.current = false;
        viewportReconcilePendingRef.current = false;
        viewportReconcilePendingRequireStreamingRef.current = true;
        requestViewportReconcile({
          force: pendingForce,
          requireStreaming: pendingRequireStreaming,
        });
      }
    }
  }

  const setDesiredViewport = useCallback((nextViewport: DesiredViewport) => {
    const previousViewport = desiredViewportRef.current;
    const previousKey = viewportSizeKey(normalizeViewportSize(previousViewport));
    const nextSize = normalizeViewportSize(nextViewport);
    const nextKey = viewportSizeKey(nextSize);
    desiredViewportRef.current = {
      ...nextSize,
      enabled: nextViewport.enabled,
    };
    requestViewportReconcile({
      force: previousViewport.enabled !== nextViewport.enabled || previousKey !== nextKey,
    });
  }, []);

  function requestActiveTargetSync(delayMs = 0) {
    if (selectionModeRef.current !== "follow-active") {
      return;
    }

    clearTargetSyncTimer();
    targetSyncTimerRef.current = window.setTimeout(() => {
      targetSyncTimerRef.current = null;
      void syncActiveTarget(settingsRef.current).catch(() => undefined);
    }, delayMs);
  }

  function requestSelectedTargetStream(targetId: string) {
    const client = clientRef.current;
    if (!client || client.mode !== "browser") {
      return;
    }

    void (async () => {
      await client.activateTarget(targetId);
      await startViewerStreamAndReconcile(settingsRef.current, targetId, client);
      setConnectionDetail("");
    })().catch(() => undefined);
  }

  async function withBusyAction(
    action: BrowserViewerBusyAction,
    task: () => Promise<void>,
  ) {
    const token = busyActionTokenRef.current + 1;
    busyActionTokenRef.current = token;
    setBusyAction(action);
    try {
      await task();
    } finally {
      if (busyActionTokenRef.current === token) {
        setBusyAction(null);
      }
    }
  }

  function updateActiveTargetId(nextTargetId: string | null) {
    activeTargetIdRef.current = nextTargetId;
    setActiveTargetId(nextTargetId);
  }

  function updateConnectionState(nextState: CdpViewerConnectionState) {
    connectionStateRef.current = nextState;
    setConnectionState(nextState);
  }

  function updateMode(nextMode: "browser" | "page" | null) {
    modeRef.current = nextMode;
    setMode(nextMode);
  }

  function updateStreamState(nextState: CdpViewerStreamState) {
    streamStateRef.current = nextState;
    setStreamState(nextState);
  }

  function updateTargets(nextTargets: CdpViewerTarget[]) {
    targetsRef.current = nextTargets;
    setTargets(nextTargets);
  }

  function bindClient(endpoint: string, generation: number) {
    const client = new CdpViewerClient(endpoint, {
      onConnectionStateChange: (state, detail) => {
        if (generation !== connectGenerationRef.current) {
          return;
        }
        updateConnectionState(state);
        setConnectionDetail(detail ?? "");
        if (state === "disconnected") {
          setFrame(null);
          updateStreamState("idle");
          setStreamDetail("");
        }
      },
      onTargetsChange: (nextTargets, change) => {
        if (generation !== connectGenerationRef.current) {
          return;
        }
        const previousTargets = targetsRef.current;
        const currentTargetId = activeTargetIdRef.current;
        updateTargets(nextTargets);
        if (client.mode === "page") {
          updateActiveTargetId(null);
          return;
        }

        if (
          currentTargetId &&
          nextTargets.some((target) => target.targetId === currentTargetId)
        ) {
          const createdTargetId = change?.targetId;
          if (
            selectionModeRef.current === "follow-active" &&
            shouldFollowCreatedTarget(nextTargets, change, currentTargetId) &&
            createdTargetId
          ) {
            requestFollowTargetStream(createdTargetId);
            return;
          }
          if (selectionModeRef.current === "follow-active") {
            requestActiveTargetSync(100);
          }
          return;
        }

        const nextTargetId = resolveReplacementTargetId(
          previousTargets,
          currentTargetId,
          nextTargets,
        );
        updateActiveTargetId(nextTargetId);
        if (nextTargetId) {
          if (selectionModeRef.current === "follow-active") {
            requestActiveTargetSync(0);
          } else {
            requestSelectedTargetStream(nextTargetId);
          }
        }
      },
      onFrame: (nextFrame) => {
        if (generation !== connectGenerationRef.current) {
          return;
        }
        lastStreamFrameAtRef.current = nextFrame.receivedAt;
        setFrame(nextFrame);
      },
      onStreamStateChange: (state, detail) => {
        if (generation !== connectGenerationRef.current) {
          return;
        }
        updateStreamState(state);
        setStreamDetail(detail ?? "");
        if (state === "idle") {
          setFrame(null);
        }
        if (state === "streaming") {
          lastStreamFrameAtRef.current = Date.now();
        }
      },
      onVersion: (nextVersion) => {
        if (generation !== connectGenerationRef.current) {
          return;
        }
        setVersion(nextVersion);
      },
    });
    clientRef.current = client;
    updateMode(client.mode);
    return client;
  }

  function shouldFollowCreatedTarget(
    nextTargets: CdpViewerTarget[],
    change: CdpViewerTargetsChange | undefined,
    currentTargetId: string | null,
  ) {
    return (
      change?.reason === "created" &&
      typeof change.targetId === "string" &&
      change.targetId !== currentTargetId &&
      nextTargets.some((target) => target.targetId === change.targetId)
    );
  }

  function requestFollowTargetStream(
    targetId: string | undefined,
  ) {
    const client = clientRef.current;
    if (!client || client.mode !== "browser" || !targetId) {
      return;
    }

    updateActiveTargetId(targetId);
    void (async () => {
      await startViewerStreamAndReconcile(settingsRef.current, targetId, client);
      setConnectionDetail("");
    })().catch(() => {
      requestActiveTargetSync(0);
    });
  }

  async function startViewerStream(
    options: CdpViewerSettings,
    targetId: string | null,
    client = clientRef.current,
  ) {
    if (!client) {
      throw new Error("请先连接 CDP endpoint。");
    }

    await client.startStream(client.mode === "browser" ? targetId : null, {
      maxWidth: options.maxWidth,
      maxHeight: options.maxHeight,
      quality: options.quality,
      everyNthFrame: options.everyNthFrame,
    });
  }

  async function startViewerStreamAndReconcile(
    options: CdpViewerSettings,
    targetId: string | null,
    client = clientRef.current,
  ) {
    lastReconciledViewportKeyRef.current = "";
    await startViewerStream(options, targetId, client);
    requestViewportReconcile({ force: true, requireStreaming: false });
  }

  async function connect(values: CdpViewerSettings) {
    const resolvedEndpoint = resolveViewerEndpoint(values.endpoint, browserGateway);
    const generation = connectGenerationRef.current + 1;
    connectGenerationRef.current = generation;
    lastReconciledViewportKeyRef.current = "";
    viewportReconcilePendingForceRef.current = false;
    viewportReconcilePendingRef.current = false;
    viewportReconcilePendingRequireStreamingRef.current = true;
    viewportReconcileGenerationRef.current += 1;
    clearViewportReconcileTimer();
    const previousClient = clientRef.current;
    clientRef.current = null;
    if (previousClient) {
      void previousClient.disconnect();
    }

    await withBusyAction("connect", async () => {
      setVersion("");
      updateTargets([]);
      setFrame(null);
      updateActiveTargetId(null);
      setConnectionDetail("");
      updateStreamState("idle");
      setStreamDetail("");

      const client = bindClient(resolvedEndpoint, generation);
      await client.connect();
      if (generation !== connectGenerationRef.current) {
        await client.disconnect();
        return;
      }
      if (client.mode === "page") {
        await startViewerStreamAndReconcile(values, null, client);
        setConnectionDetail("");
      } else {
        const nextTargets = await client.refreshTargets();
        if (generation !== connectGenerationRef.current) {
          await client.disconnect();
          return;
        }
        const nextTargetId = await client.findActiveTargetId() ?? nextTargets[0]?.targetId ?? null;
        if (generation !== connectGenerationRef.current) {
          await client.disconnect();
          return;
        }
        updateActiveTargetId(nextTargetId);
        if (nextTargetId) {
          await client.activateTarget(nextTargetId);
          await startViewerStreamAndReconcile(values, nextTargetId, client);
          setConnectionDetail("");
        } else {
          setConnectionDetail("没有发现可用页面。");
        }
      }
    }).catch((error: unknown) => {
      if (generation !== connectGenerationRef.current) {
        return;
      }
      clientRef.current = null;
      updateMode(null);
      updateTargets([]);
      updateActiveTargetId(null);
      setFrame(null);
      updateConnectionState("disconnected");
      updateStreamState("idle");
      setStreamDetail("");
      throw error;
    });
  }

  async function disconnect() {
    connectGenerationRef.current += 1;
    lastReconciledViewportKeyRef.current = "";
    viewportReconcilePendingForceRef.current = false;
    viewportReconcilePendingRef.current = false;
    viewportReconcilePendingRequireStreamingRef.current = true;
    viewportReconcileGenerationRef.current += 1;
    clearTargetSyncTimer();
    clearViewportReconcileTimer();
    await withBusyAction("disconnect", async () => {
      const client = clientRef.current;
      clientRef.current = null;
      if (client) {
        await client.disconnect();
      } else {
        updateConnectionState("disconnected");
        setConnectionDetail("已断开连接。");
      }
      updateTargets([]);
      updateMode(null);
      setVersion("");
      updateActiveTargetId(null);
      setFrame(null);
      updateStreamState("idle");
      setStreamDetail("");
    });
  }

  async function refreshTargets(options: CdpViewerSettings) {
    const client = clientRef.current;
    if (!client) {
      return;
    }

    await withBusyAction("refresh", async () => {
      const previousTargets = targetsRef.current;
      const previousTargetId = activeTargetIdRef.current;
      const nextTargets = await client.refreshTargets();
      const nextTargetId = resolveReplacementTargetId(
        previousTargets,
        previousTargetId,
        nextTargets,
      );
      updateActiveTargetId(nextTargetId);
      if (nextTargetId) {
        if (
          nextTargetId !== previousTargetId ||
          streamStateRef.current !== "streaming"
        ) {
          await client.activateTarget(nextTargetId);
          await startViewerStreamAndReconcile(options, nextTargetId, client);
        }
        requestViewportReconcile({ force: true });
        setConnectionDetail("");
      } else {
        setConnectionDetail("没有发现可用页面。");
      }
    });
  }

  async function applyCanvasSize(nextCanvasSize: ViewportSize, options: CdpViewerSettings) {
    const client = clientRef.current;
    if (!client) {
      throw new Error("请先连接 CDP endpoint。");
    }

    await withBusyAction("resize", async () => {
      const currentTargetId = getCurrentTargetId(client);
      if (client.mode === "browser" && !currentTargetId) {
        throw new Error("请选择一个页面 target。");
      }

      const normalizedSize = normalizeViewportSize(nextCanvasSize);
      settingsRef.current = {
        ...options,
        maxHeight: normalizedSize.height,
        maxWidth: normalizedSize.width,
      };
      await client.ensureViewportSize(currentTargetId, normalizedSize.width, normalizedSize.height);
      await startViewerStream(settingsRef.current, currentTargetId, client);
      lastReconciledViewportKeyRef.current = getViewportSurfaceKey(client, normalizedSize);
      setConnectionDetail("");
    });
  }

  async function switchTarget(targetId: string, options: CdpViewerSettings) {
    clearTargetSyncTimer();
    const client = clientRef.current;
    if (!client || client.mode !== "browser") {
      updateActiveTargetId(targetId);
      return;
    }

    updateActiveTargetId(targetId);

    await withBusyAction("stream", async () => {
      await client.activateTarget(targetId);
      await startViewerStreamAndReconcile(options, targetId, client);
      setConnectionDetail("");
    });
  }

  async function closeTarget(targetId: string, options: CdpViewerSettings) {
    const client = clientRef.current;
    if (!client || client.mode !== "browser" || !targetId) {
      return;
    }

    const currentTargets = targetsRef.current;
    const activeTargetRecord = currentTargets.find(
      (target) => target.targetId === targetId,
    );
    if (currentTargets.length <= 1 && isAboutBlankTarget(activeTargetRecord)) {
      return;
    }

    await withBusyAction("close", async () => {
      const previousTargets = targetsRef.current;
      const currentActiveTargetId = activeTargetIdRef.current;
      if (previousTargets.length <= 1 && activeTargetRecord) {
        await client.createTarget("about:blank");
      }

      await client.closeTarget(targetId);
      const nextTargets = await client.refreshTargets();
      if (
        targetId !== currentActiveTargetId &&
        currentActiveTargetId &&
        nextTargets.some((target) => target.targetId === currentActiveTargetId)
      ) {
        updateActiveTargetId(currentActiveTargetId);
        setConnectionDetail("");
        return;
      }

      const nextTargetId =
        nextTargets.find((target) => normalizeOptionalString(target.url) === "about:blank")?.targetId ??
        resolveReplacementTargetId(previousTargets, targetId, nextTargets);

      updateActiveTargetId(nextTargetId);
      if (!nextTargetId) {
        setFrame(null);
        setConnectionDetail("没有打开的标签页。");
        return;
      }

      await client.activateTarget(nextTargetId);
      await startViewerStreamAndReconcile(options, nextTargetId, client);
      setConnectionDetail("");
    });
  }

  async function reloadActiveTarget(options: CdpViewerSettings) {
    const client = clientRef.current;
    if (!client) {
      return;
    }

    const currentTargetId =
      client.mode === "browser" ? activeTargetIdRef.current : null;
    if (client.mode === "browser" && !currentTargetId) {
      return;
    }

    await withBusyAction("reload", async () => {
      await client.reloadTarget(currentTargetId);
      await startViewerStreamAndReconcile(options, currentTargetId, client);
      setConnectionDetail("");
    });
  }

  async function createTarget(url: string, options: CdpViewerSettings) {
    const client = clientRef.current;
    if (!client || client.mode !== "browser") {
      throw new Error("当前连接不支持新建标签页。");
    }

    const nextUrl = normalizeCreateTargetUrl(url);

    await withBusyAction("create", async () => {
      const previousTargets = targetsRef.current;
      const createdTargetId = await client.createTarget(nextUrl);
      const nextTargets = await client.refreshTargets();
      const nextTargetId =
        createdTargetId && nextTargets.some((target) => target.targetId === createdTargetId)
          ? createdTargetId
          : resolveReplacementTargetId(
            previousTargets,
            activeTargetIdRef.current,
            nextTargets,
          );

      updateActiveTargetId(nextTargetId);
      if (!nextTargetId) {
        setFrame(null);
        setConnectionDetail("没有发现可用页面。");
        return;
      }

      await client.activateTarget(nextTargetId);
      await startViewerStreamAndReconcile(options, nextTargetId, client);
      setConnectionDetail("");
    });
  }

  async function syncActiveTarget(options: CdpViewerSettings) {
    if (
      modeRef.current !== "browser" ||
      connectionStateRef.current !== "connected" ||
      selectionModeRef.current !== "follow-active"
    ) {
      return;
    }
    if (followSyncingRef.current) {
      return;
    }

    const client = clientRef.current;
    if (!client || client.mode !== "browser") {
      return;
    }

    followSyncingRef.current = true;
    try {
      const nextTargetId = await client.findActiveTargetId();
      if (!nextTargetId || nextTargetId === activeTargetIdRef.current) {
        return;
      }

      updateActiveTargetId(nextTargetId);
      await startViewerStreamAndReconcile(options, nextTargetId, client);
      setConnectionDetail("");
    } finally {
      followSyncingRef.current = false;
    }
  }

  async function recoverStalledStream() {
    if (streamRecoveryRunningRef.current) {
      return;
    }
    if (
      modeRef.current !== "browser" ||
      connectionStateRef.current !== "connected" ||
      (streamStateRef.current !== "streaming" && streamStateRef.current !== "stopped")
    ) {
      return;
    }

    const client = clientRef.current;
    const currentTargetId = activeTargetIdRef.current;
    if (!client || client.mode !== "browser" || !currentTargetId) {
      return;
    }

    const lastFrameAt = lastStreamFrameAtRef.current;
    if (
      streamStateRef.current === "streaming" &&
      lastFrameAt > 0 &&
      Date.now() - lastFrameAt < STREAM_FRAME_STALL_RESTART_MS
    ) {
      return;
    }

    streamRecoveryRunningRef.current = true;
    try {
      const nextTargetId =
        selectionModeRef.current === "follow-active"
          ? await client.findActiveTargetId()
          : null;
      const recoveryTargetId = nextTargetId ?? currentTargetId;
      if (recoveryTargetId !== activeTargetIdRef.current) {
        updateActiveTargetId(recoveryTargetId);
      }
      await startViewerStreamAndReconcile(
        settingsRef.current,
        recoveryTargetId,
        client,
      );
      setConnectionDetail("");
    } finally {
      streamRecoveryRunningRef.current = false;
    }
  }

  async function dispatchMouseEvent(payload: CdpViewerMouseEvent) {
    if (!clientRef.current || streamStateRef.current !== "streaming") {
      return false;
    }
    return clientRef.current.dispatchMouseEvent(payload);
  }

  async function dispatchKeyboardInput(payload: CdpViewerKeyboardInput) {
    if (!clientRef.current || streamStateRef.current !== "streaming") {
      return false;
    }
    return clientRef.current.dispatchKeyboardInput(payload);
  }

  async function readRemoteClipboardText() {
    const client = clientRef.current;
    if (!client || connectionStateRef.current !== "connected") {
      throw new Error("请先连接 CDP endpoint。");
    }
    const currentTargetId =
      client.mode === "browser" ? activeTargetIdRef.current : null;
    if (client.mode === "browser" && !currentTargetId) {
      throw new Error("请选择一个页面 target。");
    }
    return client.readClipboardText(currentTargetId);
  }

  async function writeRemoteClipboardText(text: string) {
    const client = clientRef.current;
    if (!client || connectionStateRef.current !== "connected") {
      throw new Error("请先连接 CDP endpoint。");
    }
    const currentTargetId =
      client.mode === "browser" ? activeTargetIdRef.current : null;
    if (client.mode === "browser" && !currentTargetId) {
      throw new Error("请选择一个页面 target。");
    }
    await client.writeClipboardText(currentTargetId, text);
  }

  return {
    activeTargetId,
    applyCanvasSize,
    busyAction,
    closeTarget,
    connect,
    connectionDetail,
    connectionState,
    createTarget,
    disconnect,
    dispatchKeyboardInput,
    dispatchMouseEvent,
    frame,
    isConnected,
    isStreaming,
    mode,
    readRemoteClipboardText,
    refreshTargets,
    reloadActiveTarget,
    setDesiredViewport,
    streamDetail,
    streamState,
    switchTarget,
    syncActiveTarget,
    targets,
    version,
    writeRemoteClipboardText,
  };
}
