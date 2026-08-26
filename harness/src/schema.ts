import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { computeFactsDigest } from "./plan-hash.ts";
import {
  API_VERSION,
  BACKUP_PROOF_KIND,
  JOURNAL_EVENT_TYPES,
  PHASE1_ACTIONS,
  PHASE1_DESTINATION_PREFIX,
  PHASE1_POLICY,
  PHASE1_RISK,
  PHASE1_STOP,
  SCHEMA_VERSION,
  type ApprovalEnvelope,
  type BackupProofRequest,
  type EvidenceManifest,
  type JournalEvent,
  type JournalEventType,
  type PlanDocument,
} from "./types.ts";

type JsonSchema = {
  type?: string;
  const?: unknown;
  enum?: unknown[];
  required?: string[];
  additionalProperties?: boolean | JsonSchema;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  minItems?: number;
  minLength?: number;
  minimum?: number;
  exclusiveMinimum?: number;
  $ref?: string;
};

const specDir = join(dirname(fileURLToPath(import.meta.url)), "..", "spec", "jsonschema");

function loadSchema(name: string): JsonSchema {
  return JSON.parse(readFileSync(join(specDir, name), "utf8")) as JsonSchema;
}

export const PLAN_SCHEMA = loadSchema("plan.schema.json");
export const APPROVAL_SCHEMA = loadSchema("approval.schema.json");
export const REQUEST_SCHEMA = loadSchema("request.schema.json");
export const EVIDENCE_SCHEMA = loadSchema("evidence.schema.json");
export const JOURNAL_EVENT_SCHEMA = loadSchema("journal-event.schema.json");

const REFS: Record<string, JsonSchema> = {
  "plan.json": PLAN_SCHEMA,
  "approval.json": APPROVAL_SCHEMA,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolve(schema: JsonSchema): JsonSchema {
  if (schema.$ref) {
    const name = schema.$ref.split("/").pop();
    const found = name ? REFS[name] : undefined;
    if (!found) {
      throw new Error("SCHEMA");
    }
    return found;
  }
  return schema;
}

export function validateSchema(schema: JsonSchema, value: unknown): boolean {
  const resolved = resolve(schema);
  if (resolved.const !== undefined) {
    return value === resolved.const;
  }
  if (resolved.enum) {
    if (!resolved.enum.includes(value)) {
      return false;
    }
    if (resolved.type === undefined) {
      return true;
    }
  }
  if (resolved.type === "string") {
    return typeof value === "string" && (resolved.minLength === undefined || value.length >= resolved.minLength);
  }
  if (resolved.type === "boolean") {
    return typeof value === "boolean";
  }
  if (resolved.type === "number" || resolved.type === "integer") {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return false;
    }
    if (resolved.type === "integer" && !Number.isInteger(value)) {
      return false;
    }
    if (resolved.minimum !== undefined && value < resolved.minimum) {
      return false;
    }
    if (resolved.exclusiveMinimum !== undefined && value <= resolved.exclusiveMinimum) {
      return false;
    }
    return true;
  }
  if (resolved.type === "array") {
    if (!Array.isArray(value)) {
      return false;
    }
    if (resolved.minItems !== undefined && value.length < resolved.minItems) {
      return false;
    }
    return resolved.items ? value.every((item) => validateSchema(resolved.items as JsonSchema, item)) : true;
  }
  if (resolved.type === "object") {
    if (!isRecord(value)) {
      return false;
    }
    if (resolved.required && resolved.required.some((key) => !(key in value))) {
      return false;
    }
    const props = resolved.properties ?? {};
    for (const key of Object.keys(value)) {
      if (props[key]) {
        if (!validateSchema(props[key], value[key])) {
          return false;
        }
      } else if (resolved.additionalProperties === false) {
        return false;
      } else if (typeof resolved.additionalProperties === "object") {
        if (!validateSchema(resolved.additionalProperties, value[key])) {
          return false;
        }
      }
    }
    return true;
  }
  return false;
}

function admit<T>(schema: JsonSchema, value: unknown): T {
  if (!validateSchema(schema, value)) {
    throw new Error("SCHEMA");
  }
  return value as T;
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

export function admitPlan(value: unknown): PlanDocument {
  const plan = admit<PlanDocument>(PLAN_SCHEMA, value);
  if (plan.target.namespace !== plan.targetNamespace) {
    throw new Error("SCHEMA");
  }
  if (!sameStrings(plan.actions, PHASE1_ACTIONS)) {
    throw new Error("SCHEMA");
  }
  if (plan.risk !== PHASE1_RISK) {
    throw new Error("SCHEMA");
  }
  if (plan.approvalPolicyVersion !== PHASE1_POLICY) {
    throw new Error("SCHEMA");
  }
  if (!sameStrings(plan.stopConditions, PHASE1_STOP)) {
    throw new Error("SCHEMA");
  }
  if (!plan.artifactDestination.startsWith(PHASE1_DESTINATION_PREFIX)) {
    throw new Error("SCHEMA");
  }
  if (plan.factsDigest !== computeFactsDigest(plan)) {
    throw new Error("SCHEMA");
  }
  return plan;
}

export function admitJournalEvent(value: unknown): JournalEvent {
  if (!isRecord(value)) {
    throw new Error("SCHEMA");
  }
  if (value.schemaVersion !== SCHEMA_VERSION) {
    throw new Error("SCHEMA");
  }
  if (typeof value.operationId !== "string" || value.operationId.length < 1) {
    throw new Error("SCHEMA");
  }
  if (typeof value.sequence !== "number" || !Number.isInteger(value.sequence) || value.sequence < 1) {
    throw new Error("SCHEMA");
  }
  if (!JOURNAL_EVENT_TYPES.includes(value.type as JournalEventType)) {
    throw new Error("SCHEMA");
  }
  if (value.previousEventDigest !== null && (typeof value.previousEventDigest !== "string" || value.previousEventDigest.length < 1)) {
    throw new Error("SCHEMA");
  }
  if (typeof value.eventDigest !== "string" || value.eventDigest.length < 1) {
    throw new Error("SCHEMA");
  }
  if (!isRecord(value.payload)) {
    throw new Error("SCHEMA");
  }
  for (const item of Object.values(value.payload)) {
    if (typeof item !== "string" || item.length < 1) {
      throw new Error("SCHEMA");
    }
  }
  if (value.previousEventDigest !== null && !validateSchema(JOURNAL_EVENT_SCHEMA, value)) {
    throw new Error("SCHEMA");
  }
  return value as JournalEvent;
}

export function admitApproval(value: unknown): ApprovalEnvelope {
  return admit<ApprovalEnvelope>(APPROVAL_SCHEMA, value);
}

export function admitRequest(value: unknown): BackupProofRequest {
  if (!validateSchema(REQUEST_SCHEMA, value) || !isRecord(value)) {
    throw new Error("SCHEMA");
  }
  const plan = admitPlan(value.plan);
  const approval = admitApproval(value.approval);
  if (value.operationId !== plan.operationId) {
    throw new Error("SCHEMA");
  }
  return {
    apiVersion: API_VERSION,
    kind: BACKUP_PROOF_KIND,
    operationId: plan.operationId,
    plan,
    planHash: value.planHash as string,
    approval,
  };
}

export function admitEvidence(value: unknown): EvidenceManifest {
  return admit<EvidenceManifest>(EVIDENCE_SCHEMA, value);
}
