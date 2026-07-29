import {
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  EllipsisOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  StopOutlined,
} from "@ant-design/icons";
import {
  Alert,
  App as AntdApp,
  Button,
  Dropdown,
  Drawer,
  Form,
  Input,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import { WorkbenchPage } from "@lwmacct/260627-antd-workbench";
import type { TableColumnsType } from "antd";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Key } from "react";
import { ResizableWorkspace } from "../../shared/ui/ResizableWorkspace";
import { BrowserViewerPage } from "../browser-viewer";
import {
  createAdsPowerProfile,
  deleteAdsPowerProfiles,
  startAdsPowerBrowser,
  stopAdsPowerBrowser,
  updateAdsPowerProfile,
} from "./api/client";
import { rebuildAdsPowerProfilesByName } from "./api/rebuild";
import { readAdsPowerSettings } from "./model/config";
import type { AdsPowerSettings } from "./model/config";
import {
  useAdsPowerGroupsQuery,
  useAdsPowerBrowserActiveQuery,
  useAdsPowerProfilesQuery,
} from "./api/queries";
import type {
  AdsPowerProfileInput,
  AdsPowerProfileRecord,
} from "./model/types";
import styles from "./AdsPowerPage.module.css";

type ProfileFormValues = {
  category_id?: string;
  cookie?: string;
  extra_json?: string;
  fingerprint_config_json?: string;
  group_id: string;
  name?: string;
  password?: string;
  platform?: string;
  proxyid?: string;
  remark?: string;
  tabs_text?: string;
  user_proxy_config_json?: string;
  username?: string;
};

type SelectedBrowserViewer = {
  endpoint: string;
  endpointKey: string;
  lastOpenTime?: string;
  profileId: string;
  profileName: string;
  profileNo?: string;
};

const PROFILE_LIST_LIMIT = 2000;
const TABLE_HEADER_HEIGHT = 56;
const MIN_TABLE_BODY_HEIGHT = 240;
const defaultFingerprintConfig = {
  automatic_timezone: "1",
  browser_kernel_config: {
    type: "chrome",
    version: "ua_auto",
  },
  flash: "block",
  language: ["en-US", "en"],
  random_ua: {
    ua_browser: ["chrome"],
    ua_system_version: ["Windows 10"],
  },
  webrtc: "disabled",
};

