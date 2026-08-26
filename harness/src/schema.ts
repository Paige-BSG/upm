import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  API_VERSION,
  BACKUP_PROOF_KIND,
  type ApprovalEnvelope,
  type BackupProofRequest,
  type EvidenceManifest,
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
  if (resolved.enum && !resolved.enum.includes(value)) {
    return false;
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

export function admitPlan(value: unknown): PlanDocument {
  const plan = admit<PlanDocument>(PLAN_SCHEMA, value);
  if (plan.target.namespace !== plan.targetNamespace) {
    throw new Error("SCHEMA");
  }
  return plan;
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
