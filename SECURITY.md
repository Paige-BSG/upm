# Security policy

UPM is an open-source project. Security is a shared responsibility with the
maintainer and the community; the current security contact is the project maintainer.
Use this page if you believe you've found a vulnerability.

## Reporting a vulnerability

**Do not open a public issue or pull request for a security vulnerability.** It
would disclose the issue before it's fixed.

Instead, report it privately through GitHub Private Vulnerability Reporting:

- Submit a private report: <https://github.com/Paige-BSG/upm/security/advisories/new>
- Advisories page: <https://github.com/Paige-BSG/upm/security/advisories>

This is a private intake: the report is not publicly visible until you and the maintainer
make it so. Include:

- What the problem is and where it lives (repository, file, function).
- How to reproduce it, including the version affected.
- Any proof-of-concept if you have one.
- Whether the issue is already public.

You will get a reply within a few business days. Once fixed and released, the fix is
credited in the release notes.

## Scope

This policy applies to the UPM source code, documentation, and any released artifacts.
Please report:

- Remote code execution, privilege escalation, or injection vulnerabilities.
- Broken authentication or authorization.
- Secret, credential, or data exposure.
- Supply-chain issues (malicious dependency, tampered release artifact).

## What is not a security issue

- Open questions about intended behavior.
- Missing documentation.
- A dependency's own upstream vulnerability once a fix is tracked upstream — report it
  there first.

## Public-safety rule for this repository

This public repo is for source, docs, decisions, and release evidence. It must **never**
contain credentials, customer data, internal conversations, or undisclosed commercial
information. If you find any secret or credential committed here, treat it as a
security incident and report it rather than spreading it.