function normalizeEndpoint(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isPresentString(value: string | undefined): value is string {
  return Boolean(value);
}

export function AdsPowerPage() {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<ProfileFormValues>();
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const [settings, setSettings] = useState<AdsPowerSettings>(readAdsPowerSettings);
  const [editing, setEditing] = useState<AdsPowerProfileRecord | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [quickCreating, setQuickCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rebuildingProfileNames, setRebuildingProfileNames] = useState<string[]>([]);
  const [deletingId, setDeletingId] = useState("");
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [batchStarting, setBatchStarting] = useState(false);
  const [batchStopping, setBatchStopping] = useState(false);
  const [startingId, setStartingId] = useState("");
  const [stoppingId, setStoppingId] = useState("");
  const [tableBodyHeight, setTableBodyHeight] = useState(MIN_TABLE_BODY_HEIGHT);
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
  const [selectedViewer, setSelectedViewer] = useState<SelectedBrowserViewer | null>(null);

  const enabled = Boolean(settings.browserGatewayUrl && settings.apiUrl);
  const groupsQuery = useAdsPowerGroupsQuery(settings, enabled);
  const profilesQuery = useAdsPowerProfilesQuery(
    settings,
    {
      limit: PROFILE_LIST_LIMIT,
      page: 1,
      sort_order: "desc",
      sort_type: "profile_no",
    },
    enabled,
  );
  const groups = groupsQuery.data?.list ?? [];
  const rows = profilesQuery.data?.list ?? [];
  const selectedProfileIds = selectedRowKeys.map(String);
  const selectedProfiles = rows.filter((row) =>
    selectedProfileIds.includes(row.profile_id),
  );
  const selectedRebuildNames = Array.from(
    new Set(selectedProfiles.map((profile) => profile.name?.trim()).filter(isPresentString)),
  );
  const groupOptions = useMemo(
    () => [
      { label: "未分配分组 (0)", value: "0" },
      ...groups.map((group) => ({
        label: `${group.group_name} (${group.group_id})`,
        value: group.group_id,
      })),
    ],
    [groups],
  );

  useEffect(() => {
    setSettings(readAdsPowerSettings());
    void groupsQuery.refetch();
    void profilesQuery.refetch();
    void queryClient.invalidateQueries({ queryKey: ["adspower-browser-active"] });
  }, []);

  useEffect(() => {
    if (!selectedViewer) {
      return;
    }

    const currentRecord = rows.find(
      (record) => record.profile_id === selectedViewer.profileId,
    );
    if (!currentRecord) {
      return;
    }
    if (currentRecord.last_open_time !== selectedViewer.lastOpenTime) {
      setSelectedViewer(null);
    }
  }, [rows, selectedViewer]);

  useEffect(() => {
    const scrollNode = tableScrollRef.current;
    if (!scrollNode) {
      return;
    }
    const measuredNode: HTMLDivElement = scrollNode;

    function updateTableBodyHeight() {
      setTableBodyHeight(
        Math.max(
          MIN_TABLE_BODY_HEIGHT,
          measuredNode.clientHeight - TABLE_HEADER_HEIGHT,
        ),
      );
    }

    updateTableBodyHeight();
    const observer = new ResizeObserver(updateTableBodyHeight);
    observer.observe(measuredNode);

    return () => {
      observer.disconnect();
    };
  }, []);

  const columns: TableColumnsType<AdsPowerProfileRecord> = [
    {
      title: "编号",
      dataIndex: "profile_no",
      fixed: "left",
      width: 96,
      render: (value?: string) => value || "-",
    },
    {
      title: "环境 ID",
      dataIndex: "profile_id",
      render: (value: string) => (
        <Typography.Text code copyable>
          {value}
        </Typography.Text>
      ),
    },
    {
      title: "状态",
      render: (_, record) => (
        <BrowserStatusCell
          enabled={enabled}
          onEndpointChange={syncSelectedViewerEndpoint}
          onView={selectViewerEndpoint}
          profileId={record.profile_id}
          lastOpenTime={record.last_open_time}
          profileName={record.name || record.profile_id}
          profileNo={record.profile_no}
          settings={settings}
        />
      ),
    },
    {
      title: "代理",
      render: (_, record) => {
        const proxySoft = record.user_proxy_config?.proxy_soft;
        return <Tag>{typeof proxySoft === "string" ? proxySoft : "unknown"}</Tag>;
      },
    },
    {
      title: "名称",
      dataIndex: "name",
      render: (value?: string) => value || "-",
    },
    {
      title: "平台",
      dataIndex: "platform",
      render: (value?: string) => value || "-",
    },
    {
      title: "账号",
      dataIndex: "username",
      render: (value?: string) => value || "-",
    },
    {
      title: "分组",
      render: (_, record) => record.group_name || record.group_id || "-",
    },
    {
      title: "备注",
      dataIndex: "remark",
      render: (value?: string) => value || "-",
    },
    {
      title: "操作",
      key: "actions",
      align: "center",
      fixed: "right",
      width: 72,
      render: (_, record) => (
        <ProfileActions
          deleting={deletingId === record.profile_id}
          enabled={enabled}
          profile={record}
          rebuilding={Boolean(
            record.name && rebuildingProfileNames.includes(record.name),
          )}
          settings={settings}
          starting={startingId === record.profile_id}
          stopping={stoppingId === record.profile_id}
          onDelete={handleDelete}
          onEdit={openEditor}
          onRebuild={handleRebuildProfilesByName}
          onStart={handleStart}
          onStop={handleStop}
        />
      ),
    },
  ];

  function refreshSettingsAndData() {
    setSettings(readAdsPowerSettings());
    void groupsQuery.refetch();
    void profilesQuery.refetch();
    void queryClient.invalidateQueries({ queryKey: ["adspower-browser-active"] });
  }

  function selectViewerEndpoint(
    record: Pick<AdsPowerProfileRecord, "last_open_time" | "name" | "profile_id" | "profile_no">,
    endpoint: unknown,
  ) {
    const trimmedEndpoint = normalizeEndpoint(endpoint);
    if (!trimmedEndpoint) {
      return;
    }
    setSelectedViewer({
      endpoint: trimmedEndpoint,
      endpointKey: `${record.profile_id}:${record.last_open_time ?? ""}:${trimmedEndpoint}`,
      lastOpenTime: record.last_open_time,
      profileId: record.profile_id,
      profileName: record.name || record.profile_id,
      profileNo: record.profile_no,
    });
  }

  const syncSelectedViewerEndpoint = useCallback(function syncSelectedViewerEndpoint(
    record: Pick<AdsPowerProfileRecord, "last_open_time" | "name" | "profile_id" | "profile_no">,
    endpoint: unknown,
  ) {
    const trimmedEndpoint = normalizeEndpoint(endpoint);
    if (!trimmedEndpoint) {
      return;
    }

    setSelectedViewer((current) => {
      if (!current || current.profileId !== record.profile_id) {
        return current;
      }
      const endpointKey = `${record.profile_id}:${record.last_open_time ?? ""}:${trimmedEndpoint}`;
      if (current.endpointKey === endpointKey) {
        return current;
      }
      return {
        endpoint: trimmedEndpoint,
        endpointKey,
        lastOpenTime: record.last_open_time,
        profileId: record.profile_id,
        profileName: record.name || record.profile_id,
        profileNo: record.profile_no,
      };
    });
  }, []);

  function openCreate() {
    setEditing(null);
    form.setFieldsValue({
      extra_json: "{}",
      fingerprint_config_json: JSON.stringify(defaultFingerprintConfig, null, 2),
      group_id: "0",
      name: "",
      password: "",
      platform: "",
      proxyid: "",
      remark: "",
      tabs_text: "",
      user_proxy_config_json: JSON.stringify({ proxy_soft: "no_proxy" }, null, 2),
      username: "",
    });
    setDrawerOpen(true);
  }

  function openEditor(record: AdsPowerProfileRecord) {
    setEditing(record);
    form.setFieldsValue({
      extra_json: "{}",
      fingerprint_config_json: "",
      group_id: record.group_id || "0",
      name: record.name ?? "",
      password: "",
      platform: record.platform ?? "",
      proxyid: record.fbcc_proxy_acc_id ?? "",
      remark: record.remark ?? "",
      tabs_text: "",
      user_proxy_config_json: JSON.stringify(
        record.user_proxy_config ?? { proxy_soft: "no_proxy" },
        null,
        2,
      ),
      username: record.username ?? "",
    });
    setDrawerOpen(true);
  }

  async function submit(values: ProfileFormValues) {
    setSaving(true);
    try {
      const input = buildProfileInput(values, Boolean(editing));
      if (editing) {
        await updateAdsPowerProfile(settings, {
          ...input,
          profile_id: editing.profile_id,
        });
        message.success("浏览器环境已更新。");
      } else {
        await createAdsPowerProfile(settings, input);
        message.success("浏览器环境已创建。");
      }
      setDrawerOpen(false);
      void profilesQuery.refetch();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "保存失败。");
    } finally {
      setSaving(false);
    }
  }

  async function quickCreate() {
    setQuickCreating(true);
    try {
      await createAdsPowerProfile(settings, {
        fingerprint_config: defaultFingerprintConfig,
        group_id: "0",
        name: `quick-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-")}`,
        user_proxy_config: { proxy_soft: "no_proxy" },
      });
      message.success("已快速创建浏览器环境。");
      void queryClient.invalidateQueries({ queryKey: ["adspower-profiles"] });
    } catch (error) {
      message.error(error instanceof Error ? error.message : "快速创建失败。");
    } finally {
      setQuickCreating(false);
    }
  }

  async function handleRebuildProfilesByName(names: string[]) {
    const rebuildNames = Array.from(
      new Set(names.map((name) => name.trim()).filter(Boolean)),
    );
    if (rebuildNames.length === 0) {
      message.error("请选择有名称的浏览器环境。");
      return;
    }

    setRebuildingProfileNames(rebuildNames);
    try {
      const latestProfiles = await profilesQuery.refetch();
      const latestRows = latestProfiles.data?.list ?? rows;
      const results = await rebuildAdsPowerProfilesByName(
        settings,
        latestRows,
        rebuildNames,
        { headless: true },
      );
      const connectableResult = results.find((result) => result.endpoint);
      if (connectableResult) {
        selectViewerEndpoint(
          {
            name: connectableResult.name,
            profile_id: connectableResult.profileId,
            profile_no: connectableResult.profileNo,
          },
          connectableResult.endpoint,
        );
      }

      setSelectedRowKeys([]);
      void queryClient.invalidateQueries({ queryKey: ["adspower-profiles"] });
      void queryClient.invalidateQueries({ queryKey: ["adspower-browser-active"] });
    } catch (error) {
      message.error(error instanceof Error ? error.message : "重建浏览器失败。");
    } finally {
      setRebuildingProfileNames([]);
    }
  }

  async function handleStart(record: AdsPowerProfileRecord, headless: boolean) {
    setStartingId(record.profile_id);
    try {
      const result = await startAdsPowerBrowser(settings, record.profile_id, {
        headless,
      });
      const cdpEndpoint = normalizeEndpoint(result.ws?.puppeteer);
      if (cdpEndpoint) {
        selectViewerEndpoint(record, cdpEndpoint);
        message.success(
          `${headless ? "无头" : "有头"}浏览器已打开，右侧画面正在连接。`,
        );
      } else {
        message.success(`${headless ? "无头" : "有头"}浏览器已打开。`);
      }
      void queryClient.invalidateQueries({
        queryKey: ["adspower-browser-active", settings, record.profile_id],
      });
    } catch (error) {
      message.error(error instanceof Error ? error.message : "打开浏览器失败。");
    } finally {
      setStartingId("");
    }
  }

  async function handleStop(record: AdsPowerProfileRecord) {
    setStoppingId(record.profile_id);
    try {
      await stopAdsPowerBrowser(settings, record.profile_id);
      message.success("浏览器已关闭。");
      void queryClient.invalidateQueries({
        queryKey: ["adspower-browser-active", settings, record.profile_id],
      });
    } catch (error) {
      message.error(error instanceof Error ? error.message : "关闭浏览器失败。");
    } finally {
      setStoppingId("");
    }
    if (selectedViewer?.profileId === record.profile_id) {
      setSelectedViewer(null);
    }
  }

  async function handleDelete(record: AdsPowerProfileRecord) {
    setDeletingId(record.profile_id);
    try {
      await deleteAdsPowerProfiles(settings, [record.profile_id]);
      message.success("浏览器环境已删除。");
      void profilesQuery.refetch();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "删除浏览器失败。");
    } finally {
      setDeletingId("");
    }
  }

  async function batchStart(headless: boolean) {
    setBatchStarting(true);
    try {
      for (const profileId of selectedProfileIds) {
        await startAdsPowerBrowser(settings, profileId, { headless });
      }
      message.success(`已批量${headless ? "无头" : "有头"}启动。`);
      void queryClient.invalidateQueries({ queryKey: ["adspower-browser-active"] });
    } catch (error) {
      message.error(error instanceof Error ? error.message : "批量启动失败。");
    } finally {
      setBatchStarting(false);
    }
  }

  async function batchStop() {
    setBatchStopping(true);
    try {
      for (const profileId of selectedProfileIds) {
        await stopAdsPowerBrowser(settings, profileId);
      }
      message.success("已批量关闭。");
      void queryClient.invalidateQueries({ queryKey: ["adspower-browser-active"] });
    } catch (error) {
      message.error(error instanceof Error ? error.message : "批量关闭失败。");
    } finally {
      setBatchStopping(false);
    }
  }

  async function batchDelete() {
    setBatchDeleting(true);
    try {
      await deleteAdsPowerProfiles(settings, selectedProfileIds);
      message.success("已批量删除浏览器环境。");
      setSelectedRowKeys([]);
      void profilesQuery.refetch();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "批量删除失败。");
    } finally {
      setBatchDeleting(false);
    }
  }

  const queryError = profilesQuery.error ?? groupsQuery.error;

  return (
    <>
      <WorkbenchPage
        className={styles.page}
        contentClassName={styles.pageContent}
      >
        {queryError ? (
          <Alert
            showIcon
            type="error"
            title={queryError instanceof Error ? queryError.message : String(queryError)}
          />
        ) : null}
        <ResizableWorkspace
          dividerLabels={["调整环境列表和浏览器画面宽度"]}
          layoutId="adspower.main"
          panels={[
            {
              className: styles.profilesPanel,
              content: (
                <div className={styles.profilesCard}>
                  <Space orientation="vertical" size={12} className={styles.profilesStack}>
                    <div className={styles.toolbar}>
                      <Space wrap>
                        <Typography.Text type="secondary">
                          共 {rows.length} 项，已选 {selectedProfileIds.length} 项
                        </Typography.Text>
                        <Button
                          disabled={selectedProfileIds.length === 0}
                          onClick={() => setSelectedRowKeys([])}
                        >
                          取消选择
                        </Button>
                        <Dropdown
                          trigger={["click"]}
                          disabled={selectedProfileIds.length === 0}
                          menu={{
                            items: [
                              { key: "headed", label: "批量有头启动" },
                              { key: "headless", label: "批量无头启动" },
                            ],
                            onClick: ({ key }) => {
                              void batchStart(key === "headless");
                            },
                          }}
                        >
                          <Button
                            disabled={selectedProfileIds.length === 0}
                            loading={batchStarting}
                            icon={<PlayCircleOutlined />}
                          >
                            批量启动
                          </Button>
                        </Dropdown>
                        <Button
                          disabled={selectedProfileIds.length === 0}
                          icon={<StopOutlined />}
                          loading={batchStopping}
                          onClick={() => void batchStop()}
                        >
                          批量关闭
                        </Button>
                        <Button
                          disabled={selectedRebuildNames.length === 0}
                          loading={rebuildingProfileNames.length > 0}
                          onClick={() =>
                            void handleRebuildProfilesByName(selectedRebuildNames)}
                        >
                          重建
                        </Button>
                        <Popconfirm
                          title="批量删除浏览器环境"
                          description={`确认删除 ${selectedProfileIds.length} 个浏览器环境？`}
                          okText="删除"
                          cancelText="取消"
                          okButtonProps={{ danger: true, loading: batchDeleting }}
                          placement="right"
                          onConfirm={() => batchDelete()}
                        >
                          <Button
                            danger
                            disabled={selectedProfileIds.length === 0}
                            icon={<DeleteOutlined />}
                            loading={batchDeleting}
                          >
                            批量删除
                          </Button>
                        </Popconfirm>
                      </Space>
                      <Space wrap>
                        <Button
                          icon={<ReloadOutlined />}
                          loading={profilesQuery.isFetching || groupsQuery.isFetching}
                          onClick={refreshSettingsAndData}
                        >
                          刷新
                        </Button>
                        <Button loading={quickCreating} onClick={() => void quickCreate()}>
                          快速创建
                        </Button>
                        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                          新增环境
                        </Button>
                      </Space>
                    </div>
                    <div ref={tableScrollRef} className={styles.tableScroll}>
                      <Table
                        className={styles.profileTable}
                        rowKey="profile_id"
                        columns={columns}
                        dataSource={rows}
                        loading={profilesQuery.isFetching}
                        pagination={false}
                        rowSelection={{
                          fixed: true,
                          selectedRowKeys,
                          onChange: setSelectedRowKeys,
                        }}
                        scroll={{ x: "max-content", y: tableBodyHeight }}
                      />
                    </div>
                  </Space>
                </div>
              ),
              key: "profiles",
              minSize: 420,
            },
            {
              className: styles.viewerPanel,
              content: (
                <BrowserViewerPage
                  endpoint={selectedViewer?.endpoint}
                  endpointEditable={false}
                  endpointKey={selectedViewer?.endpointKey}
                  browserGateway={{
                    browserGatewayUrl: settings.browserGatewayUrl,
                    enabled: Boolean(settings.browserGatewayUrl),
                  }}
                  persistSettings={false}
                  variant="embedded"
                />
              ),
              key: "viewer",
              minSize: 420,
            },
          ]}
        />
      </WorkbenchPage>
      <Drawer
        title={editing ? "编辑浏览器环境" : "新增浏览器环境"}
        width={620}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={submit}>
          <Form.Item label="名称" name="name">
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item
            label="分组"
            name="group_id"
            rules={[{ required: true, message: "请选择分组" }]}
          >
            <Select options={groupOptions} />
          </Form.Item>
          <Form.Item
            label="平台"
            name="platform"
            extra={editing ? "AdsPower 更新接口允许修改平台；它会影响浏览器启动时默认访问的站点。" : undefined}
          >
            <Input placeholder="example.com" />
          </Form.Item>
          <Form.Item label="账号" name="username">
            <Input />
          </Form.Item>
          <Form.Item label="密码" name="password">
            <Input autoComplete="off" />
          </Form.Item>
          <Form.Item label="备注" name="remark">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item label="启动标签页，每行一个 URL" name="tabs_text">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item label="代理 ID" name="proxyid">
            <Input placeholder="留空则使用下面的代理 JSON" />
          </Form.Item>
          <Form.Item
            label="user_proxy_config JSON"
            name="user_proxy_config_json"
            rules={[jsonRule("代理 JSON 必须是对象。")]}
          >
            <Input.TextArea rows={5} className={styles.jsonEditor} />
          </Form.Item>
          <Form.Item
            label="fingerprint_config JSON"
            name="fingerprint_config_json"
            rules={[jsonRule("指纹 JSON 必须是对象。", true)]}
          >
            <Input.TextArea rows={8} className={styles.jsonEditor} />
          </Form.Item>
          <Form.Item
            label="额外字段 JSON"
            name="extra_json"
            rules={[jsonRule("额外字段 JSON 必须是对象。")]}
          >
            <Input.TextArea rows={4} className={styles.jsonEditor} />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={saving} block>
            保存
          </Button>
        </Form>
      </Drawer>
    </>
  );
}

