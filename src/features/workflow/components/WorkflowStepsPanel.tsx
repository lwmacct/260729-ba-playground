import {
  DeleteOutlined,
  DownloadOutlined,
  DownOutlined,
  ImportOutlined,
  PlusOutlined,
  ReloadOutlined,
  RightOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import {
  Button,
  Card,
  Checkbox,
  Empty,
  Form,
  Input,
  List,
  Popconfirm,
  Select,
  Space,
  Tabs,
  Tag,
  Tooltip,
  Upload,
  Typography,
} from "antd";
import type { UploadProps } from "antd";
import { WorkbenchPanel } from "@lwmacct/260627-antd-workbench";
import { useEffect, useMemo, useState } from "react";
import type { WorkflowContextRecord } from "../api/workflowContextApi";
import type { WorkflowExecutorDefinition } from "../model/executorSettings";
import type { WorkflowStepName, WorkflowStepMetadata, WorkflowStepType } from "../model/types";
import { StepPaletteItem } from "./WorkflowStepCards";
import styles from "./WorkflowStepsPanel.module.css";

type WorkflowStepsPanelProps = {
  activeKey: string;
  contextLoading: boolean;
  contextOptions: WorkflowContextRecord[];
  currentContextId: string;
  filteredStepCount: number;
  filteredSteps: WorkflowStepMetadata[];
  onAdd(step: WorkflowStepName): void;
  onChange(activeKey: string): void;
  onContextChange(contextId: string): void;
  onContextCreate(): void;
  onContextExport(contextIds: string[]): void;
  onContextImport(file: File): void;
  onContextRename(contextId: string, name: string): void;
  onContextsDelete(contextIds: string[]): void;
  onContextRefresh(): void;
  onStepFiltersClear(): void;
  onStepsRefresh(): void;
  onSearchChange(value: string): void;
  onStepTagChange(value: string): void;
  onStepTypeChange(value: WorkflowStepType | ""): void;
  search: string;
  stepTag: string;
  stepTags: string[];
  stepType: WorkflowStepType | "";
  stepTypes: WorkflowStepType[];
  stepsLoading: boolean;
  totalStepCount: number;
  workflows: WorkflowExecutorDefinition[];
};

export function WorkflowStepsPanel({
  activeKey,
  contextLoading,
  contextOptions,
  currentContextId,
  filteredStepCount,
  filteredSteps,
  onAdd,
  onChange,
  onContextChange,
  onContextCreate,
  onContextExport,
  onContextImport,
  onContextRename,
  onContextsDelete,
  onContextRefresh,
  onStepFiltersClear,
  onStepsRefresh,
  onSearchChange,
  onStepTagChange,
  onStepTypeChange,
  search,
  stepTag,
  stepTags,
  stepType,
  stepTypes,
  stepsLoading,
  totalStepCount,
  workflows,
}: WorkflowStepsPanelProps) {
  const [contextSearch, setContextSearch] = useState("");
  const [selectedContextIds, setSelectedContextIds] = useState<string[]>([]);
  const [collapsedContextIds, setCollapsedContextIds] = useState<string[]>([]);
  const filteredContextOptions = useMemo(
    () => filterContexts(contextOptions, contextSearch),
    [contextOptions, contextSearch],
  );
  const filteredContextIds = filteredContextOptions.map((context) => context.id);
  const selectedFilteredContextIds = selectedContextIds.filter((id) =>
    filteredContextIds.includes(id)
  );
  const allFilteredContextsSelected = filteredContextIds.length > 0 &&
    selectedFilteredContextIds.length === filteredContextIds.length;
  const selectedContextCount = selectedContextIds.length;
  const hasActiveStepFilters = Boolean(search.trim() || stepType || stepTag);

  useEffect(() => {
    const validContextIds = new Set(contextOptions.map((context) => context.id));
    setSelectedContextIds((current) => {
      const next = current.filter((id) => validContextIds.has(id));
      return next.length === current.length ? current : next;
    });
  }, [contextOptions]);

  function toggleContextSelection(contextId: string, checked: boolean) {
    setSelectedContextIds((current) =>
      checked
        ? Array.from(new Set([...current, contextId]))
        : current.filter((id) => id !== contextId)
    );
  }

  function toggleAllFilteredContexts(checked: boolean) {
    setSelectedContextIds((current) => {
      if (checked) {
        return Array.from(new Set([...current, ...filteredContextIds]));
      }
      return current.filter((id) => !filteredContextIds.includes(id));
    });
  }

  function toggleContextExpanded(contextId: string) {
    setCollapsedContextIds((current) =>
      current.includes(contextId)
        ? current.filter((id) => id !== contextId)
        : [...current, contextId]
    );
  }

  function deleteSelectedContexts() {
    onContextsDelete(selectedContextIds);
    setSelectedContextIds([]);
  }

  const contextImportProps: UploadProps = {
    accept: ".json,application/json",
    beforeUpload(file) {
      onContextImport(file);
      return Upload.LIST_IGNORE;
    },
    maxCount: 1,
    showUploadList: false,
  };

  return (
    <WorkbenchPanel
      className={styles.card}
    >
      <div className={styles.body}>
        <Tabs
          activeKey={activeKey}
          className={styles.tabs}
          tabBarExtraContent={
            <Form.Item
              className={styles.workflowSelect}
              name="workflowId"
              rules={[{ required: true, message: "请选择 Workflow" }]}
            >
              <Select
                optionFilterProp="label"
                options={workflows.map((workflow) => ({
                  label: workflow.id,
                  value: workflow.id,
                }))}
                placeholder="选择 Workflow"
                showSearch
              />
            </Form.Item>
          }
          items={[
            {
              key: "steps",
              label: "步骤列表",
              children: (
                <div className={styles.tabPane}>
                  <Card
                    size="small"
                    className={styles.filterCard}
                    title="筛选条件"
                    extra={
                      <Space size={8}>
                        <Typography.Text type="secondary">
                          {`${filteredStepCount} / ${totalStepCount} 项`}
                        </Typography.Text>
                        <Typography.Link
                          disabled={!hasActiveStepFilters}
                          onClick={!hasActiveStepFilters ? undefined : onStepFiltersClear}
                        >
                          清空
                        </Typography.Link>
                        <Tooltip title="刷新步骤列表">
                          <Button
                            aria-label="刷新步骤列表"
                            icon={<ReloadOutlined />}
                            loading={stepsLoading}
                            size="small"
                            onClick={onStepsRefresh}
                          />
                        </Tooltip>
                      </Space>
                    }
                  >
                    <div className={styles.filterRow}>
                      <Typography.Text type="secondary" className={styles.filterLabel}>
                        搜索
                      </Typography.Text>
                      <Input
                        allowClear
                        placeholder="搜索步骤"
                        prefix={<SearchOutlined />}
                        value={search}
                        onChange={(event) => onSearchChange(event.target.value)}
                      />
                    </div>
                    <div className={styles.filterRow}>
                      <Typography.Text type="secondary" className={styles.filterLabel}>
                        类型
                      </Typography.Text>
                      <div className={styles.tagFilter}>
                        <Tag.CheckableTag
                          checked={!stepType}
                          onChange={() => onStepTypeChange("")}
                        >
                          全部
                        </Tag.CheckableTag>
                        {stepTypes.map((type) => (
                          <Tag.CheckableTag
                            key={type}
                            checked={stepType === type}
                            onChange={(checked) => onStepTypeChange(checked ? type : "")}
                          >
                            {type}
                          </Tag.CheckableTag>
                        ))}
                      </div>
                    </div>
                    <div className={styles.filterRow}>
                      <Typography.Text type="secondary" className={styles.filterLabel}>
                        标签
                      </Typography.Text>
                      <div className={styles.tagFilter}>
                        <Tag.CheckableTag
                          checked={!stepTag}
                          onChange={() => onStepTagChange("")}
                        >
                          全部
                        </Tag.CheckableTag>
                        {stepTags.map((tag) => (
                          <Tag.CheckableTag
                            key={tag}
                            checked={stepTag === tag}
                            onChange={(checked) => onStepTagChange(checked ? tag : "")}
                          >
                            {tag}
                          </Tag.CheckableTag>
                        ))}
                      </div>
                    </div>
                  </Card>
                  <Space orientation="vertical" size={8} className={styles.stepList}>
                    {filteredSteps.length > 0 ? (
                      filteredSteps.map((step) => (
                        <StepPaletteItem
                          key={step.name}
                          metadata={step}
                          onAdd={onAdd}
                        />
                      ))
                    ) : (
                      <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description={
                          stepsLoading ? "正在加载步骤元数据" : "没有匹配的步骤"
                        }
                      />
                    )}
                  </Space>
                </div>
              ),
            },
            {
              key: "contexts",
              label: "Context 管理",
              children: (
                <div className={styles.tabPane}>
                  <div className={styles.toolbar}>
                    <Input
                      allowClear
                      placeholder="搜索 Context"
                      prefix={<SearchOutlined />}
                      value={contextSearch}
                      onChange={(event) => setContextSearch(event.target.value)}
                    />
                    <Space size={4} className={styles.actions}>
                      <Tooltip title="新建 Context">
                        <Button
                          aria-label="新建 Context"
                          icon={<PlusOutlined />}
                          onClick={onContextCreate}
                        />
                      </Tooltip>
                      <Upload {...contextImportProps}>
                        <Tooltip title="导入 Context JSON">
                          <Button
                            aria-label="导入 Context JSON"
                            icon={<ImportOutlined />}
                          />
                        </Tooltip>
                      </Upload>
                      <Tooltip title="导出当前列表">
                        <Button
                          aria-label="导出当前列表"
                          disabled={filteredContextIds.length === 0}
                          icon={<DownloadOutlined />}
                          onClick={() => onContextExport(filteredContextIds)}
                        />
                      </Tooltip>
                      <Tooltip title="刷新 Context 列表">
                        <Button
                          aria-label="刷新 Context 列表"
                          icon={<ReloadOutlined />}
                          loading={contextLoading}
                          onClick={onContextRefresh}
                        />
                      </Tooltip>
                    </Space>
                  </div>
                  <div className={styles.bulkbar}>
                    <Checkbox
                      checked={allFilteredContextsSelected}
                      disabled={filteredContextIds.length === 0}
                      indeterminate={
                        selectedFilteredContextIds.length > 0 &&
                        !allFilteredContextsSelected
                      }
                      onChange={(event) =>
                        toggleAllFilteredContexts(event.target.checked)
                      }
                    >
                      全选当前列表
                    </Checkbox>
                    <Popconfirm
                      title="删除选中的 Context？"
                      description={`将删除 ${selectedContextCount} 个 Context，删除后不会再出现在列表中。`}
                      okButtonProps={{ danger: true }}
                      okText="删除"
                      cancelText="取消"
                      disabled={selectedContextCount === 0}
                      onConfirm={deleteSelectedContexts}
                    >
                      <Button
                        danger
                        disabled={selectedContextCount === 0}
                        icon={<DeleteOutlined />}
                        size="small"
                      >
                        删除 {selectedContextCount > 0 ? selectedContextCount : ""}
                      </Button>
                    </Popconfirm>
                    <Button
                      disabled={selectedContextCount === 0}
                      icon={<DownloadOutlined />}
                      size="small"
                      onClick={() => onContextExport(selectedContextIds)}
                    >
                      导出 {selectedContextCount > 0 ? selectedContextCount : ""}
                    </Button>
                  </div>
                  <List
                    className={styles.contextList}
                    dataSource={filteredContextOptions}
                    loading={contextLoading}
                    locale={{ emptyText: "没有匹配的 Context" }}
                    renderItem={(context) => (
                      <ContextListItem
                        checked={selectedContextIds.includes(context.id)}
                        collapsed={collapsedContextIds.includes(context.id)}
                        context={context}
                        current={context.id === currentContextId}
                        onDelete={() => onContextsDelete([context.id])}
                        onOpen={() => onContextChange(context.id)}
                        onRename={(name) => onContextRename(context.id, name)}
                        onSelectionChange={(checked) =>
                          toggleContextSelection(context.id, checked)
                        }
                        onToggleExpanded={() => toggleContextExpanded(context.id)}
                      />
                    )}
                  />
                </div>
              ),
            },
          ]}
          onChange={onChange}
        />
      </div>
    </WorkbenchPanel>
  );
}

function ContextListItem({
  checked,
  collapsed,
  context,
  current,
  onDelete,
  onOpen,
  onRename,
  onSelectionChange,
  onToggleExpanded,
}: {
  checked: boolean;
  collapsed: boolean;
  context: WorkflowContextRecord;
  current: boolean;
  onDelete(): void;
  onOpen(): void;
  onRename(name: string): void;
  onSelectionChange(checked: boolean): void;
  onToggleExpanded(): void;
}) {
  const siteCode = getContextMetaString(context, "siteCode") ||
    getContextMetaString(context, "site_code");
  const contextEntryNames = context.baton.entries.map((entry) => entry.uses);
  return (
    <List.Item
      className={styles.contextListItem}
      data-current={current}
      role="button"
      tabIndex={current ? -1 : 0}
      onClick={() => {
        if (!current) {
          onOpen();
        }
      }}
      onKeyDown={(event) => {
        if (current || (event.key !== "Enter" && event.key !== " ")) {
          return;
        }
        event.preventDefault();
        onOpen();
      }}
    >
      <div className={styles.contextCardContent}>
        <div className={styles.contextCardTitleRow}>
          <div className={styles.contextCardTitleMain}>
            <span
              className={styles.contextItemTitle}
              onClick={(event) => event.stopPropagation()}
            >
              <Typography.Text
                editable={{
                  onChange: (value) => onRename(value),
                  text: context.title || context.workflow,
                  tooltip: "修改名称",
                  triggerType: ["text"],
                }}
                ellipsis
              >
                {context.title || context.workflow}
              </Typography.Text>
            </span>
          </div>
          <Space size={4} className={styles.contextCardActions}>
            <Button
              aria-label={collapsed ? "展开 Context 详情" : "收起 Context 详情"}
              icon={collapsed ? <RightOutlined /> : <DownOutlined />}
              size="small"
              onClick={(event) => {
                event.stopPropagation();
                onToggleExpanded();
              }}
            />
            <Popconfirm
              title="删除这个 Context？"
              description="删除后不会再出现在列表中。"
              okButtonProps={{ danger: true }}
              okText="删除"
              cancelText="取消"
              onConfirm={(event) => {
                event?.stopPropagation();
                onDelete();
              }}
            >
              <Button
                aria-label="删除 Context"
                danger
                icon={<DeleteOutlined />}
                size="small"
                type="text"
                onClick={(event) => event.stopPropagation()}
              />
            </Popconfirm>
          </Space>
        </div>
        <div className={styles.contextCardMetaRow}>
          <div className={styles.contextCardMetaMain}>
            <Checkbox
              checked={checked}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => onSelectionChange(event.target.checked)}
            />
            <Typography.Text type="secondary" className={styles.contextCardId}>
              {context.id.slice(0, 8)}
            </Typography.Text>
            <Typography.Text type="secondary" ellipsis>
              {context.workflow}
            </Typography.Text>
          </div>
          <Tag color={statusColor(context.status)}>{context.status}</Tag>
        </div>
        {!collapsed ? (
          <div className={styles.contextCardDetailRow}>
            <Space orientation="vertical" size={2} className={styles.contextItemMeta}>
              <Typography.Text type="secondary">
                {`rev ${context.revision} · ${context.baton.entries.length} entries · ${formatDateTime(context.updated_at ?? context.created_at)}`}
              </Typography.Text>
              <Typography.Text type="secondary">
                {siteCode ? `site ${siteCode}` : "site -"}
              </Typography.Text>
              <ContextEntrySummary names={contextEntryNames} />
            </Space>
          </div>
        ) : null}
      </div>
    </List.Item>
  );
}

