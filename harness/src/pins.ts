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
  {
    id: "pi-agent-core",
    admission: PIN_ADMITTED,
    candidate: "npm:@earendil-works/pi-agent-core@0.84.3",
    digest: "sha512-VURr+xBRl3RxYcw3kT9Pn3yfi6LbRoCJgHF7h1mAblMjtLNV/MfG/RyF0uJizBAM886AEakSiw3j9c/aSngppg==",
  },
  {
    id: "pi-ai",
    admission: PIN_ADMITTED,
    candidate: "npm:@earendil-works/pi-ai@0.84.3",
    digest: "sha512-M0YUV8vNO3y2WwWSyY8ijKJV5W4gkSUixuvk+Z00ZBjsyMfsdXfITsHEwP1UIf09YRWXT6oGn0GlCamt+P32XQ==",
  },
  {
    id: "kubernetes-client-node",
    admission: PIN_ADMITTED,
    candidate: "npm:@kubernetes/client-node@2.0.0",
    digest: "gitHead:f72cc23ed378cb8e7f09129ee6e55aa531a2b9ba",
  },
  {
    id: "percona-server-mysql-operator",
    admission: PIN_ADMITTED,
    candidate: "v1.2.0",
    digest: "sha256:e2a7fef0f5af08d378d8ce49627f062a5c85b6d8e9d6b5b44369a0b8490b8b70",
  },
  {
    id: "percona-server-mysql-operator-image-arm64",
    admission: PIN_ADMITTED,
    candidate: "percona/percona-server-mysql-operator:1.2.0",
    digest: "sha256:e0dd1e6bf1fd90b2149290500997ee791101f4500b5162bcea5694b1b9d7ab58",
  },
  {
    id: "percona-server-mysql-image-arm64",
    admission: PIN_ADMITTED,
    candidate: "percona/percona-server:8.4.10-10.1",
    digest: "sha256:70f6c4d01b5807737cdd423ab32af1feb1d00513b5420a84361773b167aeca87",
  },
  {
    id: "percona-xtrabackup-image-arm64",
    admission: PIN_ADMITTED,
    candidate: "percona/percona-xtrabackup:8.4.0-6.1",
    digest: "sha256:d135aadaae9e2f947cb2002f982f7b4c6e177b1c7e3d543ef7795aea999feedd",
  },
  {
    id: "minio-image",
    admission: PIN_PENDING,
    candidate: "AGPL-3.0 test S3 endpoint only",
    digest: null,
  },
  {
    id: "percona-server-spdx",
    admission: PIN_PENDING,
    candidate: "NOASSERTION",
    digest: null,
  },
];

export function integrationPinsReady(pins: readonly StartupPin[] = STARTUP_PINS): boolean {
  return pins.every((pin) => pin.admission === PIN_ADMITTED && typeof pin.digest === "string" && pin.digest.length > 0);
}
