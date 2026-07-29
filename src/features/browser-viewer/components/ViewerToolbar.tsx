import {
  CopyOutlined,
  DisconnectOutlined,
  InfoCircleOutlined,
  LinkOutlined,
  ReloadOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import {
  Button,
  Form,
  Input,
  InputNumber,
  Popover,
  Slider,
  Switch,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import type { TextAreaRef } from "antd/es/input/TextArea";
import type { RefObject } from "react";
import type { CdpViewerConnectionState } from "../api/cdpViewerClient";
import { displayScaleConfig } from "../model/settings";
import styles from "./ViewerToolbar.module.css";
import layoutStyles from "../../../shared/ui/layout.module.css";

type BusyAction =
  | "close"
  | "connect"
  | "create"
  | "disconnect"
  | "reload"
  | "refresh"
  | "resize"
  | "stream";
export type ClipboardAction =
  | "copyLocal"
  | "pasteLocal"
  | "readRemote"
  | "writeRemote";

type ViewerToolbarActionsProps = {
  busyAction: BusyAction | null;
  canApplyCanvasSize: boolean;
  clipboardBusyAction: ClipboardAction | null;
  clipboardOpen: boolean;
  clipboardText: string;
  connectionState: CdpViewerConnectionState;
  endpointEditable: boolean;
  isConnected: boolean;
  mode: "browser" | "page" | null;
  onApplyCanvasSize: () => void;
  onClipboardOpenChange: (open: boolean) => void;
  onClipboardTextChange: (value: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onCopyClipboardToLocal: () => void;
  onPasteLocalClipboard: () => void;
  onReadRemoteClipboard: () => void;
  onReloadActiveTarget: () => void;
  onSettingsOpenChange: (open: boolean) => void;
  onWriteRemoteClipboard: () => void;
  reloadDisabled: boolean;
  settingsOpen: boolean;
  textareaRef: RefObject<TextAreaRef | null>;
  viewerInfoItems: string[];
};

export function ViewerToolbarActions({
  busyAction,
  canApplyCanvasSize,
  clipboardBusyAction,
  clipboardOpen,
  clipboardText,
  connectionState,
  endpointEditable,
  isConnected,
  mode,
  onApplyCanvasSize,
  onClipboardOpenChange,
  onClipboardTextChange,
  onConnect,
  onDisconnect,
  onCopyClipboardToLocal,
  onPasteLocalClipboard,
  onReadRemoteClipboard,
  onReloadActiveTarget,
  onSettingsOpenChange,
  onWriteRemoteClipboard,
  reloadDisabled,
  settingsOpen,
  textareaRef,
  viewerInfoItems,
}: ViewerToolbarActionsProps) {
  const iconButtonClassName = `${styles.button} ${styles.iconButton}`;

  return (
    <div className={styles.actions}>
      <Tooltip title="刷新当前页面">
        <Button
          aria-label="刷新当前页面"
          className={iconButtonClassName}
          icon={<ReloadOutlined />}
          type="text"
          disabled={reloadDisabled}
          loading={busyAction === "reload"}
          onClick={onReloadActiveTarget}
        />
      </Tooltip>
      <Popover
        content={
          <ClipboardPanel
            busyAction={clipboardBusyAction}
            disabled={!isConnected}
            text={clipboardText}
            textareaRef={textareaRef}
            onCopyToLocal={onCopyClipboardToLocal}
            onPasteFromLocal={onPasteLocalClipboard}
            onReadRemote={onReadRemoteClipboard}
            onTextChange={onClipboardTextChange}
            onWriteRemote={onWriteRemoteClipboard}
          />
        }
        open={clipboardOpen}
        placement="bottomRight"
        trigger="hover"
        onOpenChange={onClipboardOpenChange}
      >
        <Button
          aria-label="远端剪贴板"
          className={iconButtonClassName}
          icon={<CopyOutlined />}
          type="text"
        />
      </Popover>
      <Popover
        content={
          <ViewerSettingsPanel
            busyAction={busyAction}
            canApplyCanvasSize={canApplyCanvasSize}
            connectionState={connectionState}
            endpointEditable={endpointEditable}
            isConnected={isConnected}
            mode={mode}
            onApplyCanvasSize={onApplyCanvasSize}
            onConnect={onConnect}
            onDisconnect={onDisconnect}
          />
        }
        open={settingsOpen}
        placement="bottomRight"
        trigger="hover"
        onOpenChange={onSettingsOpenChange}
      >
        <Button
          aria-label="画面设置"
          className={iconButtonClassName}
          icon={<SettingOutlined />}
          type="text"
        />
      </Popover>
      <Tooltip
        title={
          <div className={styles.infoTooltip}>
            {viewerInfoItems.map((item) => (
              <div key={item}>{item}</div>
            ))}
          </div>
        }
      >
        <Button
          aria-label="当前画面信息"
          className={iconButtonClassName}
          icon={<InfoCircleOutlined />}
          type="text"
        />
      </Tooltip>
    </div>
  );
}

type ClipboardPanelProps = {
  busyAction: ClipboardAction | null;
  disabled: boolean;
  onCopyToLocal: () => void;
  onPasteFromLocal: () => void;
  onReadRemote: () => void;
  onTextChange: (value: string) => void;
  onWriteRemote: () => void;
  text: string;
  textareaRef: RefObject<TextAreaRef | null>;
};

function ClipboardPanel({
  busyAction,
  disabled,
  onCopyToLocal,
  onPasteFromLocal,
  onReadRemote,
  onTextChange,
  onWriteRemote,
  text,
  textareaRef,
}: ClipboardPanelProps) {
  return (
    <div className={styles.clipboardPanel}>
      <Input.TextArea
        ref={textareaRef}
        autoSize={{ minRows: 5, maxRows: 10 }}
        value={text}
        onChange={(event) => onTextChange(event.target.value)}
        placeholder="远端剪贴板文本"
      />
      <div className={styles.clipboardActions}>
        <Button
          disabled={disabled}
          loading={busyAction === "readRemote"}
          onClick={onReadRemote}
        >
          读取远端
        </Button>
        <Button
          disabled={disabled}
          loading={busyAction === "writeRemote"}
          type="primary"
          onClick={onWriteRemote}
        >
          写入远端
        </Button>
        <Button
          loading={busyAction === "pasteLocal"}
          onClick={onPasteFromLocal}
        >
          从本机粘贴
        </Button>
        <Button
          disabled={!text}
          loading={busyAction === "copyLocal"}
          onClick={onCopyToLocal}
        >
          复制到本机
        </Button>
      </div>
    </div>
  );
}

type ViewerSettingsPanelProps = {
  busyAction: BusyAction | null;
  canApplyCanvasSize: boolean;
  connectionState: CdpViewerConnectionState;
  endpointEditable: boolean;
  isConnected: boolean;
  mode: "browser" | "page" | null;
  onApplyCanvasSize: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
};

function ViewerSettingsPanel({
  busyAction,
  canApplyCanvasSize,
  connectionState,
  endpointEditable,
  isConnected,
  mode,
  onApplyCanvasSize,
  onConnect,
  onDisconnect,
}: ViewerSettingsPanelProps) {
  return (
    <div className={styles.popoverPanel}>
      <div className={styles.popoverForm}>
        <div className={styles.settingsSection}>
          <div className={styles.settingsSectionTitle}>
            <Typography.Text strong>连接</Typography.Text>
            <Tag color={isConnected ? "success" : "default"}>{connectionState}</Tag>
          </div>
          <Form.Item
            label="CDP endpoint"
            name="endpoint"
            rules={[{ required: true, message: "请输入 CDP endpoint" }]}
          >
            <Input
              disabled={!endpointEditable}
              placeholder="ws://127.0.0.1:9222/devtools/browser/..."
            />
          </Form.Item>
          <div className={styles.popoverActions}>
            <Button
              type="primary"
              icon={<LinkOutlined />}
              loading={busyAction === "connect"}
              onClick={onConnect}
            >
              连接
            </Button>
            <Button
              icon={<DisconnectOutlined />}
              disabled={!isConnected && connectionState !== "connecting"}
              loading={busyAction === "disconnect"}
              onClick={onDisconnect}
            >
              断开
            </Button>
          </div>
        </div>
        <div className={styles.settingsSection}>
          <div className={styles.settingsSectionTitle}>
            <Typography.Text strong>画面</Typography.Text>
          </div>
          <div className={styles.controlsGrid}>
            <Form.Item
              label="质量"
              name="quality"
              rules={[{ required: true, message: "请输入质量" }]}
            >
              <InputNumber min={1} max={100} className={layoutStyles.fullWidth} />
            </Form.Item>
            <Form.Item
              label="帧间隔"
              name="everyNthFrame"
              rules={[{ required: true, message: "请输入帧间隔" }]}
            >
              <InputNumber min={1} max={10} className={layoutStyles.fullWidth} />
            </Form.Item>
          </div>
          <Form.Item
            label="显示缩放"
            name="displayScale"
            rules={[{ required: true, message: "请输入显示缩放" }]}
          >
            <DisplayScaleControl />
          </Form.Item>
          <Form.Item hidden name="maxWidth">
            <InputNumber min={320} max={4096} />
          </Form.Item>
          <Form.Item hidden name="maxHeight">
            <InputNumber min={240} max={4096} />
          </Form.Item>
          <div className={styles.controlsRow}>
            <Typography.Text type="secondary">跟随激活标签页</Typography.Text>
            <Form.Item name="followActiveTarget" valuePropName="checked" noStyle>
              <Switch
                checkedChildren="开"
                unCheckedChildren="关"
                disabled={mode === "page"}
              />
            </Form.Item>
          </div>
          <div className={styles.controlsRow}>
            <Typography.Text type="secondary">自动应用画板大小</Typography.Text>
            <Form.Item name="autoApplyCanvasSize" valuePropName="checked" noStyle>
              <Switch checkedChildren="开" unCheckedChildren="关" />
            </Form.Item>
          </div>
          <Button
            block
            disabled={!canApplyCanvasSize}
            loading={busyAction === "resize"}
            onClick={onApplyCanvasSize}
          >
            应用画板大小
          </Button>
        </div>
      </div>
    </div>
  );
}

type DisplayScaleControlProps = {
  value?: number;
  onChange?: (value: number) => void;
};

function DisplayScaleControl({
  value = displayScaleConfig.defaultValue,
  onChange,
}: DisplayScaleControlProps) {
  function handleChange(nextValue: number | null) {
    if (typeof nextValue !== "number" || !Number.isFinite(nextValue)) {
      return;
    }
    onChange?.(nextValue);
  }

  return (
    <div className={styles.scaleControl}>
      <Slider
        min={displayScaleConfig.min}
        max={displayScaleConfig.max}
        step={displayScaleConfig.step}
        marks={Object.fromEntries(
          displayScaleConfig.marks.map((mark) => [mark.value, mark.label]),
        )}
        value={value}
        onChange={handleChange}
      />
      <InputNumber
        min={displayScaleConfig.min}
        max={displayScaleConfig.max}
        step={displayScaleConfig.step}
        precision={displayScaleConfig.precision}
        addonAfter="x"
        value={value}
        onChange={handleChange}
      />
    </div>
  );
}