function BrowserStatusCell({
  enabled,
  lastOpenTime,
  onEndpointChange,
  onView,
  profileId,
  profileName,
  profileNo,
  settings,
}: {
  enabled: boolean;
  onEndpointChange(
    record: Pick<AdsPowerProfileRecord, "last_open_time" | "name" | "profile_id" | "profile_no">,
    endpoint: string,
  ): void;
  onView(
    record: Pick<AdsPowerProfileRecord, "last_open_time" | "name" | "profile_id" | "profile_no">,
    endpoint: string,
  ): void;
  lastOpenTime?: string;
  profileId: string;
  profileName: string;
  profileNo?: string;
  settings: AdsPowerSettings;
}) {
  const { message } = AntdApp.useApp();
  const query = useAdsPowerBrowserActiveQuery(
    settings,
    profileId,
    lastOpenTime,
    enabled,
  );
  const active = query.data?.status === "Active";
  const cdpEndpoint = normalizeEndpoint(query.data?.ws?.puppeteer);
  const endpointVersion = `${lastOpenTime ?? ""}:${cdpEndpoint}`;

  useEffect(() => {
    if (!active || !cdpEndpoint) {
      return;
    }
    onEndpointChange(
      {
        name: profileName,
        last_open_time: lastOpenTime,
        profile_id: profileId,
        profile_no: profileNo,
      },
      cdpEndpoint,
    );
  }, [active, cdpEndpoint, lastOpenTime, onEndpointChange, profileId, profileName, profileNo]);

  async function copyCdpEndpoint() {
    if (!cdpEndpoint) {
      return;
    }
    await navigator.clipboard.writeText(cdpEndpoint);
    message.success("已复制 CDP 地址。");
  }

  return (
    <Space size={4}>
      <Tag color={active ? "success" : "default"}>
        {query.isFetching && !query.data
          ? "检查中"
          : active
          ? "已启动"
          : "未启动"}
      </Tag>
      {active && cdpEndpoint ? (
        <>
          <Button
            size="small"
            icon={<PlayCircleOutlined />}
            aria-label="查看浏览器画面"
            onClick={() =>
              onView(
                {
                  name: profileName,
                  last_open_time: lastOpenTime,
                  profile_id: profileId,
                  profile_no: profileNo,
                },
                cdpEndpoint,
              )
            }
            key={endpointVersion}
          />
          <Button
            size="small"
            icon={<CopyOutlined />}
            aria-label="复制 CDP 地址"
            onClick={() => void copyCdpEndpoint()}
          />
        </>
      ) : null}
    </Space>
  );
}

