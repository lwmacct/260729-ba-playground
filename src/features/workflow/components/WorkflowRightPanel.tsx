import {
  Alert,
  Button,
  Input,
  Segmented,
  Space,
  Tabs,
} from "antd";
import { WorkbenchPanel } from "@lwmacct/260627-antd-workbench";
import { useEffect, useState } from "react";
import { BrowserViewerPage } from "../../browser-viewer";
import type { ContextBaton } from "../model/types";
import { parseBaton } from "@lwmacct/260729-ba-context-baton";
import styles from "./WorkflowRightPanel.module.css";

export const RIGHT_TAB_CONTEXT = "context";
export const RIGHT_TAB_BROWSER_VIEWER = "browser-viewer";
const CONTEXT_JSON_TREE_COLLAPSED_PATHS_STORAGE_KEY =
  "workflow.contextJsonTree.collapsedPaths";

type WorkflowRightPanelProps = {
  activeKey: string;
  browserEndpoint: string;
  browserEndpointKey: string;
  context: ContextBaton;
  onChange(activeKey: string): void;
  onBrowserEndpointChange(endpoint: string): void;
  onContextApply(context: ContextBaton): void;
};

export function WorkflowRightPanel({
  activeKey,
  browserEndpoint,
  browserEndpointKey,
  context,
  onChange,
  onBrowserEndpointChange,
  onContextApply,
}: WorkflowRightPanelProps) {
  return (
    <Tabs
      activeKey={activeKey}
      className={styles.tabs}
      items={[
        {
          key: RIGHT_TAB_BROWSER_VIEWER,
          label: "浏览器画面",
          children: (
            <BrowserViewerPage
              endpoint={browserEndpoint}
              endpointEditable={false}
              endpointKey={browserEndpointKey}
              onEndpointChange={onBrowserEndpointChange}
              persistSettings={false}
              variant="embedded"
            />
          ),
        },
        {
          key: RIGHT_TAB_CONTEXT,
          label: "Context",
          children: (
            <ContextEditor
              context={context}
              onApply={onContextApply}
            />
          ),
        },
      ]}
      onChange={onChange}
    />
  );
}

function ContextEditor({
  context,
  onApply,
}: {
  context: ContextBaton;
  onApply(context: ContextBaton): void;
}) {
  const [text, setText] = useState(() => toPrettyJson(context));
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"tree" | "raw">("tree");
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(
    readStoredCollapsedJsonTreePaths,
  );

  useEffect(() => {
    setText(toPrettyJson(context));
    setError("");
  }, [context]);

  function updateCollapsedPaths(nextPaths: Set<string>) {
    setCollapsedPaths(nextPaths);
    writeStoredCollapsedJsonTreePaths(nextPaths);
  }

  function applyContext() {
    try {
      const parsed = JSON.parse(text) as unknown;
      const nextContext = normalizeEditableContext(parsed);
      onApply(nextContext);
      setText(toPrettyJson(nextContext));
      setError("");
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : String(applyError));
    }
  }

  return (
    <WorkbenchPanel className={styles.contextCard}>
      <div className={styles.toolbar}>
        <Segmented
          size="small"
          value={mode}
          options={[
            { label: "树视图", value: "tree" },
            { label: "Raw JSON", value: "raw" },
          ]}
          onChange={(value) => setMode(value as "tree" | "raw")}
        />
        {mode === "tree" ? (
          <Space size={8}>
            <Button
              size="small"
              onClick={() => {
                updateCollapsedPaths(new Set());
              }}
            >
              全部展开
            </Button>
            <Button
              size="small"
              onClick={() => {
                updateCollapsedPaths(collectJsonCollectionPaths(context));
              }}
            >
              全部折叠
            </Button>
          </Space>
        ) : (
          <Space size={8}>
            <Button
              type="primary"
              size="small"
              onClick={applyContext}
            >
              应用
            </Button>
            <Button
              size="small"
              onClick={() => {
                setText(toPrettyJson(context));
                setError("");
              }}
            >
              重置
            </Button>
          </Space>
        )}
      </div>
      {error ? (
        <Alert
          className={styles.error}
          message={error}
          type="error"
          showIcon
        />
      ) : null}
      {mode === "tree" ? (
        <div className={styles.tree}>
          <JsonTreeView
            value={context}
            collapsedPaths={collapsedPaths}
            onCollapsedPathsChange={updateCollapsedPaths}
          />
        </div>
      ) : (
        <Input.TextArea
          className={styles.textarea}
          spellCheck={false}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      )}
    </WorkbenchPanel>
  );
}

function JsonTreeView({
  value,
  collapsedPaths,
  onCollapsedPathsChange,
}: {
  value: unknown;
  collapsedPaths: Set<string>;
  onCollapsedPathsChange(paths: Set<string>): void;
}) {
  return (
    <div className={styles.treeView} role="tree" aria-label="JSON view">
      <JsonNode
        path=""
        value={value}
        collapsedPaths={collapsedPaths}
        onCollapsedPathsChange={onCollapsedPathsChange}
      />
    </div>
  );
}

