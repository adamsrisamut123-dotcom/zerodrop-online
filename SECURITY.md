# Security & responsible operation

ZeroDrop Online v0.3 is a **temporary file-sharing MVP for small trusted groups**, not an audited, end-to-end encrypted production service.

## Protection included

- HTTPS is supplied by the hosting provider's public endpoint; no extra client setup.
- Unpredictable 8-character room codes, independent 6-digit PIN, random bearer access tokens.
- Role-based permissions; guests cannot remove files or close rooms.
- Short expiry; host can rotate the PIN and invalidate guests.
- Server-enforced per-file, room, server-wide storage and file-count limits.
- IP-based throttling, max active rooms, no directory traversal (random disk filenames).
- `Content-Disposition: attachment` and `application/octet-stream` for downloads.
- Strict CSP and no third-party scripts/CDNs; filenames rendered by safe DOM text APIs.
- Browser only sends auth token in Authorization header; room links and QR do not embed the token or PIN.
- Optional `CREATE_KEY` to restrict room creation to authorized site owners.

## Important limitations

- **Not end-to-end encrypted:** server administrators/hosting infrastructure may access unencrypted uploaded data. HTTPS protects it in transit to the hosting provider but not from the host.
- No antivirus, content moderation, user account identity, or malware scanning. Always scan downloaded files and do not run untrusted executables.
- Room metadata and tokens are held in **RAM**, files are held on ephemeral local disk. Restart/redeploy loses room state and may cause loss of uploads. Cleanup is best-effort normal deletion, not secure erasure. Log/backup policies depend on the hosting provider.
- Rate-limiting is basic and in-memory; this is not an anti-abuse service ready for unrestricted global traffic. Add WAF/CAPTCHA, signed one-time links, content handling policy and account quotas before large-scale open registration.
- When users share an owner session token (e.g. via browser DevTools), that grants owner privileges. Never send it to another person. The PIN alone gives guest access.
- Single instance only; multiple replicas do not share rooms or files.
- `TRUST_PROXY=1` relies on a reverse proxy that sanitizes `X-Forwarded-For`; only enable behind a trusted proxy.

## Safe deployment

Use a provider-managed HTTPS domain, set a strong `CREATE_KEY`, limit the allowed audience, review hosting quotas, and avoid storing sensitive personal or confidential data. Never open this application as an unauthenticated public malware file-drop service without hardening and moderation. `PUBLIC_BASE_URL` should match your actual HTTPS origin.

## Responsible disclosure

For security reports, open a private GitHub security advisory on the repository once published. Do not post exploit details in public Issues before a fix.
