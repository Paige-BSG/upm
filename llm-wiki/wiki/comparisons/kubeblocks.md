# KubeBlocks — comparison baseline

**COMPARISON BASELINE** — UPM does not use KubeBlocks as a dependency. It is the public
project this repository compares against when talking about open-source data-service
ops. This page records the **factual** OSS / Enterprise boundary from first-party vendor
sources; it deliberately does not editorialize the vendor's business model.

## Primary sources

- [kubeblocks-home](sources/kubeblocks-home.md) — vendor home (`https://kubeblocks.io/`).
- [kubeblocks-openshift](sources/kubeblocks-openshift.md) — first-party deploy post on
  OpenShift (`https://kubeblocks.io/blog/deploy-kubeblocks-on-openshift`).

## The boundary (as the vendor lists it)

- **Open Source** — the control plane and Day-2 operations, with official user
  documentation.
- **Enterprise (separate commercial layer)** — management console; multi-tenancy and
  security auditing; additional commercial database engines (e.g. Oracle, SQL Server);
  cross-region disaster recovery and observability.

## How UPM uses this

- KubeBlocks appears in UPM's public docs only as a **neutral comparison baseline**: a
  well-known open-source project in the same space. Its tiered model is stated as a fact,
  not as a criticism.
- UPM is an **AI-native** data-service ops control plane, not a KubeBlocks redeployment.
  The relationship is comparative, not derivative.

## Boundaries

- Not UPM tech stack. Not a dependency.
- The two records fingerprint the vendor site + blog; the underlying repository's license
  is declared upstream and is not re-asserted here.