function ProfileActions({
  deleting,
  enabled,
  onDelete,
  onEdit,
  onRebuild,
  onStart,
  onStop,
  profile,
  rebuilding,
  settings,
  starting,
  stopping,
}: {
  deleting: boolean;
  enabled: boolean;
  onDelete(profile: AdsPowerProfileRecord): Promise<void>;
  onEdit(profile: AdsPowerProfileRecord): void;
  onRebuild(names: string[]): Promise<void>;
  onStart(profile: AdsPowerProfileRecord, headless: boolean): Promise<void>;
  onStop(profile: AdsPowerProfileRecord): Promise<void>;
  profile: AdsPowerProfileRecord;
  rebuilding: boolean;
  settings: AdsPowerSettings;
  starting: boolean;
  stopping: boolean;
}) {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const activeQuery = useAdsPowerBrowserActiveQuery(
    settings,
    profile.profile_id,
    profile.last_open_time,
    enabled,
  );
  const active = activeQuery.data?.status === "Active";
  const items = active
    ? [
      { key: "stop", icon: <StopOutlined />, label: "关闭浏览器" },
      { key: "rebuild", icon: <ReloadOutlined />, label: "重建" },
      { key: "edit", icon: <EditOutlined />, label: "编辑" },
      { key: "delete", icon: <DeleteOutlined />, label: "删除", danger: true },
    ]
    : [
      { key: "start-headed", icon: <PlayCircleOutlined />, label: "有头启动" },
      { key: "start-headless", icon: <PlayCircleOutlined />, label: "无头启动" },
      { key: "rebuild", icon: <ReloadOutlined />, label: "重建" },
      { key: "edit", icon: <EditOutlined />, label: "编辑" },
      { key: "delete", icon: <DeleteOutlined />, label: "删除", danger: true },
    ];

  return (
    <Popconfirm
      open={deleteConfirmOpen}
      title="删除浏览器环境"
      description={`确认删除 ${profile.name || profile.profile_id}？`}
      okText="删除"
      cancelText="取消"
      okButtonProps={{ danger: true, loading: deleting }}
      placement="left"
      onConfirm={async () => {
        await onDelete(profile);
        setDeleteConfirmOpen(false);
      }}
      onCancel={() => setDeleteConfirmOpen(false)}
      onOpenChange={(open) => {
        if (!open) {
          setDeleteConfirmOpen(false);
        }
      }}
    >
      <Dropdown
        trigger={["click"]}
        menu={{
          items,
          onClick: ({ key, domEvent }) => {
            domEvent.stopPropagation();
            if (key === "start-headed") {
              void onStart(profile, false);
              return;
            }
            if (key === "start-headless") {
              void onStart(profile, true);
              return;
            }
            if (key === "stop") {
              void onStop(profile);
              return;
            }
            if (key === "rebuild") {
              void onRebuild(profile.name ? [profile.name] : []);
              return;
            }
            if (key === "edit") {
              onEdit(profile);
              return;
            }
            if (key === "delete") {
              setDeleteConfirmOpen(true);
            }
          },
        }}
      >
        <Button
          type="text"
          icon={<EllipsisOutlined />}
          aria-label={`${profile.name || profile.profile_id} 操作`}
          loading={starting || stopping || deleting || rebuilding}
        />
      </Dropdown>
    </Popconfirm>
  );
}

