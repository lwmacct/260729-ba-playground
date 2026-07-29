import {
  ApiOutlined,
  CloudServerOutlined,
  DeleteOutlined,
  LayoutOutlined,
  PlusOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import {
  App as AntdApp,
  Button,
  Form,
  Input,
  Popconfirm,
  Space,
  Tabs,
  Typography,
} from "antd";
import { WorkbenchPage } from "@lwmacct/260627-antd-workbench";
import { useEffect, useState } from "react";
import {
  listLayoutPreferenceRecords,
  removeAllLayoutPreferences,
  removeLayoutPreference,
} from "../../shared/preferences/layoutPreferences";
import { fetchAdsPowerStatus } from "../adspower/api/client";
import {
  readAdsPowerSettings,
  saveAdsPowerSettings,
} from "../adspower/model/config";
import type { AdsPowerSettings } from "../adspower/model/config";
import { fetchWorkflowHealth } from "../workflow/api/workflowApi";
import {
  defaultWorkflow,
  getWorkflowExecutorById,
  normalizeWorkflowExecutorSettings,
  normalizeWorkflowExecutorToken,
  normalizeWorkflowId,
  readWorkflowExecutorSettings,
  saveWorkflowExecutorSettings,
  type WorkflowExecutorDefinition,
  type WorkflowExecutorSettings,
} from "../workflow/model/executorSettings";
import styles from "./SettingsPage.module.css";
import layoutStyles from "../../shared/ui/layout.module.css";

function formatLayoutUpdatedAt(value: string) {
  if (!value) {
    return "未知";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

export function SettingsPage() {
  const { message } = AntdApp.useApp();
  const [adsPowerForm] = Form.useForm<AdsPowerSettings>();
  const [workflowForm] = Form.useForm<WorkflowExecutorDefinition>();
  const [testingAdsPower, setTestingAdsPower] = useState(false);
  const [testingExecutor, setTestingExecutor] = useState(false);
  const [executorSettings, setExecutorSettings] = useState(
    readWorkflowExecutorSettings,
  );
  const [layoutPreferences, setLayoutPreferences] = useState(
    listLayoutPreferenceRecords,
  );
  const [selectedWorkflowId, setSelectedWorkflowId] = useState(
    () => readWorkflowExecutorSettings().workflows[0].id,
  );

  const selectedWorkflow = getWorkflowExecutorById(
    executorSettings,
    selectedWorkflowId,
  );

  useEffect(() => {
    workflowForm.setFieldsValue({
      ...selectedWorkflow,
      token: selectedWorkflow.token ?? "",
    });
  }, [selectedWorkflow, workflowForm]);

  function saveExecutorSettings(
    settings: WorkflowExecutorSettings,
    nextSelectedWorkflowId?: string,
  ) {
    const normalized = normalizeWorkflowExecutorSettings(settings);
    saveWorkflowExecutorSettings(normalized);
    setExecutorSettings(normalized);
    setSelectedWorkflowId(
      nextSelectedWorkflowId &&
        normalized.workflows.some((workflow) => workflow.id === nextSelectedWorkflowId)
        ? nextSelectedWorkflowId
        : normalized.workflows[0].id,
    );
  }

  function handleAddWorkflow() {
    const existing = new Set(executorSettings.workflows.map((workflow) => workflow.id));
    let index = executorSettings.workflows.length + 1;
    let id = `workflow-${index}`;
    while (existing.has(id)) {
      index += 1;
      id = `workflow-${index}`;
    }

    const nextWorkflow = {
      ...defaultWorkflow,
      id,
    };
    saveExecutorSettings({
      workflows: [...executorSettings.workflows, nextWorkflow],
    }, id);
    message.success("Workflow 已添加。");
  }

  function handleRemoveWorkflow(id: string) {
    if (executorSettings.workflows.length <= 1) {
      message.warning("至少保留一个 Workflow。");
      return;
    }

    const workflows = executorSettings.workflows.filter(
      (workflow) => workflow.id !== id,
    );

    saveExecutorSettings({ workflows }, workflows[0].id);
    message.success("Workflow 已删除。");
  }

  function handleSaveWorkflow(values: WorkflowExecutorDefinition) {
    const nextId = normalizeWorkflowId(values.id);
    const duplicated = executorSettings.workflows.some(
      (workflow) => workflow.id === nextId && workflow.id !== selectedWorkflow.id,
    );
    if (duplicated) {
      message.error("Workflow ID 已存在。");
      return;
    }

    const workflows = executorSettings.workflows.map((workflow) =>
      workflow.id === selectedWorkflow.id
        ? {
          baseUrl: values.baseUrl,
          ...(normalizeWorkflowExecutorToken(values.token)
            ? { token: normalizeWorkflowExecutorToken(values.token) }
            : {}),
          id: nextId,
        }
        : workflow,
    );
    saveExecutorSettings({ workflows }, nextId);
    message.success("Workflow 设置已保存。");
  }

  async function handleTestExecutor() {
    try {
      const values = await workflowForm.validateFields();
      setTestingExecutor(true);
      await fetchWorkflowHealth(values.token ?? "", values.baseUrl);
      message.success("Workflow Executor 可连接。");
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : "Workflow Executor 连接失败。",
      );
    } finally {
      setTestingExecutor(false);
    }
  }

  function handleSaveAdsPower(values: AdsPowerSettings) {
    saveAdsPowerSettings(values);
    message.success("AdsPower 设置已保存。");
  }

  function refreshWorkspaceLayouts() {
    setLayoutPreferences(listLayoutPreferenceRecords());
  }

  function handleRemoveWorkspaceLayout(id: string) {
    removeLayoutPreference(id);
    refreshWorkspaceLayouts();
    message.success("布局数据已清除。");
  }

  function handleRemoveAllWorkspaceLayouts() {
    removeAllLayoutPreferences();
    refreshWorkspaceLayouts();
    message.success("所有布局数据已清除。");
  }

  const savedLayoutCount = layoutPreferences.filter((layout) => layout.saved).length;

  async function handleTestAdsPower() {
    try {
      const values = await adsPowerForm.validateFields();
      setTestingAdsPower(true);
      await fetchAdsPowerStatus(values);
      message.success("AdsPower Local API 可连接。");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "AdsPower 连接失败。");
    } finally {
      setTestingAdsPower(false);
    }
  }

  return (
    <WorkbenchPage
      className={styles.page}
      description="管理 Workflow executor、AdsPower 连接和当前浏览器的布局偏好。"
      title="系统设置"
    >
      <Tabs
        className={styles.tabs}
        tabPosition="left"
        items={[
          {
            key: "workflow-executor",
            label: "Workflow",
            icon: <CloudServerOutlined />,
            children: (
              <div className={styles.workflowGrid}>
                <section className={`${styles.panel} ${styles.workflowList}`}>
                  <div className={styles.panelHeader}>
                    <Typography.Text strong>Workflows</Typography.Text>
                    <Button
                      type="text"
                      icon={<PlusOutlined />}
                      onClick={handleAddWorkflow}
                    />
                  </div>
                  <Space orientation="vertical" size={8} className={layoutStyles.fullWidth}>
                    {executorSettings.workflows.map((workflow) => {
                      const selected = workflow.id === selectedWorkflow.id;
                      return (
                        <button
                          key={workflow.id}
                          type="button"
                          className={
                            selected
                              ? `${styles.workflowItem} ${styles.workflowItemSelected}`
                              : styles.workflowItem
                          }
                          onClick={() => setSelectedWorkflowId(workflow.id)}
                        >
                          <span>
                            <Typography.Text strong>{workflow.id}</Typography.Text>
                            <Typography.Text type="secondary" ellipsis>
                              {workflow.baseUrl}
                            </Typography.Text>
                          </span>
                        </button>
                      );
                    })}
                  </Space>
                </section>

                <section className={styles.panel}>
                  <div className={styles.panelHeader}>
                    <Space>
                      <Typography.Text strong>Workflow 连接</Typography.Text>
                    </Space>
                    <Space>
                      <Popconfirm
                        title="删除这个 Workflow？"
                        okText="删除"
                        cancelText="取消"
                        onConfirm={() => handleRemoveWorkflow(selectedWorkflow.id)}
                      >
                        <Button danger icon={<DeleteOutlined />} />
                      </Popconfirm>
                    </Space>
                  </div>
                  <Form
                    form={workflowForm}
                    layout="vertical"
                    className={styles.form}
                    onFinish={handleSaveWorkflow}
                  >
                    <Form.Item
                      label="Workflow ID"
                      name="id"
                      rules={[
                        { required: true, message: "请输入 Workflow ID" },
                      ]}
                    >
                      <Input placeholder="openai" />
                    </Form.Item>
                    <Form.Item
                      label="Executor API URL"
                      name="baseUrl"
                      rules={[
                        { required: true, message: "请输入 Executor API URL" },
                        { type: "url", message: "请输入有效的 URL" },
                      ]}
                    >
                      <Input placeholder="http://127.0.0.1:3000/api" />
                    </Form.Item>
                    <Form.Item label="Executor Bearer Token" name="token">
                      <Input.Password
                        autoComplete="off"
                        placeholder="Executor 要求鉴权时填写"
                      />
                    </Form.Item>
                    <Typography.Paragraph type="secondary">
                      Workflow ID 会作为步骤持久化的 site_code；Executor URL 和 token
                      仅保存在当前浏览器。
                    </Typography.Paragraph>
                    <Space wrap>
                      <Button type="primary" htmlType="submit" icon={<SaveOutlined />}>
                        保存
                      </Button>
                      <Button
                        icon={<ApiOutlined />}
                        loading={testingExecutor}
                        onClick={handleTestExecutor}
                      >
                        测试连接
                      </Button>
                    </Space>
                  </Form>
                </section>
              </div>
            ),
          },
          {
            key: "layout",
            label: "本地偏好",
            icon: <LayoutOutlined />,
            children: (
              <section className={styles.panel}>
                <div className={styles.panelHeader}>
                  <div>
                    <Typography.Text strong>分栏布局</Typography.Text>
                    <Typography.Paragraph type="secondary" className={styles.panelHint}>
                      分栏拖动后的尺寸保存在当前浏览器 localStorage 中。
                    </Typography.Paragraph>
                  </div>
                  <Popconfirm
                    title="清除所有布局数据？"
                    okText="清除"
                    cancelText="取消"
                    disabled={savedLayoutCount === 0}
                    onConfirm={handleRemoveAllWorkspaceLayouts}
                  >
                    <Button
                      danger
                      disabled={savedLayoutCount === 0}
                      icon={<DeleteOutlined />}
                    >
                      全部清除
                    </Button>
                  </Popconfirm>
                </div>
                <Space orientation="vertical" size={8} className={layoutStyles.fullWidth}>
                  {layoutPreferences.map((layout) => (
                    <div key={layout.id} className={styles.layoutItem}>
                      <div className={styles.layoutItemMain}>
                        <Typography.Text strong>{layout.label}</Typography.Text>
                        <Typography.Text type="secondary">
                          {layout.panelKeys.join(" / ")}
                        </Typography.Text>
                        <Typography.Text type="secondary">
                          默认尺寸：{layout.defaultSizes.join(" / ")}
                        </Typography.Text>
                        {layout.saved ? (
                          <>
                            <Typography.Text type="secondary">
                              当前尺寸：{layout.saved.sizes
                                .map((size) => size.toFixed(3))
                                .join(" / ")}
                            </Typography.Text>
                            <Typography.Text type="secondary">
                              更新时间：{formatLayoutUpdatedAt(layout.saved.updatedAt)}
                            </Typography.Text>
                          </>
                        ) : (
                          <Typography.Text type="secondary">未保存自定义尺寸</Typography.Text>
                        )}
                      </div>
                      <Popconfirm
                        title="清除这个布局数据？"
                        okText="清除"
                        cancelText="取消"
                        disabled={!layout.saved}
                        onConfirm={() => handleRemoveWorkspaceLayout(layout.id)}
                      >
                        <Button danger disabled={!layout.saved} icon={<DeleteOutlined />}>
                          清除
                        </Button>
                      </Popconfirm>
                    </div>
                  ))}
                </Space>
              </section>
            ),
          },
          {
            key: "adspower",
            label: "AdsPower",
            icon: <ApiOutlined />,
            children: (
              <section className={`${styles.panel} ${styles.twoColumn}`}>
                <Form
                  form={adsPowerForm}
                  layout="vertical"
                  className={styles.form}
                  initialValues={readAdsPowerSettings()}
                  onFinish={handleSaveAdsPower}
                >
                  <Form.Item
                    label="ADSPOWER_API_URL (Direct)"
                    name="apiUrl"
                    rules={[
                      { required: true, message: "请输入 AdsPower API URL" },
                      { type: "url", message: "请输入有效的 URL" },
                    ]}
                  >
                    <Input placeholder="http://127.0.0.1:50325" />
                  </Form.Item>
                  <Form.Item label="ADSPOWER_API_KEY" name="apiKey">
                    <Input.Password
                      autoComplete="off"
                      placeholder="开启安全校验时填写"
                    />
                  </Form.Item>
                  <Form.Item
                    label="Browser Gateway Base URL"
                    name="browserGatewayUrl"
                    rules={[
                      { required: true, message: "请输入 Browser Gateway Base URL" },
                      { type: "url", message: "请输入有效的 URL" },
                    ]}
                  >
                    <Input placeholder="https://example.com/browser-gateway" />
                  </Form.Item>
                  <Space wrap>
                    <Button type="primary" htmlType="submit" icon={<SaveOutlined />}>
                      保存
                    </Button>
                    <Button
                      icon={<ApiOutlined />}
                      loading={testingAdsPower}
                      onClick={handleTestAdsPower}
                    >
                      测试连接
                    </Button>
                  </Space>
                </Form>
                <Typography.Paragraph type="secondary">
                  设置保存在当前浏览器 localStorage 中。AdsPower API 会通过
                  Browser Gateway 根路径转发到 ADSPOWER_API_URL；浏览器画面会走
                  <Typography.Text code>/cdp?endpoint=...</Typography.Text>。
                </Typography.Paragraph>
              </section>
            ),
          },
        ]}
      />
    </WorkbenchPage>
  );
}
