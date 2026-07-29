import Dexie, { type Table } from "dexie";
import { deriveBatonStatus, parseBaton } from "@lwmacct/260729-ba-context-baton";
import type { ContextBaton } from "@lwmacct/260729-ba-context-baton";

const WORKFLOW_CONTEXT_DB_NAME = "workflow-console-v2";

export type WorkflowContextMeta = Record<string, unknown>;

export type WorkflowContextRecord = {
  id: string;
  workflow: string;
  title?: string;
  status: string;
  baton: ContextBaton;
  meta: WorkflowContextMeta;
  revision: number;
  created_at?: string;
  updated_at?: string;
};

type StoredWorkflowContextRecord = WorkflowContextRecord & {
  account?: string;
  siteCode?: string;
};

type WorkflowContextInput = {
  title?: string;
  baton: ContextBaton;
  meta?: WorkflowContextMeta;
};

type WorkflowContextImportDefaults = {
  title?: string;
  meta?: WorkflowContextMeta;
};

class WorkflowContextDb extends Dexie {
  workflowContexts!: Table<StoredWorkflowContextRecord, string>;

  constructor() {
    super(WORKFLOW_CONTEXT_DB_NAME);
    this.version(1).stores({
      workflowContexts:
        "id, workflow, status, siteCode, account, updated_at, created_at, [workflow+updated_at], [workflow+status]",
    });
  }
}

const db = new WorkflowContextDb();

function nowIso() {
  return new Date().toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getMetaString(meta: WorkflowContextMeta, key: string) {
  const value = meta[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function sanitizeMeta(meta: WorkflowContextMeta = {}) {
  const { graph: _graph, ...nextMeta } = meta;
  return nextMeta;
}

function toStoredRecord(
  input: WorkflowContextInput,
  previous?: StoredWorkflowContextRecord,
): StoredWorkflowContextRecord {
  const timestamp = nowIso();
  const baton = parseBaton(input.baton);
  const meta = sanitizeMeta(input.meta);
  return {
    id: baton.id,
    workflow: baton.workflow.id,
    title: input.title?.trim() || baton.workflow.id,
    status: deriveBatonStatus(baton),
    baton,
    meta,
    revision: baton.revision,
    created_at: previous?.created_at ?? timestamp,
    updated_at: timestamp,
    account: getMetaString(meta, "account"),
    siteCode: getMetaString(meta, "siteCode"),
  };
}

function toResponseRecord(record: StoredWorkflowContextRecord): WorkflowContextRecord {
  const { account: _account, siteCode: _siteCode, ...response } = record;
  return response;
}

export async function createWorkflowContext(input: WorkflowContextInput) {
  const record = toStoredRecord(input);
  await db.workflowContexts.add(record);
  return toResponseRecord(record);
}

export async function listWorkflowContexts(
  input: {
    workflow?: string;
    status?: string;
    siteCode?: string;
    limit?: number;
  } = {},
) {
  const records = await db.workflowContexts.orderBy("updated_at").reverse().toArray();
  const filtered = records.filter((record) =>
    (!input.workflow || record.workflow === input.workflow) &&
    (!input.status || record.status === input.status) &&
    (!input.siteCode || record.siteCode === input.siteCode)
  );
  return {
    data: (input.limit && input.limit > 0 ? filtered.slice(0, input.limit) : filtered)
      .map(toResponseRecord),
  };
}

export async function fetchWorkflowContext(id: string) {
  const record = await db.workflowContexts.get(id);
  if (!record) {
    throw new Error("workflow context not found");
  }
  return toResponseRecord(record);
}

export async function saveWorkflowContext(id: string, input: WorkflowContextInput) {
  const previous = await db.workflowContexts.get(id);
  if (!previous) {
    throw new Error("workflow context not found");
  }
  const record = toStoredRecord(input, previous);
  if (record.id !== id) {
    throw new Error("Baton id cannot change while saving a context.");
  }
  await db.workflowContexts.put(record);
  return toResponseRecord(record);
}

export async function deleteWorkflowContext(id: string) {
  await db.workflowContexts.delete(id);
}

function normalizeImportedRecords(
  payload: unknown,
  defaults: WorkflowContextImportDefaults,
): WorkflowContextInput[] {
  if (isRecord(payload) && Array.isArray(payload.data)) {
    return payload.data.flatMap((item) => normalizeImportedRecords(item, defaults));
  }
  if (Array.isArray(payload)) {
    return payload.flatMap((item) => normalizeImportedRecords(item, defaults));
  }
  if (isRecord(payload) && "baton" in payload) {
    return [{
      baton: parseBaton(payload.baton),
      title: typeof payload.title === "string" ? payload.title : defaults.title,
      meta: {
        ...defaults.meta,
        ...(isRecord(payload.meta) ? payload.meta : {}),
      },
    }];
  }
  return [{ baton: parseBaton(payload), title: defaults.title, meta: defaults.meta }];
}

export async function importWorkflowContexts(
  payload: unknown,
  defaults: WorkflowContextImportDefaults,
) {
  const inputs = normalizeImportedRecords(payload, defaults);
  const saved: WorkflowContextRecord[] = [];
  await db.transaction("rw", db.workflowContexts, async () => {
    for (const input of inputs) {
      const previous = await db.workflowContexts.get(input.baton.id);
      const record = toStoredRecord(input, previous);
      await db.workflowContexts.put(record);
      saved.push(toResponseRecord(record));
    }
  });
  return { data: saved };
}

export async function clearWorkflowContextStoreForTest() {
  await db.workflowContexts.clear();
}
