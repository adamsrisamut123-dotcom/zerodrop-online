# ZeroDrop Online v0.3

**A real, deployable, temporary file-sharing website.** Use the same public HTTPS URL on a PC, Android phone, or iPhone — no LAN requirement and no installed phone app.

> Status: **deployable open-source MVP**, not a fully hardened public SaaS. **No public URL is bundled with this repository**; deploy to your own hosting account to receive one. Transfers are relayed through your server, not peer-to-peer or end-to-end encrypted. Do not upload sensitive files.

## Features

- Responsive dark web UI (desktop and mobile), Thai copy.
- Create a randomly generated 8-character room code and 6-digit pairing PIN.
- Share a link and **locally generated** QR (no third-party QR API; PIN is never embedded in URL).
- Guest joins with **room + PIN**, then can upload/download in both directions.
- Multi-file selection and drag-and-drop, upload progress, file list with auto-refresh.
- Owner may delete files, rotate PIN (invalidates guest sessions), or close the room.
- **Automatic expiry:** 60 minutes by default; room files removed after expiry (best-effort filesystem deletion, not secure wiping).
- Server-side limits: **25 MiB/file**, **100 MiB/room**, 30 files/room, 250 MiB across all rooms by default.
- IP-based basic rate limits for room creation, PIN attempts, and uploads.
- Optional **`CREATE_KEY`** so only the site owner can create rooms, while guests can join normally.
- Content downloaded as an attachment; static files and API served same origin with CSP, no external JavaScript/CDNs, no external backend services required.
- Native Node.js 20+ HTTP server, **zero npm dependencies**, Dockerfile, Railway config, Render blueprint, GitHub Actions CI, and automated tests.

## Quick start (local preview)

Install Node.js 20+:

```bash
npm start
```

Then open `http://localhost:3000`. This is only a local preview. Set `PORT` if desired. Two different computers on the internet can use the same URL **after deployment**.

To run tests:

```bash
npm test
```

## Deploy publicly

Read **[DEPLOY_TH.md](DEPLOY_TH.md)** for an illustrated-by-steps Thai guide. Briefly:

1. Upload the *contents* of this folder to a new GitHub repository (include `src`, `public`, `third_party`, `Dockerfile` and `railway.json`).
2. Log in to [Railway](https://railway.com/) → **New Project** → **Deploy from GitHub repo**.
3. Select that repository and deploy the included Dockerfile. Railway supplies `PORT`; the server binds to `0.0.0.0`.
4. In your service's **Settings → Networking** select **Generate Domain**.
5. Under **Variables**, set `CREATE_KEY` to your own long secret (recommended), `NODE_ENV=production`, optionally `PUBLIC_BASE_URL` to your exact HTTPS domain.
6. Open your domain (for example, `https://your-project.up.railway.app`) from your PC and mobile on **different networks** to verify true internet transfers.

> Railway and other providers may charge for runtime, traffic or storage. Review provider prices/quotas yourself. Running this on GitHub Pages alone **will not work** because the transfer API needs a running server.

## Configuration

| Variable | Default | Purpose |
|---|---:|---|
| `PORT` | 3000 | Public listening port; hosting sets this automatically |
| `CREATE_KEY` | unset | If present, users must enter this key to create a room |
| `PUBLIC_BASE_URL` | based on request | Set the canonical `https://...` URL if QR links show HTTP |
| `ROOM_TTL_MINUTES` | 60 | 5–360 minutes |
| `MAX_FILE_MB` | 25 | Max per file, 1–100 MiB |
| `MAX_ROOM_MB` | 100 | Max committed + pending bytes in room, 1–400 MiB |
| `MAX_TOTAL_MB` | 250 | Overall cap, 25–1024 MiB |
| `UPLOAD_DIR` | OS temporary directory | Base for instance-scoped temporary upload folder |
| `TRUST_PROXY` | 0 | Use forwarded IP for rate-limiting **only** behind a trusted sanitizing proxy |

**Single-instance design:** sessions and rooms are kept in memory and files in ephemeral local storage. **Any service restart/deploy may invalidate rooms and lose files.** Do not scale to multiple app replicas. Files are transferred through your server; storage and bandwidth costs are yours. No encryption at rest or malware scanning is implemented.

For persistent/multi-instance production, migrate metadata and sessions to a managed database/Redis and files to an object store (e.g. S3/R2) with verified cleanup, stronger abuse protection and monitoring.

## API (short)

- `POST /api/rooms` — create room, optional `{ "createKey": "..." }`
- `POST /api/join` — `{ "code": "...", "pin": "......" }`
- `GET /api/rooms/:code` — authenticated metadata
- `GET /api/rooms/:code/qr` — authenticated SVG QR
- `PUT /api/rooms/:code/files?name=...` — authenticated raw file body
- `GET /api/rooms/:code/files/:id` — authenticated binary download
- `DELETE /api/rooms/:code/files/:id` — owner only
- `POST /api/rooms/:code/rotate` — owner only, invalidates guest tokens
- `DELETE /api/rooms/:code` — owner only, removes session and files
- `GET /healthz` — readiness endpoint

Requests to authenticated routes require `Authorization: Bearer <session-token>`; tokens are stored in browser `sessionStorage`, not in shareable URLs. API and UI share a single origin.

## Security and privacy

**Read [SECURITY.md](SECURITY.md) before deploying this publicly.** Use your provider's HTTPS endpoint, do not upload confidential material, and set `CREATE_KEY`. Malicious users may attempt uploads of malware or content that infringes rights. The service does **not** inspect file contents. The site owner is responsible for policies, monitoring, moderation, data retention, costs and compliance. Session storage makes browser reload work but session tokens are lost when the tab is closed. The host should keep their room tab open; copy PIN before sharing.

## License

MIT for original project files. Bundled QR code engine has separate copyright/license notices in `third_party/NOTICE.md` and `third_party/APACHE-2.0.txt`.
