import {
  CopyOutlined,
  DeleteOutlined,
  DownOutlined,
  DragOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  QuestionCircleOutlined,
  RightOutlined,
} from "@ant-design/icons";
import { useDroppable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AutoComplete,
  Button,
  Form,
  Input,
  InputNumber,
  Popover,
  Segmented,
  Select,
  Space,
  Switch,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import { useEffect, useMemo, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import type {
  WorkflowStepName,
  WorkflowPlanItem,
  WorkflowStepInputBinding,
  WorkflowInputLiteralValue,
  WorkflowStepInputHint,
  WorkflowStepMetadata,
} from "../model/types";
import {
  createLiteralInputBinding,
  decodeInputSourceValue,
  encodeInputSourceValue,
} from "../model/inputBindings";
import layoutStyles from "../../../shared/ui/layout.module.css";
import styles from "./WorkflowStepCards.module.css";

type StepInputControlProps = {
  hint: WorkflowStepInputHint;
} & Record<string, unknown>;

function StepInputControl({
  hint,
  ...controlProps
}: StepInputControlProps) {
  function handleChange(...args: unknown[]) {
    const formOnChange = controlProps.onChange;
    if (typeof formOnChange === "function") {
      formOnChange(...args);
    }
  }

  if (hint.type === "boolean") {
    return (
      <Switch
        {...controlProps}
        size="small"
        onChange={handleChange}
      />
    );
  }

  if (hint.type === "number") {
    return (
      <InputNumber
        {...controlProps}
        precision={0}
        size="small"
        className={layoutStyles.fullWidth}
        onChange={handleChange}
      />
    );
  }

  if (hint.type === "object") {
    const value = typeof controlProps.value === "string"
      ? controlProps.value
      : controlProps.value === undefined
        ? ""
        : JSON.stringify(controlProps.value, null, 2);
    return (
      <Input.TextArea
        {...controlProps}
        autoComplete="off"
        autoSize={{ minRows: 3, maxRows: 8 }}
        className={layoutStyles.fullWidth}
        placeholder="手动输入 JSON object"
        size="small"
        value={value}
        onChange={handleChange}
      />
    );
  }

  if (hint.inputMode === "textarea") {
    const placeholder = hint.valueType === "array" || hint.valueType === "object"
      ? "手动输入 JSON"
      : undefined;
    return (
      <Input.TextArea
        {...controlProps}
        autoComplete="off"
        autoSize={{ minRows: 2, maxRows: 6 }}
        placeholder={placeholder}
        size="small"
        onChange={handleChange}
      />
    );
  }

  const htmlInputMode = hint.inputMode === "code" ? "numeric" : undefined;
  const inputType =
    hint.inputMode === "email" || hint.inputMode === "url"
      ? hint.inputMode
      : "text";

  return (
    <Input
      {...controlProps}
      autoComplete="off"
      inputMode={htmlInputMode}
      size="small"
      type={inputType}
      onChange={handleChange}
    />
  );
}

type StepInputBindingControlProps = {
  hint: WorkflowStepInputHint;
  onChange?: (value?: WorkflowStepInputBinding) => void;
  onInputChange?: () => void;
  options: Array<{ label: string; value: string }>;
  value?: WorkflowStepInputBinding;
};

function StepInputBindingControl({
  hint,
  onChange,
  onInputChange,
  options,
  value,
}: StepInputBindingControlProps) {
  const sourceValue = value?.mode === "step_output"
    ? encodeInputSourceValue(value.source)
    : undefined;
  const literalValue = value?.mode === "literal" ? value.value : undefined;
  const [literalDraft, setLiteralDraft] = useState<WorkflowInputLiteralValue | undefined>(
    literalValue,
  );
  const canAutocomplete = hint.type === "string" &&
    hint.valueType !== "array" &&
    hint.valueType !== "object";
  const hasSourceOptions = options.length > 0;
  const manualSelected = !value || value.mode === "literal";
  const modeOptions = useMemo(() => [
    { label: "手动", value: "literal" },
    { label: "引用", value: "step_output" },
  ], []);

  useEffect(() => {
    if (value?.mode === "literal") {
      setLiteralDraft(value.value);
    }
  }, [value]);

  function emit(nextValue?: WorkflowStepInputBinding) {
    onChange?.(nextValue);
    onInputChange?.();
  }

  function emitLiteral(nextValue?: WorkflowInputLiteralValue) {
    setLiteralDraft(nextValue);
    emit(createLiteralInputBinding(nextValue));
  }

  function handleLiteralControlChange(nextValue: unknown) {
    if (hint.type === "boolean") {
      emitLiteral(Boolean(nextValue));
      return;
    }
    if (typeof nextValue === "object" && nextValue && "target" in nextValue) {
      const rawValue = (nextValue as { target?: { value?: string } }).target?.value ?? "";
      if (hint.type === "object") {
        const trimmed = rawValue.trim();
        if (!trimmed) {
          emitLiteral(undefined);
          return;
        }
        try {
          const parsed = JSON.parse(trimmed) as unknown;
          emitLiteral(parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? parsed as WorkflowInputLiteralValue
            : rawValue);
        } catch {
          emitLiteral(rawValue);
        }
        return;
      }
      emitLiteral(rawValue);
      return;
    }
    emitLiteral(nextValue as WorkflowInputLiteralValue | undefined);
  }

  function isSourceOptionValue(nextValue: string) {
    return options.some((option) => option.value === nextValue);
  }

  function emitSource(nextValue?: string) {
    const source = nextValue ? decodeInputSourceValue(nextValue) : undefined;
    if (source) {
      emit({ mode: "step_output", source });
      return;
    }
    emit(createLiteralInputBinding(literalDraft));
  }

  if (canAutocomplete && hasSourceOptions) {
    const displayValue = value?.mode === "step_output"
      ? options.find((option) => option.value === sourceValue)?.label ?? sourceValue
      : typeof literalValue === "string" || typeof literalValue === "number"
        ? String(literalValue)
        : "";
    const inputElement = hint.inputMode === "textarea"
      ? (
        <Input.TextArea
          autoComplete="off"
          autoSize={{ minRows: 2, maxRows: 6 }}
          placeholder="手动输入或选择输出"
          size="small"
        />
      )
      : (
        <Input
          autoComplete="off"
          inputMode={hint.inputMode === "code" ? "numeric" : undefined}
          placeholder="手动输入或选择输出"
          size="small"
          type={hint.inputMode === "email" || hint.inputMode === "url"
            ? hint.inputMode
            : "text"}
        />
      );

    return (
      <AutoComplete
        className={layoutStyles.fullWidth}
        filterOption={(input, option) =>
          String(option?.label ?? "")
            .toLowerCase()
            .includes(input.trim().toLowerCase())
        }
        options={options}
        value={displayValue}
        onChange={(nextValue) => {
          if (isSourceOptionValue(nextValue)) {
            emitSource(nextValue);
            return;
          }
          emitLiteral(nextValue);
        }}
        onSelect={(nextValue) => emitSource(nextValue)}
      >
        {inputElement}
      </AutoComplete>
    );
  }

  if (!hasSourceOptions) {
    return (
      <StepInputControl
        hint={hint}
        value={hint.type === "boolean" ? undefined : literalValue}
        checked={hint.type === "boolean" ? Boolean(literalValue) : undefined}
        onChange={handleLiteralControlChange}
      />
    );
  }

  return (
    <Space orientation="vertical" size={4} className={layoutStyles.fullWidth}>
      <Segmented
        block
        options={modeOptions}
        size="small"
        value={manualSelected ? "literal" : "step_output"}
        onChange={(nextMode) => {
          if (nextMode === "literal") {
            emit(createLiteralInputBinding(literalDraft));
          } else {
            emitSource(sourceValue ?? options[0]?.value);
          }
        }}
      />
      {manualSelected ? (
        <StepInputControl
          hint={hint}
          value={hint.type === "boolean" ? undefined : literalValue}
          checked={hint.type === "boolean" ? Boolean(literalValue) : undefined}
          onChange={handleLiteralControlChange}
        />
      ) : (
        <Select
          className={layoutStyles.fullWidth}
          options={options}
          optionFilterProp="label"
          showSearch
          size="small"
          value={sourceValue}
          filterOption={(input, option) =>
            String(option?.label ?? "")
              .toLowerCase()
              .includes(input.trim().toLowerCase())
          }
          onChange={(nextValue) => emitSource(nextValue)}
        />
      )}
    </Space>
  );
}

type StepInputFieldsProps = {
  collapsed: boolean;
  hints: readonly WorkflowStepInputHint[];
  namePrefix: (string | number)[];
  onInputChange?: () => void;
  outputSourceOptions?: Record<string, Array<{ label: string; value: string }>>;
};

export function StepInputFields({
  collapsed,
  hints,
  namePrefix,
  onInputChange,
  outputSourceOptions = {},
}: StepInputFieldsProps) {
  if (hints.length === 0) {
    return null;
  }
  if (collapsed) {
    return null;
  }

  return (
    <div className={styles.cardInputs}>
      {hints.map((hint) => (
        <StepInputField
          key={`${namePrefix.join(".")}-${hint.name}`}
          hint={hint}
          namePrefix={namePrefix}
          onInputChange={onInputChange}
          outputSourceOptions={outputSourceOptions[hint.name] ?? []}
        />
      ))}
    </div>
  );
}

function StepInputField({
  hint,
  namePrefix,
  onInputChange,
  outputSourceOptions,
}: {
  hint: WorkflowStepInputHint;
  namePrefix: (string | number)[];
  onInputChange?: () => void;
  outputSourceOptions: Array<{ label: string; value: string }>;
}) {
  const inputPath = [...namePrefix, hint.name];
  const inputValue = Form.useWatch(inputPath) as WorkflowStepInputBinding | undefined;
  const inputSource = inputValue?.mode === "step_output" ? inputValue.source : undefined;

  return (
    <div className={styles.cardField} data-type={hint.type}>
      <div className={styles.fieldLabel}>
        <span>{hint.label || hint.name}</span>
        {hint.required ? <span className={styles.fieldRequired}>*</span> : null}
        {hint.description ? (
          <Tooltip title={hint.description}>
            <QuestionCircleOutlined className={styles.fieldHelpIcon} />
          </Tooltip>
        ) : null}
      </div>
      <Form.Item
        name={inputPath}
        rules={
          hint.required && !inputSource
            ? [{
              validator: (_, binding?: WorkflowStepInputBinding) => {
                if (binding && binding.mode !== "literal") {
                  return Promise.resolve();
                }
                const literalValue = binding?.mode === "literal" ? binding.value : undefined;
                if (typeof literalValue === "string" && literalValue.trim().length > 0) {
                  return Promise.resolve();
                }
                if (literalValue !== undefined && literalValue !== null && literalValue !== "") {
                  return Promise.resolve();
                }
                return Promise.reject(new Error(`请输入${hint.label || hint.name}`));
              },
            }]
            : undefined
        }
      >
        <StepInputBindingControl
          hint={hint}
          onInputChange={onInputChange}
          options={outputSourceOptions}
        />
      </Form.Item>
    </div>
  );
}


function StepOutputHints({ metadata }: { metadata?: WorkflowStepMetadata }) {
  const outputs = metadata?.outputs ?? [];
  if (outputs.length === 0) {
    return null;
  }

  return (
    <Space wrap size={[4, 4]} className={styles.cardOutputs}>
      {outputs.map((hint) => (
        <Tooltip key={hint.name} title={hint.description || hint.label}>
          <Tag className={styles.outputTag}>{hint.name}</Tag>
        </Tooltip>
      ))}
    </Space>
  );
}

type StepCardHeaderContentProps = {
  title: string;
};

function StepCardHeaderContent({
  title,
}: StepCardHeaderContentProps) {
  return (
    <div className={styles.paletteCardMain}>
      <Space size={4} className={styles.cardTitle}>
        <Typography.Text strong ellipsis>
          {title}
        </Typography.Text>
      </Space>
    </div>
  );
}

function StepMetadataTooltipContent({
  metadata,
}: {
  metadata?: WorkflowStepMetadata;
}) {
  if (!metadata) {
    return <div>没有步骤元信息</div>;
  }
  const outputs = metadata.outputs ?? [];
  const reads = metadata.reads ?? [];
  const writes = metadata.writes ?? [];
  return (
    <div className={styles.metadataTooltip}>
      {metadata.description ? (
        <div className={styles.metadataTooltipSection}>
          <div className={styles.metadataTooltipTitle}>说明</div>
          <Typography.Text>{metadata.description}</Typography.Text>
        </div>
      ) : null}
      {reads.length > 0 ? (
        <StepMetadataPathList title="读取 Context" paths={reads} />
      ) : null}
      {writes.length > 0 ? (
        <StepMetadataPathList title="写入 Context" paths={writes} />
      ) : null}
      {outputs.length > 0 ? (
        <div className={styles.metadataTooltipSection}>
          <div className={styles.metadataTooltipTitle}>输出</div>
          {outputs.map((output) => (
            <div key={output.name} className={styles.metadataOutputRow}>
              <Typography.Text code>{output.name}</Typography.Text>
              {output.description || output.label ? (
                <Typography.Text type="secondary">
                  {output.description || output.label}
                </Typography.Text>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {!metadata.description && reads.length === 0 && writes.length === 0 &&
          outputs.length === 0 ? (
        <div>没有更多元信息</div>
      ) : null}
    </div>
  );
}

function StepMetadataPathList({
  paths,
  title,
}: {
  paths: readonly string[];
  title: string;
}) {
  return (
    <div className={styles.metadataTooltipSection}>
      <div className={styles.metadataTooltipTitle}>{title}</div>
      {paths.map((path) => (
        <Typography.Text key={path} code>
          {path}
        </Typography.Text>
      ))}
    </div>
  );
}

function StepMetadataInfoButton({
  metadata,
}: {
  metadata?: WorkflowStepMetadata;
}) {
  return (
    <Tooltip title={<StepMetadataTooltipContent metadata={metadata} />}>
      <Button
        aria-label="查看 step 元信息"
        className={styles.planStepInfoButton}
        icon={<QuestionCircleOutlined />}
        size="small"
        type="text"
      />
    </Tooltip>
  );
}

function StepContextOutputTooltipContent({
  output,
}: {
  output?: Record<string, unknown>;
}) {
  const [wrap, setWrap] = useState(true);

  if (!output) {
    return <div>Context 中没有 output</div>;
  }

  return (
    <div className={styles.contextOutputTooltip}>
      <div className={styles.contextOutputHeader}>
        <div className={styles.metadataTooltipTitle}>Context output</div>
        <Segmented
          className={styles.contextOutputWrapMode}
          options={[
            { label: "折行", value: "wrap" },
            { label: "不折行", value: "nowrap" },
          ]}
          size="small"
          value={wrap ? "wrap" : "nowrap"}
          onChange={(value) => setWrap(value === "wrap")}
        />
      </div>
      <div className={styles.contextOutputDivider} />
      {Object.keys(output).length > 0 ? (
        <pre className={styles.contextOutputJson} data-wrap={wrap}>
          {toPrettyJson(output)}
        </pre>
      ) : (
        <Typography.Text type="secondary">空对象</Typography.Text>
      )}
    </div>
  );
}

function StepContextOutputInfoButton({
  output,
}: {
  output?: Record<string, unknown>;
}) {
  return (
    <Popover
      content={<StepContextOutputTooltipContent output={output} />}
      overlayClassName={styles.contextOutputOverlay}
      placement="top"
    >
      <Button
        aria-label="查看 context output"
        className={styles.planStepInfoButton}
        icon={<QuestionCircleOutlined />}
        size="small"
        type="text"
      />
    </Popover>
  );
}

type StepPaletteItemProps = {
  onAdd(step: WorkflowStepName): void;
  metadata: WorkflowStepMetadata;
};

export function StepPaletteItem({
  metadata,
  onAdd,
}: StepPaletteItemProps) {
  const [expanded, setExpanded] = useState(false);
  const outputs = metadata.outputs ?? [];
  const hasOutputs = outputs.length > 0;
  const hasDetails = hasOutputs;

  function toggleDetails() {
    if (hasDetails) {
      setExpanded((current) => !current);
    }
  }

  function handleTitleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    toggleDetails();
  }

  return (
    <div className={`${styles.planStepCard} ${styles.paletteCard}`}>
      <div className={styles.planStepMain}>
        <div className={styles.planStepHeader}>
          <div className={styles.planStepTitleRow}>
            <div
              className={styles.planStepTitlePanel}
              data-clickable={hasDetails || undefined}
              role={hasDetails ? "button" : undefined}
              tabIndex={hasDetails ? 0 : undefined}
              onClick={toggleDetails}
              onKeyDown={handleTitleKeyDown}
            >
              <StepCardHeaderContent
                title={metadata.title}
              />
            </div>
            <Space
              wrap
              size={4}
              className={styles.cardActions}
            >
              <Button
                icon={expanded ? <DownOutlined /> : <RightOutlined />}
                size="small"
                disabled={!hasDetails}
                onClick={toggleDetails}
              />
              <Tooltip title="添加到步骤编排">
                <Button
                  icon={<PlusOutlined />}
                  size="small"
                  onClick={() => onAdd(metadata.name)}
                >
                  添加
                </Button>
              </Tooltip>
            </Space>
          </div>
          <div className={styles.planStepMetaRow}>
            <div className={styles.planStepNameGroup}>
              <Typography.Text
                className={styles.planStepName}
                code
                ellipsis
              >
                {metadata.name}
              </Typography.Text>
              <Tooltip title="复制 step name">
                <Button
                  aria-label="复制 step name"
                  className={styles.planStepNameCopy}
                  icon={<CopyOutlined />}
                  size="small"
                  type="text"
                  onClick={() => void copyText(metadata.name)}
                />
              </Tooltip>
            </div>
            <div className={styles.planStepMetaActions}>
              <StepMetadataInfoButton metadata={metadata} />
            </div>
          </div>
          {(metadata.tags ?? []).length > 0 ? (
            <Space wrap size={[4, 4]} className={styles.cardTags}>
              {metadata.tags?.map((tag) => (
                <Tag className={styles.tag} key={tag}>{tag}</Tag>
              ))}
            </Space>
          ) : null}
        </div>
        {expanded && hasDetails ? (
          <div className={styles.planStepDetailPanel}>
            {hasOutputs ? (
              <div className={styles.planStepDetailSection}>
                <div className={styles.planStepDetailTitle}>输出</div>
                <StepOutputHints metadata={metadata} />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

type PlanDropZoneProps = {
  children: ReactNode;
  isEmpty: boolean;
};

export function PlanDropZone({ children, isEmpty }: PlanDropZoneProps) {
  const { setNodeRef } = useDroppable({ id: "plan-dropzone" });

  return (
    <div
      ref={setNodeRef}
      className={styles.dropzone}
      data-empty={isEmpty || undefined}
    >
      {children}
    </div>
  );
}

type SortablePlanStepProps = {
  contextOutput?: Record<string, unknown>;
  expanded: boolean;
  item: WorkflowPlanItem;
  metadata?: WorkflowStepMetadata;
  onRemove(): void;
  onInputChange(): void;
  onTest(item: WorkflowPlanItem): void;
  onToggle(): void;
  order: number;
  outputSourceOptions: Record<string, Array<{ label: string; value: string }>>;
  runStatus?: string;
  sortId: string;
};

export function SortablePlanStep({
  contextOutput,
  expanded,
  item,
  metadata,
  onRemove,
  onInputChange,
  onTest,
  onToggle,
  order,
  outputSourceOptions,
  runStatus,
  sortId,
}: SortablePlanStepProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: sortId });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const hints = metadata?.inputHints ?? [];
  const outputs = metadata?.outputs ?? [];
  const hasInputs = hints.length > 0;
  const hasDetails = hasInputs || outputs.length > 0;

  function toggleInputs() {
    if (hasDetails) {
      onToggle();
    }
  }

  function handleTitleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    toggleInputs();
  }

  return (
    <div
      ref={setNodeRef}
      className={styles.planStepCard}
      data-plan-item-key={item.key}
      data-run-status={runStatus}
      style={style}
    >
      <div className={styles.planStepControl}>
        <Button
          type="text"
          className={styles.dragHandle}
          icon={<DragOutlined />}
          {...attributes}
          {...listeners}
        />
        <span className={styles.planStepOrder}>{order}</span>
      </div>
      <div className={styles.planStepMain}>
        <div className={styles.planStepHeader}>
          <div className={styles.planStepTitleRow}>
            <div
              className={styles.planStepTitlePanel}
              data-clickable={hasDetails || undefined}
              role={hasDetails ? "button" : undefined}
              tabIndex={hasDetails ? 0 : undefined}
              onClick={toggleInputs}
              onKeyDown={handleTitleKeyDown}
            >
              <StepCardHeaderContent
                title={metadata?.title ?? item.name}
              />
            </div>
            <Space
              wrap
              size={4}
              className={styles.cardActions}
            >
              <Button
                icon={expanded ? <DownOutlined /> : <RightOutlined />}
                size="small"
                disabled={!hasDetails}
                onClick={onToggle}
              />
              <Button
                icon={<PlayCircleOutlined />}
                size="small"
                disabled={runStatus === "running"}
                onClick={() => onTest(item)}
              >
                测试
              </Button>
              <Button
                danger
                icon={<DeleteOutlined />}
                size="small"
                onClick={onRemove}
              />
            </Space>
          </div>
          <div className={styles.planStepMetaRow}>
            <div className={styles.planStepNameGroup}>
              <Typography.Text
                className={styles.planStepName}
                code
                ellipsis
              >
                {item.name}
              </Typography.Text>
              <Tooltip title="复制 step name">
                <Button
                  aria-label="复制 step name"
                  className={styles.planStepNameCopy}
                  icon={<CopyOutlined />}
                  size="small"
                  type="text"
                  onClick={() => void copyText(item.name)}
                />
              </Tooltip>
            </div>
            <div className={styles.planStepMetaActions}>
              {runStatus ? <StepRunStatusTag status={runStatus} /> : null}
              <StepContextOutputInfoButton output={contextOutput} />
            </div>
          </div>
        </div>
      </div>
      {expanded && hasDetails ? (
        <div className={`${styles.planStepDetailPanel} ${styles.planStepDetailPanelWide}`}>
          {hasInputs ? (
            <div className={styles.planStepDetailSection}>
              <div className={styles.planStepDetailTitle}>输入</div>
              <StepInputFields
                collapsed={false}
                hints={hints}
                namePrefix={["planStepInputs", item.key]}
                outputSourceOptions={outputSourceOptions}
                onInputChange={onInputChange}
              />
            </div>
          ) : null}
          {outputs.length > 0 ? (
            <div className={styles.planStepDetailSection}>
              <div className={styles.planStepDetailTitle}>输出</div>
              <StepOutputHints metadata={metadata} />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

async function copyText(value: string) {
  await navigator.clipboard?.writeText(value);
}

function toPrettyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

export function StepRunStatusTag({
  status,
}: {
  status: string;
}) {
  const color =
    status === "succeeded"
      ? "success"
      : status === "running"
        ? "processing"
        : status === "failed" || status === "timed_out" || status === "cancelled"
          ? "error"
          : "warning";
  return <Tag color={color}>{status}</Tag>;
}