function ContextEntrySummary({ names }: { names: string[] }) {
  if (names.length === 0) {
    return (
      <Typography.Text type="secondary">
        context empty
      </Typography.Text>
    );
  }
  const visibleNames = names.slice(0, 4);
  return (
    <Space size={[4, 4]} wrap className={styles.contextEntrySummary}>
      {visibleNames.map((name, index) => (
        <Tag key={`${name}-${index}`}>{name}</Tag>
      ))}
      {names.length > visibleNames.length ? (
        <Tag>+{names.length - visibleNames.length}</Tag>
      ) : null}
    </Space>
  );
}

function filterContexts(contexts: WorkflowContextRecord[], search: string) {
  const query = search.trim().toLowerCase();
  if (!query) {
    return contexts;
  }
  return contexts.filter((context) =>
    getContextSearchText(context).includes(query)
  );
}

function getContextSearchText(context: WorkflowContextRecord) {
  return [
    context.id,
    context.workflow,
    context.title,
    context.status,
    String(context.revision),
    context.created_at,
    context.updated_at,
    getContextMetaString(context, "siteCode"),
    getContextMetaString(context, "site_code"),
    ...context.baton.entries.map((entry) => entry.uses),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function getContextMetaString(context: WorkflowContextRecord, key: string) {
  const value = context.meta?.[key];
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : "";
}

function formatDateTime(value?: string) {
  return value ? new Date(value).toLocaleString() : "-";
}

function statusColor(status: string) {
  switch (status) {
    case "completed":
      return "green";
    case "running":
      return "blue";
    case "failed":
    case "timed_out":
      return "red";
    case "cancelled":
      return "orange";
    default:
      return "default";
  }
}
