# Changelog

## v0.3.0 — ZeroDrop Online (2026-11-14)

- New stand-alone cloud-deployable Node.js server + mobile/desktop responsive website.
- Secure temporary room codes and PIN pairing, owner and guest sessions.
- Upload/download files from separate internet connections through a hosting server.
- QR code generation with fully vendored, third-party licensed QR library (no API/third-party CDN).
- File expiration, room creation limits, download authorization, quota accounting and admin session invalidation on PIN rotation.
- Create-key protection for room creation, copyable invite links, upload progress, file list, and owner controls.
- Dockerfile, Railway deployment config, optional Render blueprint, unit/API tests and CI.

This online variant is separate from ZeroDrop LAN Web v0.2 and does not reuse its LAN-only Python server.
