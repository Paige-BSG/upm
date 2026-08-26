export const PIN_PENDING = "PENDING" as const;
export const PIN_ADMITTED = "ADMITTED" as const;

export type PinAdmission = typeof PIN_PENDING | typeof PIN_ADMITTED;

export type StartupPin = {
  id: string;
  admission: PinAdmission;
  candidate: string | null;
  digest: string | null;
};

export const STARTUP_PINS: readonly StartupPin[] = [
  { id: "pi-agent-core", admission: PIN_PENDING, candidate: null, digest: null },
  { id: "pi-ai", admission: PIN_PENDING, candidate: null, digest: null },
  { id: "kubernetes-client-node", admission: PIN_PENDING, candidate: null, digest: null },
  {
    id: "percona-server-mysql-operator",
    admission: PIN_PENDING,
    candidate: "v1.2.0",
    digest: null,
  },
  {
    id: "percona-server-mysql",
    admission: PIN_PENDING,
    candidate: "8.4.10-10.1",
    digest: null,
  },
  { id: "percona-xtrabackup", admission: PIN_PENDING, candidate: null, digest: null },
  { id: "minio", admission: PIN_PENDING, candidate: null, digest: null },
];

export function pinsAdmitted(pins: readonly StartupPin[] = STARTUP_PINS): boolean {
  return pins.every(
    (pin) => pin.admission === PIN_ADMITTED && typeof pin.digest === "string" && pin.digest.length > 0,
  );
}

export function assertIntegrationPins(pins: readonly StartupPin[] = STARTUP_PINS): void {
  if (!pinsAdmitted(pins)) {
    const error = new Error("INTEGRATION_PINS_PENDING");
    error.name = "INTEGRATION_PINS_PENDING";
    throw error;
  }
}