function buildProfileInput(values: ProfileFormValues, editing: boolean): AdsPowerProfileInput {
  const extra = parseJsonObject(values.extra_json || "{}");
  const input: AdsPowerProfileInput = {
    ...extra,
    category_id: values.category_id?.trim() || undefined,
    cookie: values.cookie?.trim() || undefined,
    group_id: values.group_id || "0",
    name: values.name?.trim() || undefined,
    password: values.password || undefined,
    platform: values.platform?.trim() || undefined,
    proxyid: values.proxyid?.trim() || undefined,
    remark: values.remark?.trim() || undefined,
    tabs: parseLines(values.tabs_text),
    username: values.username?.trim() || undefined,
  };
  if (values.user_proxy_config_json && !input.proxyid) {
    input.user_proxy_config = parseJsonObject(values.user_proxy_config_json);
  }
  if (values.fingerprint_config_json?.trim()) {
    input.fingerprint_config = parseJsonObject(values.fingerprint_config_json);
  } else if (!editing) {
    input.fingerprint_config = defaultFingerprintConfig;
  }

  return removeEmpty(input);
}

function parseLines(value?: string) {
  const items = (value ?? "").split("\n").map((item) => item.trim()).filter(Boolean);
  return items.length > 0 ? items : undefined;
}

function parseJsonObject(value: string): Record<string, unknown> {
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("JSON 必须是对象。");
  }
  return parsed as Record<string, unknown>;
}

function jsonRule(message: string, allowEmpty = false) {
  return {
    validator: async (_: unknown, value?: string) => {
      if (allowEmpty && !value?.trim()) {
        return;
      }
      const parsed = parseJsonObject(value || "{}");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error(message);
      }
    },
  };
}

function removeEmpty<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => {
      if (item === undefined || item === null || item === "") {
        return false;
      }
      return !(Array.isArray(item) && item.length === 0);
    }),
  ) as T;
}
