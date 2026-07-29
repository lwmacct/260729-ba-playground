import {
  App as AntdApp,
  Form,
  Input,
} from "antd";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
} from "react";
import type { TextAreaRef } from "antd/es/input/TextArea";
import { useAutoFocusWhen } from "../../shared/hooks/useAutoFocusWhen";
import { useElementSize } from "../../shared/hooks/useElementSize";
import { showErrorNotification } from "../../shared/ui/notifications";
import { BrowserTargetTabs } from "./components/BrowserTargetTabs";
import { ViewerStage } from "./components/ViewerStage";
import {
  type ClipboardAction,
  ViewerToolbarActions,
} from "./components/ViewerToolbar";
import type { BrowserGatewayOptions } from "./api/proxy";
import {
  defaultCdpViewerSettings,
  normalizeDisplayScale,
} from "./model/settings";
import {
  useBrowserViewerSession,
} from "./hooks/useBrowserViewerSession";
import { useViewerSettingsForm } from "./hooks/useViewerSettingsForm";
import { useViewerStageInput } from "./hooks/useViewerStageInput";
import { isUsableViewportSize } from "./model/viewport";
import styles from "./BrowserViewerPage.module.css";

type BrowserViewerPageProps = {
  endpoint?: string;
  endpointEditable?: boolean;
  endpointKey?: string;
  browserGateway?: BrowserGatewayOptions;
  onEndpointChange?: (endpoint: string) => void;
  persistSettings?: boolean;
  variant?: "embedded" | "page";
};

