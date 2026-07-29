import {
  CopyOutlined,
  DownOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import {
  App as AntdApp,
  Button,
  ConfigProvider,
  Input,
  Popover,
  Tabs,
  Typography,
  theme,
} from "antd";
import type { ComponentRef, RefObject, ReactNode } from "react";
import type { CdpViewerTarget } from "../api/cdpViewerClient";
import {
  formatTargetDetail,
  formatTargetTabLabel,
  isAboutBlankTarget,
} from "../model/target";
import styles from "./BrowserTargetTabs.module.css";

type BrowserTargetTabsProps = {
  activeTargetId: string | null;
  busyAction: "close" | "create" | "stream" | string | null;
  createDisabled: boolean;
  createTargetInputRef: RefObject<ComponentRef<typeof Input.Search> | null>;
  createTargetOpen: boolean;
  createTargetUrl: string;
  isConnected: boolean;
  mode: "browser" | "page" | null;
  onCloseTarget: (targetId: string) => void;
  onCreateTarget: () => void;
  onCreateTargetOpenChange: (open: boolean) => void;
  onCreateTargetUrlChange: (value: string) => void;
  onSwitchTarget: (targetId: string) => void;
  rightExtra?: ReactNode;
  targets: CdpViewerTarget[];
};

export function BrowserTargetTabs({
  activeTargetId,
  busyAction,
  createDisabled,
  createTargetInputRef,
  createTargetOpen,
  createTargetUrl,
  isConnected,
  mode,
  onCloseTarget,
  onCreateTarget,
  onCreateTargetOpenChange,
  onCreateTargetUrlChange,
  onSwitchTarget,
  rightExtra,
  targets,
}: BrowserTargetTabsProps) {
  const { message } = AntdApp.useApp();
  const { token } = theme.useToken();
  const canUseTargets = mode === "browser" && isConnected;
  const activeKey = mode === "page" ? "__page__" : activeTargetId ?? "__empty__";
  const targetItems = mode === "page"
    ? [
      {
        key: "__page__",
        label: "当前页面",
        closable: false,
        disabled: true,
        children: null,
      },
    ]
    : targets.length > 0
    ? targets.map((target) => ({
      key: target.targetId,
      label: (
        <Popover
          content={
            <TargetTabPreview
              onCopyTitle={() => copyTargetTitle(target)}
              onCopyUrl={() => copyTargetUrl(target)}
              target={target}
            />
          }
          mouseEnterDelay={0.4}
          placement="bottomLeft"
          trigger="hover"
        >
          <span className={styles.tabLabel}>
            {formatTargetTabLabel(target)}
          </span>
        </Popover>
      ),
      closable: canCloseTarget(target),
      children: null,
    }))
    : [
      {
        key: "__empty__",
        label: "没有可用页面",
        closable: false,
        disabled: true,
        children: null,
      },
    ];

  function canCloseTarget(target: CdpViewerTarget) {
    return canUseTargets && !(targets.length <= 1 && isAboutBlankTarget(target));
  }

  async function copyTargetUrl(target: CdpViewerTarget) {
    const url = formatTargetDetail(target);
    try {
      await navigator.clipboard.writeText(url);
      message.success("URL 已复制");
    } catch {
      message.error("URL 复制失败");
    }
  }

  async function copyTargetTitle(target: CdpViewerTarget) {
    const title = formatTargetTabLabel(target);
    try {
      await navigator.clipboard.writeText(title);
      message.success("标题已复制");
    } catch {
      message.error("标题复制失败");
    }
  }

  function handleEdit(
    eventOrKey: React.MouseEvent | React.KeyboardEvent | string,
    action: "add" | "remove",
  ) {
    if (action === "add") {
      onCreateTargetOpenChange(true);
      return;
    }
    if (typeof eventOrKey === "string") {
      onCloseTarget(eventOrKey);
    }
  }

  return (
    <div className={styles.bar}>
      <ConfigProvider
        theme={{
          components: {
            Tabs: {
              cardBg: token.colorBgContainer,
              cardGutter: 4,
              cardHeight: 32,
              cardHeightSM: 32,
              cardPadding: "5px 8px",
              cardPaddingSM: "5px 8px",
            },
          },
        }}
      >
        <Tabs
          activeKey={activeKey}
          className={styles.tabs}
          hideAdd
          items={targetItems}
          moreIcon={<DownOutlined />}
          classNames={{ popup: { root: styles.overflowPopup } }}
          size="small"
          tabBarExtraContent={{
            right: (
              <div className={styles.extra}>
                <Popover
                  content={
                    <div className={styles.createPanel}>
                      <Input.Search
                        ref={createTargetInputRef}
                        enterButton="打开"
                        loading={busyAction === "create"}
                        placeholder="输入 URL，留空打开 about:blank"
                        value={createTargetUrl}
                        onChange={(event) => onCreateTargetUrlChange(event.target.value)}
                        onSearch={onCreateTarget}
                      />
                    </div>
                  }
                  open={createTargetOpen}
                  placement="bottomRight"
                  trigger="hover"
                  onOpenChange={onCreateTargetOpenChange}
                >
                  <Button
                    aria-label="新建标签页"
                    className={styles.iconButton}
                    icon={<PlusOutlined />}
                    disabled={createDisabled}
                    loading={busyAction === "create"}
                    size="small"
                    type="text"
                  />
                </Popover>
                {rightExtra}
              </div>
            ),
          }}
          type="editable-card"
          onChange={(key) => {
            if (key !== "__empty__") {
              onSwitchTarget(key);
            }
          }}
          onEdit={handleEdit}
        />
      </ConfigProvider>
    </div>
  );
}

type TargetTabPreviewProps = {
  onCopyTitle: () => void;
  onCopyUrl: () => void;
  target: CdpViewerTarget;
};

function TargetTabPreview({
  onCopyTitle,
  onCopyUrl,
  target,
}: TargetTabPreviewProps) {
  const title = formatTargetTabLabel(target);
  const url = formatTargetDetail(target);

  return (
    <div className={styles.preview}>
      <div className={styles.previewRow}>
        <Typography.Text type="secondary" className={styles.previewLabel}>
          标题
        </Typography.Text>
        <Typography.Text className={styles.previewValue}>
          {title}
        </Typography.Text>
        <Button
          aria-label="复制标题"
          className={styles.copyButton}
          icon={<CopyOutlined />}
          size="small"
          type="text"
          onClick={(event) => {
            event.stopPropagation();
            onCopyTitle();
          }}
        />
      </div>
      <div className={styles.previewRow}>
        <Typography.Text type="secondary" className={styles.previewLabel}>
          URL
        </Typography.Text>
        <Typography.Text className={styles.previewValue}>
          {url}
        </Typography.Text>
        <Button
          aria-label="复制 URL"
          className={styles.copyButton}
          icon={<CopyOutlined />}
          size="small"
          type="text"
          onClick={(event) => {
            event.stopPropagation();
            onCopyUrl();
          }}
        />
      </div>
    </div>
  );
}
