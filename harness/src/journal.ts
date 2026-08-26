import { journalName } from "./names.ts";
import { sha256Canonical } from "./rfc8785.ts";
import {
  CONTROL_NAMESPACE,
  SCHEMA_VERSION,
  SPEC_P1_JOURNAL_CHAIN,
  SPEC_P1_RESUME_OR_BLOCKED,
  type JournalEvent,
  type JournalEventType,
} from "./types.ts";
import { FakeK8s, type CrObject } from "./fake-k8s.ts";
import type { Actor } from "./types.ts";

void SPEC_P1_JOURNAL_CHAIN;
void SPEC_P1_RESUME_OR_BLOCKED;

export function replayJournal(events: JournalEvent[]): JournalEvent[] {
  let previous: string | null = null;
  let lastSequence = 0;
  for (const event of events) {
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

export function eventDigest(event: Omit<JournalEvent, "eventDigest"> & { eventDigest?: string }): string {
  const { eventDigest: _ignored, ...rest } = event;
  return sha256Canonical(rest);
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
  const existing = cluster.listJournal().filter((event) => event.operationId === operationId);
  replayJournal(existing);
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
