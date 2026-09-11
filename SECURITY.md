# Security Policy

## Supported Versions

Only the latest active major/minor release receive critical security updates.

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

We take the security of OpsPilot Automation and its microservices seriously. If you discover a vulnerability or security boundary flaw:

1. **Do not create a public GitHub issue.**
2. Send an email to the security team or open a confidential Security Advisory on GitHub.
3. Include detailed steps to reproduce, affected services/endpoints, and potential impact.
4. We will acknowledge receipt within 48 hours and provide an estimated timeline for remediation.

## Core Security Requirements

- **Production Secret Isolation**: Production environments must provide high-entropy, unique secrets for `JWT_SECRET` and `INTERNAL_API_SHARED_SECRET`. Default or fallback keys are strictly rejected at startup.
- **Machine-to-Machine Isolation**: Internal service-to-service communication must use dedicated `INTERNAL_API_SHARED_SECRET` headers and constant-time comparison (`timingSafeEqual`). Under no circumstances should internal endpoints accept user JWT secrets in production.
- **TLS Verification**: All external outbound integrations (including SMTP and IMAP) enforce TLS certificate verification (`rejectUnauthorized: true`). Disabling verification is only permissible via explicit configuration for designated self-signed internal endpoints.
- **Storage Fail-Closed**: In production environments, object storage uploads (MinIO/S3/OSS) operate under a fail-closed model. Transient storage failures will reject the upload rather than silently falling back to single-node local disk.
- **CORS Restrictions**: Cross-origin resource sharing is restricted to explicit white-listed origins configured via `CORS_ORIGIN` or `CORS_ALLOWED_ORIGINS`. Wildcard reflection with credentials enabled is prohibited.
