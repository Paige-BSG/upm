import type { OperationRecord } from "./types.ts";

export class MemoryOperationStore {
  private readonly records = new Map<string, OperationRecord>();

  get(operationId: string): OperationRecord | undefined {
    return this.records.get(operationId);
  }

  putIfAbsent(record: OperationRecord): OperationRecord {
    const existing = this.records.get(record.operationId);
    if (existing) {
      return existing;
    }
    this.records.set(record.operationId, record);
    return record;
  }

  replace(record: OperationRecord): void {
    this.records.set(record.operationId, record);
  }
}
