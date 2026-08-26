import { journalName } from "./names.ts";
import { sha256Canonical } from "./rfc8785.ts";
import { admitJournalEvent } from "./schema.ts";
import {
  CONTROL_NAMESPACE,
  SCHEMA_VERSION,
  SPEC_P1_JOURNAL_CHAIN,
  SPEC_P1_RESUME_OR_BLOCKED,
  type DenialCode,
  type JournalEvent,
  type JournalEventType,
  type JournalPhase,
} from "./types.ts";
import { FakeK8s, type CrObject } from "./fake-k8s.ts";
import type { Actor } from "./types.ts";

void SPEC_P1_JOURNAL_CHAIN;
void SPEC_P1_RESUME_OR_BLOCKED;

const NEXT: Record<JournalPhase, readonly JournalEventType[]> = {
  empty: ["IntentAccepted"],
  intent: ["ApprovalConsumed"],
  approved: ["FenceWriteAhead"],
  fence_wa: ["FenceSet"],
  fenced: ["BackupWriteAhead"],
  backup_wa: ["BackupCreated"],
  backed_up: ["SetBWriteAhead"],
  setb_wa: ["SetBApplied"],
  setb_applied: ["RestoreWriteAhead"],
  restore_wa: ["RestoreClusterCreated"],
  restore_cluster: ["RestoreCreated"],
  restored: ["FenceReleaseWriteAhead"],
  fence_rel_wa: ["EvidenceClosed", "FenceReleaseBlocked"],
  closed: [],
  fence_blocked: [],
  blocked: [],
};

export function eventDigest(event: Omit<JournalEvent, "eventDigest"> & { eventDigest?: string }): string {
  const { eventDigest: _ignored, ...rest } = event;
  return sha256Canonical(rest);
}

export function replayJournal(events: JournalEvent[]): JournalEvent[] {
  let previous: string | null = null;
  let lastSequence = 0;
  for (const event of events) {
    admitJournalEvent(event);
    if (event.sequence !== lastSequence + 1) {
      throw new Error("BLOCKED");
    }
    if (event.previousEventDigest !== previous) {
      throw new Error("BLOCKED");
    }
    if (eventDigest(event) !== event.eventDigest) {
      throw new Error("BLOCKED");
    }
    lastSequence = event.sequence;
    previous = event.eventDigest;
  }
  return events;
}

export function reduceJournal(events: JournalEvent[]): JournalPhase {
  replayJournal(events);
  let phase: JournalPhase = "empty";
  for (const event of events) {
    if (!NEXT[phase].includes(event.type)) {
      throw new Error("BLOCKED");
    }
    if (event.type === "IntentAccepted") {
      phase = "intent";
    } else if (event.type === "ApprovalConsumed") {
      phase = "approved";
    } else if (event.type === "FenceWriteAhead") {
      phase = "fence_wa";
    } else if (event.type === "FenceSet") {
      phase = "fenced";
    } else if (event.type === "BackupWriteAhead") {
      phase = "backup_wa";
    } else if (event.type === "BackupCreated") {
      phase = "backed_up";
    } else if (event.type === "SetBWriteAhead") {
      phase = "setb_wa";
    } else if (event.type === "SetBApplied") {
      phase = "setb_applied";
    } else if (event.type === "RestoreWriteAhead") {
      phase = "restore_wa";
    } else if (event.type === "RestoreClusterCreated") {
      phase = "restore_cluster";
    } else if (event.type === "RestoreCreated") {
      phase = "restored";
    } else if (event.type === "FenceReleaseWriteAhead") {
      phase = "fence_rel_wa";
    } else if (event.type === "EvidenceClosed") {
      phase = "closed";
    } else if (event.type === "FenceReleaseBlocked") {
      phase = "fence_blocked";
    } else {
      throw new Error("BLOCKED");
    }
  }
  return phase;
}

export function closedVerdict(events: JournalEvent[]): {
  denial: DenialCode | null;
  evidenceDigest: string | null;
  signature: string | null;
} {
  const closed = events.find((event) => event.type === "EvidenceClosed" || event.type === "FenceReleaseBlocked");
  if (!closed) {
    return { denial: null, evidenceDigest: null, signature: null };
  }
  if (closed.type === "FenceReleaseBlocked") {
    return { denial: "FENCE_RELEASE_BLOCKED", evidenceDigest: null, signature: null };
  }
  const denial = closed.payload.verdict === "OK" ? null : (closed.payload.verdict as DenialCode);
  return {
    denial,
    evidenceDigest: closed.payload.evidenceDigest ?? null,
    signature: closed.payload.signature ?? null,
  };
}

export function appendEvent(
  cluster: FakeK8s,
  actor: Actor,
  operationId: string,
  type: JournalEventType,
  payload: Record<string, string>,
): JournalEvent {
  if (!cluster.leaseLive(actor.actorId)) {
    throw new Error("LEASE_CONTENDED");
  }
  cluster.renewLease(actor, actor.actorId);
  const existing = cluster.listJournal(actor).filter((event) => event.operationId === operationId);
  const phase = reduceJournal(existing);
  if (!NEXT[phase].includes(type)) {
    throw new Error("BLOCKED");
  }
  const previousEventDigest = existing.length === 0 ? null : existing[existing.length - 1]!.eventDigest;
  const sequence = existing.length + 1;
  const unsigned: Omit<JournalEvent, "eventDigest"> = {
    schemaVersion: SCHEMA_VERSION,
    operationId,
    sequence,
    type,
    previousEventDigest,
    payload,
  };
  const event: JournalEvent = { ...unsigned, eventDigest: eventDigest(unsigned) };
  const object: CrObject = {
    kind: "ConfigMap",
    namespace: CONTROL_NAMESPACE,
    name: journalName(operationId, sequence),
    uid: `${operationId}-${sequence}`,
    generation: 1,
    resourceVersion: "1",
    immutable: true,
    annotations: {},
    specDigest: event.eventDigest,
    spec: { type },
    event,
  };
  cluster.create(actor, object);
  return event;
}
