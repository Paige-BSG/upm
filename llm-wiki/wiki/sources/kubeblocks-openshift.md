# KubeBlocks on OpenShift deploy blog — source summary

**COMPARISON BASELINE** — a first-party vendor post describing how KubeBlocks is deployed
on OpenShift and what the Enterprise tier adds.

- Raw record: `llm-wiki/raw/sources/kubeblocks-openshift/891acb798eee5dfaa351501b1c9274dd5acd0dcad0ed1f98efdcb93bb6c06ca0.json`.
- Upstream: <https://kubeblocks.io/blog/deploy-kubeblocks-on-openshift>.

## What it is

A first-party blog post on deploying KubeBlocks on OpenShift. It enumerates the **Open
Source** package (unified control plane, Day-2 operations, official user documentation)
and the **Enterprise** package as a separate commercial layer (management console,
multi-tenancy + security auditing, additional commercial database engines such as Oracle
and SQL Server, and cross-region DR & observability).

## Notes

- The post is dynamic; the record carries a timezone-aware `retrievedAt` and the ETag
  from that fetch.
- This is the primary first-hand source for the neutral OSS / Enterprise boundary used in
  the [KubeBlocks comparison](comparisons/kubeblocks.md). It records what the vendor
  lists in each tier; it does not assert a value judgment about the vendor's model.
