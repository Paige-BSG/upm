import { generateKeyPairSync, sign, verify } from "node:crypto";
import { canonicalize } from "./rfc8785.ts";
import { APPROVAL_TTL_MS, SPEC_P1_APPROVAL_ED25519, SPEC_P1_EVIDENCE_SIGN, type ApprovalEnvelope } from "./types.ts";

void SPEC_P1_APPROVAL_ED25519;
void SPEC_P1_EVIDENCE_SIGN;

export type Ed25519Key = {
  keyId: string;
  publicKeyPem: string;
  privateKeyPem: string;
};

export function generateEd25519(keyId: string): Ed25519Key {
  const pair = generateKeyPairSync("ed25519");
  return {
    keyId,
    publicKeyPem: pair.publicKey.export({ type: "spki", format: "pem" }).toString(),
    privateKeyPem: pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
}

export function signCanonical(privateKeyPem: string, payload: unknown): string {
  return sign(null, Buffer.from(canonicalize(payload), "utf8"), privateKeyPem).toString("base64");
}

export function verifyCanonical(publicKeyPem: string, payload: unknown, signature: string): boolean {
  return verify(null, Buffer.from(canonicalize(payload), "utf8"), publicKeyPem, Buffer.from(signature, "base64"));
}

export function approvalPayload(envelope: Omit<ApprovalEnvelope, "signature">): Omit<ApprovalEnvelope, "signature"> {
  return envelope;
}

export function signApproval(
  key: Ed25519Key,
  fields: Omit<ApprovalEnvelope, "keyId" | "signature">,
): ApprovalEnvelope {
  const unsigned = { ...fields, keyId: key.keyId };
  return { ...unsigned, signature: signCanonical(key.privateKeyPem, unsigned) };
}

export function approvalFresh(envelope: ApprovalEnvelope, nowMs: number): boolean {
  return envelope.expiresAt - envelope.issuedAt <= APPROVAL_TTL_MS && nowMs <= envelope.expiresAt && nowMs >= envelope.issuedAt;
}
