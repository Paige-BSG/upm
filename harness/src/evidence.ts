import { sha256Canonical } from "./canonical.ts";
import type { EvidenceBundle } from "./types.ts";

export function evidenceDigest(bundle: EvidenceBundle): string {
  return sha256Canonical(bundle);
}

export function restoreMatchesBackup(bundle: EvidenceBundle): boolean {
  return (
    bundle.backupDataDigest === bundle.restoreDataDigest &&
    bundle.sourceNamespace !== bundle.restoreNamespace &&
    (bundle.postBackupWriteDigest === null ||
      bundle.postBackupWriteDigest !== bundle.restoreDataDigest)
  );
}

export function verifyEvidenceOffline(
  bundle: EvidenceBundle,
  expectedDigest: string,
): boolean {
  return evidenceDigest(bundle) === expectedDigest && restoreMatchesBackup(bundle);
}