function formatCompactTimestamp(value?: number) {
  if (!value) {
    return "--:--:--";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

export function BrowserViewerPage({
  endpoint,
  endpointEditable = true,
  endpointKey,
  browserGateway,
  onEndpointChange,
  persistSettings = true,
  variant = "page",
}: BrowserViewerPageProps) {
  const { message, notification } = AntdApp.useApp();
  const {
    autoApplyCanvasSize,
    displayScale,
    followActiveTarget,
    form,
    latestSettingsRef,
    persistViewerSettings,
    validateViewerSettings,
  } = useViewerSettingsForm({
    onAutoConnect: () => {
      void handleConnect().catch((error: unknown) => {
        showEndpointCheckError(error);
      });
    },
    onEndpointChange,
    persistSettings,
  });
  const selectionMode = followActiveTarget ? "follow-active" : "manual";
  const session = useBrowserViewerSession({
    browserGateway,
    selectionMode,
    settingsRef: latestSettingsRef,
  });
  const {
    activeTargetId,
    busyAction,
    connectionDetail,
    connectionState,
    frame,
    isConnected,
    isStreaming,
    mode,
    setDesiredViewport,
    streamDetail,
    streamState,
    targets,
    version,
  } = session;
  const [createTargetOpen, setCreateTargetOpen] = useState(false);
  const [createTargetUrl, setCreateTargetUrl] = useState("");
  const [clipboardBusyAction, setClipboardBusyAction] =
    useState<ClipboardAction | null>(null);
  const [clipboardOpen, setClipboardOpen] = useState(false);
  const [clipboardText, setClipboardText] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const pendingStageFocusTargetRef = useRef<string | null>(null);
  const clipboardBusyActionRef = useRef<ClipboardAction | null>(null);
  const clipboardTextAreaRef = useRef<TextAreaRef>(null);
  const createTargetInputRef = useRef<ComponentRef<typeof Input.Search>>(null);
  const controlledEndpoint = useMemo(() => {
    if (endpoint === undefined) {
      return "";
    }
    return endpoint.trim();
  }, [endpoint]);
  const controlledEndpointKey = endpointKey ?? controlledEndpoint;
  const lastConnectedEndpointKeyRef = useRef("");

  const {
    element: stageElement,
    ref: bindStageElement,
    size: canvasSize,
  } = useElementSize<HTMLDivElement>();
  const [surfaceElement, setSurfaceElement] = useState<HTMLImageElement | null>(null);
  const safeDisplayScale = normalizeDisplayScale(displayScale);
  const remoteCanvasSize = useMemo(
    () => ({
      height: Math.floor(canvasSize.height / safeDisplayScale),
      width: Math.floor(canvasSize.width / safeDisplayScale),
    }),
    [canvasSize.height, canvasSize.width, safeDisplayScale],
  );

  useAutoFocusWhen(createTargetOpen, createTargetInputRef);

  function showActionError(error: unknown, fallback: string) {
    message.error(error instanceof Error ? error.message : fallback);
  }

  function showEndpointCheckError(error: unknown) {
    const description =
      error instanceof Error ? error.message : "CDP endpoint 检查失败。";
    showErrorNotification({ message, notification }, {
      key: "browser-endpoint-check-error",
      message: "CDP endpoint 检查失败",
      description,
      copyText: description,
    });
  }

  function getCanvasSizeForRemote() {
    const width = remoteCanvasSize.width;
    const height = remoteCanvasSize.height;
    if (width < 320 || height < 240) {
      throw new Error("画板尺寸太小，无法应用到远程浏览器。");
    }
    return { height, width };
  }

  async function handleConnect() {
    const formValues = await validateViewerSettings({
      requireEndpoint: endpoint === undefined,
    });
    const values = {
      ...formValues,
      endpoint: endpoint === undefined ? formValues.endpoint : controlledEndpoint,
    };
    if (!values.endpoint) {
      throw new Error("CDP endpoint 不能为空。");
    }
    persistViewerSettings(values);
    await session.connect(values);
  }

  async function handleDisconnect() {
    await session.disconnect();
  }

  async function handleApplyCanvasSize() {
    const nextCanvasSize = getCanvasSizeForRemote();
    const values = getEffectiveViewerSettings(await validateViewerSettings());
    const nextValues = {
      ...values,
      maxHeight: nextCanvasSize.height,
      maxWidth: nextCanvasSize.width,
    };
    form.setFieldsValue(nextValues);
    persistViewerSettings(nextValues);

    await session.applyCanvasSize(nextCanvasSize, nextValues);
  }

  const stageInputHandlers = useViewerStageInput({
    frame,
    inputEnabled: isStreaming,
    onCommand: (command) => {
      if (command === "reload") {
        handleReloadActiveTargetClick();
      }
    },
    onKeyboardInput: (payload) => {
      void session.dispatchKeyboardInput(payload).catch((error: unknown) => {
        showActionError(error, "键盘事件发送失败。");
      });
    },
    onMouseEvent: (payload) => {
      void session.dispatchMouseEvent(payload).catch((error: unknown) => {
        showActionError(error, "鼠标事件发送失败。");
      });
    },
    stageElement,
    surfaceElement,
  });

  useEffect(() => {
    setDesiredViewport({
      ...remoteCanvasSize,
      enabled: autoApplyCanvasSize,
    });
  }, [
    autoApplyCanvasSize,
    remoteCanvasSize.height,
    remoteCanvasSize.width,
    setDesiredViewport,
  ]);

  useEffect(() => {
    const pendingTargetId = pendingStageFocusTargetRef.current;
    if (
      !pendingTargetId ||
      pendingTargetId !== activeTargetId ||
      streamState !== "streaming"
    ) {
      return;
    }

    pendingStageFocusTargetRef.current = null;
    stageElement?.focus({ preventScroll: true });
  }, [activeTargetId, stageElement, streamState]);

  async function handleSwitchTarget(targetId: string) {
    pendingStageFocusTargetRef.current = targetId;
    const values = getEffectiveViewerSettings(await validateViewerSettings());
    persistViewerSettings(values);
    try {
      await session.switchTarget(targetId, values);
    } catch (error) {
      if (pendingStageFocusTargetRef.current === targetId) {
        pendingStageFocusTargetRef.current = null;
      }
      throw error;
    }
  }

  async function handleCloseTarget(targetId: string) {
    const values = getEffectiveViewerSettings(await validateViewerSettings());
    persistViewerSettings(values);
    await session.closeTarget(targetId, values);
  }

  async function handleReloadActiveTarget() {
    const values = getEffectiveViewerSettings(await validateViewerSettings());
    persistViewerSettings(values);
    await session.reloadActiveTarget(values);
  }

  async function handleCreateTarget() {
    const values = getEffectiveViewerSettings(await validateViewerSettings());
    persistViewerSettings(values);
    await session.createTarget(createTargetUrl, values);
    setCreateTargetUrl("");
    setCreateTargetOpen(false);
  }

  const activeTarget = targets.find((item) => item.targetId === activeTargetId);
  const createDisabled = !isConnected || mode !== "browser";
  const canApplyCanvasSize =
    isConnected &&
    (mode !== "browser" || Boolean(activeTargetId)) &&
    isUsableViewportSize(remoteCanvasSize);
  const viewerInfoItems = [
    `状态 ${connectionState}`,
    `画面 ${streamState}`,
    mode ? `模式 ${mode}` : null,
    `画板 ${canvasSize.width || "-"} x ${canvasSize.height || "-"}`,
    `缩放 ${displayScale.toFixed(2)}x`,
    `帧 ${frame ? `${frame.width} x ${frame.height}` : "- x -"}`,
    `时间 ${formatCompactTimestamp(frame?.receivedAt)}`,
    version || null,
    connectionDetail || null,
    streamDetail || null,
  ].filter((item): item is string => Boolean(item));

  function getEffectiveViewerSettings(values = latestSettingsRef.current) {
    return {
      ...values,
      endpoint: endpoint === undefined ? values.endpoint : controlledEndpoint,
    };
  }

  useEffect(() => {
    if (endpoint === undefined) {
      return;
    }
    const nextValues = {
      ...defaultCdpViewerSettings,
      ...form.getFieldsValue(true),
      endpoint: controlledEndpoint,
    };
    latestSettingsRef.current = nextValues;
    form.setFieldsValue(nextValues);
  }, [controlledEndpoint, endpoint, form, latestSettingsRef]);

  useEffect(() => {
    if (endpoint === undefined || !controlledEndpoint) {
      if (endpoint !== undefined) {
        lastConnectedEndpointKeyRef.current = "";
        void session.disconnect().catch((error: unknown) => {
          showActionError(error, "CDP 断开失败。");
        });
      }
      return;
    }
    if (lastConnectedEndpointKeyRef.current === controlledEndpointKey) {
      return;
    }
    lastConnectedEndpointKeyRef.current = controlledEndpointKey;
    const scheduledEndpointKey = controlledEndpointKey;
    window.setTimeout(() => {
      if (lastConnectedEndpointKeyRef.current !== scheduledEndpointKey) {
        return;
      }
      void handleConnect().catch((error: unknown) => {
        showEndpointCheckError(error);
      });
    }, 0);
  }, [controlledEndpoint, controlledEndpointKey, endpoint]);

  function handleApplyCanvasSizeClick() {
    void handleApplyCanvasSize().catch((error: unknown) => {
      showActionError(error, "应用画板大小失败。");
    });
  }

  function handleConnectClick() {
    void handleConnect().catch((error: unknown) => {
      showEndpointCheckError(error);
    });
  }

  function handleDisconnectClick() {
    void handleDisconnect().catch((error: unknown) => {
      showActionError(error, "CDP 断开失败。");
    });
  }

  function handleCloseTargetClick(targetId: string) {
    void handleCloseTarget(targetId).catch((error: unknown) => {
      showActionError(error, "关闭标签页失败。");
    });
  }

  function handleReloadActiveTargetClick() {
    void handleReloadActiveTarget().catch((error: unknown) => {
      showActionError(error, "刷新页面失败。");
    });
  }

  function handleClipboardAction(
    busyAction: ClipboardAction,
    action: () => Promise<void>,
    fallback: string,
    success?: string,
  ) {
    if (clipboardBusyActionRef.current) {
      return;
    }
    clipboardBusyActionRef.current = busyAction;
    setClipboardBusyAction(busyAction);
    void action()
      .then(() => {
        if (success) {
          message.success(success);
        }
      })
      .catch((error: unknown) => {
        showActionError(error, fallback);
      })
      .finally(() => {
        clipboardBusyActionRef.current = null;
        setClipboardBusyAction(null);
      });
  }

  function handleReadRemoteClipboard() {
    handleClipboardAction("readRemote", async () => {
      const text = await session.readRemoteClipboardText();
      setClipboardText(text);
      window.setTimeout(() => {
        clipboardTextAreaRef.current?.focus();
      }, 0);
    }, "读取远端剪贴板失败。");
  }

  function handleWriteRemoteClipboard() {
    handleClipboardAction("writeRemote", async () => {
      await session.writeRemoteClipboardText(clipboardText);
    }, "写入远端剪贴板失败。", "已写入远端剪贴板");
  }

  function handlePasteLocalClipboard() {
    handleClipboardAction("pasteLocal", async () => {
      if (!navigator.clipboard?.readText) {
        throw new Error("当前浏览器不支持读取本机剪贴板。");
      }
      const text = await navigator.clipboard.readText();
      setClipboardText(text);
      window.setTimeout(() => {
        clipboardTextAreaRef.current?.focus();
      }, 0);
    }, "读取本机剪贴板失败。");
  }

  function handleCopyClipboardToLocal() {
    handleClipboardAction("copyLocal", async () => {
      if (!navigator.clipboard?.writeText) {
        throw new Error("当前浏览器不支持写入本机剪贴板。");
      }
      await navigator.clipboard.writeText(clipboardText);
    }, "写入本机剪贴板失败。", "已复制到本机剪贴板");
  }

  function handleCreateTargetSearch() {
    void handleCreateTarget().catch((error: unknown) => {
      showActionError(error, "新建标签页失败。");
    });
  }

  function handleSwitchTargetClick(targetId: string) {
    void handleSwitchTarget(targetId).catch((error: unknown) => {
      showActionError(error, "切换页面失败。");
    });
  }

  return (
    <div
      className={variant === "embedded" ? styles.pane : styles.page}
      data-embedded={variant === "embedded" || undefined}
      data-browser-viewer-page={variant === "page" || undefined}
    >
      <Form
        component={false}
        form={form}
        initialValues={defaultCdpViewerSettings}
        onValuesChange={(_, allValues) =>
          persistViewerSettings({
            ...defaultCdpViewerSettings,
            ...allValues,
          })
        }
      >
      <div className={styles.workspace}>
        <BrowserTargetTabs
          activeTargetId={activeTargetId}
          busyAction={busyAction}
          createDisabled={createDisabled}
          createTargetInputRef={createTargetInputRef}
          createTargetOpen={createTargetOpen}
          createTargetUrl={createTargetUrl}
          isConnected={isConnected}
          mode={mode}
          onCloseTarget={handleCloseTargetClick}
          onCreateTarget={handleCreateTargetSearch}
          onCreateTargetOpenChange={setCreateTargetOpen}
          onCreateTargetUrlChange={setCreateTargetUrl}
          onSwitchTarget={handleSwitchTargetClick}
          rightExtra={
            <ViewerToolbarActions
              busyAction={busyAction}
              canApplyCanvasSize={canApplyCanvasSize}
              clipboardBusyAction={clipboardBusyAction}
              clipboardOpen={clipboardOpen}
              clipboardText={clipboardText}
              connectionState={connectionState}
              endpointEditable={endpointEditable && endpoint === undefined}
              isConnected={isConnected}
              mode={mode}
              onApplyCanvasSize={handleApplyCanvasSizeClick}
              onClipboardOpenChange={setClipboardOpen}
              onClipboardTextChange={setClipboardText}
              onConnect={handleConnectClick}
              onCopyClipboardToLocal={handleCopyClipboardToLocal}
              onDisconnect={handleDisconnectClick}
              onPasteLocalClipboard={handlePasteLocalClipboard}
              onReadRemoteClipboard={handleReadRemoteClipboard}
              onReloadActiveTarget={handleReloadActiveTargetClick}
              onSettingsOpenChange={setSettingsOpen}
              onWriteRemoteClipboard={handleWriteRemoteClipboard}
              reloadDisabled={!isConnected || (mode === "browser" && !activeTargetId)}
              settingsOpen={settingsOpen}
              textareaRef={clipboardTextAreaRef}
              viewerInfoItems={viewerInfoItems}
            />
          }
          targets={targets}
        />
        <div className={styles.tabPane}>
          <ViewerStage
            bindStageElement={bindStageElement}
            bindSurfaceElement={setSurfaceElement}
            displayScale={displayScale}
            frame={frame}
            inputEnabled={isStreaming}
            inputHandlers={stageInputHandlers}
          />
        </div>
      </div>
      </Form>
    </div>
  );
}