function JsonNode({
  label,
  path,
  value,
  collapsedPaths,
  onCollapsedPathsChange,
}: {
  label?: string;
  path: string;
  value: unknown;
  collapsedPaths: Set<string>;
  onCollapsedPathsChange(paths: Set<string>): void;
}) {
  if (Array.isArray(value)) {
    return (
      <JsonCollectionNode
        label={label}
        path={path}
        value={value}
        type="array"
        collapsedPaths={collapsedPaths}
        onCollapsedPathsChange={onCollapsedPathsChange}
      />
    );
  }
  if (isPlainJsonObject(value)) {
    return (
      <JsonCollectionNode
        label={label}
        path={path}
        value={value}
        type="object"
        collapsedPaths={collapsedPaths}
        onCollapsedPathsChange={onCollapsedPathsChange}
      />
    );
  }
  return (
    <div className={styles.treeRow} role="treeitem">
      {label === undefined ? null : <JsonLabel label={label} />}
      <JsonPrimitiveValue value={value} />
    </div>
  );
}

function JsonCollectionNode({
  label,
  path,
  value,
  type,
  collapsedPaths,
  onCollapsedPathsChange,
}: {
  label?: string;
  path: string;
  value: unknown[] | Record<string, unknown>;
  type: "array" | "object";
  collapsedPaths: Set<string>;
  onCollapsedPathsChange(paths: Set<string>): void;
}) {
  const expanded = !collapsedPaths.has(path);
  const entries = Array.isArray(value)
    ? value.map((entry, index) => [String(index), entry] as const)
    : Object.entries(value);
  const open = type === "array" ? "[" : "{";
  const close = type === "array" ? "]" : "}";

  return (
    <div className={styles.treeRow} role="treeitem" aria-expanded={expanded}>
      <button
        type="button"
        className={styles.treeToggle}
        aria-label={expanded ? "折叠 JSON 节点" : "展开 JSON 节点"}
        onClick={() => {
          const nextPaths = new Set(collapsedPaths);
          if (expanded) {
            nextPaths.add(path);
          } else {
            nextPaths.delete(path);
          }
          onCollapsedPathsChange(nextPaths);
        }}
      >
        {expanded ? "\u25BE" : "\u25B8"}
      </button>
      {label === undefined ? null : <JsonLabel label={label} />}
      <span className={styles.treePunctuation}>{open}</span>
      <span className={styles.treeCount}>
        {entries.length}
        {type === "array" ? " 项" : " 键"}
      </span>
      {expanded ? null : (
        <>
          <span className={styles.treeCollapsedContent}>...</span>
          <span className={styles.treePunctuation}>{close}</span>
        </>
      )}
      {expanded ? (
        <>
          <div className={styles.treeChildren} role="group">
            {entries.map(([entryLabel, entryValue]) => (
              <JsonNode
                key={entryLabel}
                label={entryLabel}
                path={joinJsonTreePath(path, entryLabel)}
                value={entryValue}
                collapsedPaths={collapsedPaths}
                onCollapsedPathsChange={onCollapsedPathsChange}
              />
            ))}
          </div>
          <span className={styles.treePunctuation}>{close}</span>
        </>
      ) : null}
    </div>
  );
}

function JsonLabel({ label }: { label: string }) {
  return (
    <>
      <span className={styles.treeLabel}>{label}</span>
      <span className={styles.treePunctuation}>: </span>
    </>
  );
}

function JsonPrimitiveValue({ value }: { value: unknown }) {
  if (value === null) {
    return <span className={` `}>null</span>;
  }
  if (typeof value === "string") {
    return (
      <span className={` `}>
        {JSON.stringify(value)}
      </span>
    );
  }
  if (typeof value === "number") {
    return <span className={` `}>{value}</span>;
  }
  if (typeof value === "boolean") {
    return (
      <span className={` `}>
        {String(value)}
      </span>
    );
  }
  return (
    <span className={styles.treeValue}>
      {formatUnknownJsonValue(value)}
    </span>
  );
}

function isPlainJsonObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function collectJsonCollectionPaths(value: unknown, path = "") {
  const paths = new Set<string>();
  collectJsonCollectionPathsInto(value, path, paths);
  return paths;
}

function collectJsonCollectionPathsInto(
  value: unknown,
  path: string,
  paths: Set<string>,
) {
  if (Array.isArray(value)) {
    paths.add(path);
    value.forEach((entry, index) => {
      collectJsonCollectionPathsInto(entry, joinJsonTreePath(path, String(index)), paths);
    });
    return;
  }
  if (!isPlainJsonObject(value)) {
    return;
  }
  paths.add(path);
  Object.entries(value).forEach(([key, entry]) => {
    collectJsonCollectionPathsInto(entry, joinJsonTreePath(path, key), paths);
  });
}

function joinJsonTreePath(parent: string, key: string) {
  return `${parent}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`;
}

function readStoredCollapsedJsonTreePaths() {
  try {
    const raw = window.localStorage.getItem(
      CONTEXT_JSON_TREE_COLLAPSED_PATHS_STORAGE_KEY,
    );
    if (!raw) {
      return new Set<string>();
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return new Set<string>();
    }
    return new Set(parsed.filter((path): path is string => typeof path === "string"));
  } catch {
    return new Set<string>();
  }
}

function writeStoredCollapsedJsonTreePaths(paths: Set<string>) {
  if (paths.size === 0) {
    window.localStorage.removeItem(CONTEXT_JSON_TREE_COLLAPSED_PATHS_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(
    CONTEXT_JSON_TREE_COLLAPSED_PATHS_STORAGE_KEY,
    JSON.stringify([...paths].sort()),
  );
}

function formatUnknownJsonValue(value: unknown) {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function normalizeEditableContext(value: unknown): ContextBaton {
  return parseBaton(value);
}

function toPrettyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}
