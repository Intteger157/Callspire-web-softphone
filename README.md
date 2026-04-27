# Callspire Web Softphone

Browser client for **Callspire**: a static **SPA** plus a **Node.js backend-for-frontend (BFF)**. The browser talks to a **single origin** (the BFF). Session handling and proxying to **Callspire PBX Gateway** run on the server; the gateway JWT is kept in an **HTTP-only cookie-backed session**, not in `localStorage`.

## Contents

| Directory | Purpose |
|-----------|---------|
| **`softphone-web/`** | Frontend SPA. Run `npm run build` to produce `dist/`. The app is mounted under the `/softphone` URL prefix. |
| **`softphone-bff/`** | Express app: serves `softphone-web/dist` at `/softphone`, proxies `/api/*` to **Callspire PBX Gateway**, stores the gateway JWT in **`express-session`**. |

Related repositories (not included here):

- **[Callspire PBX Gateway](https://github.com/Intteger157/Callspire-PBX-Gateway)** — Python service next to MikoPBX (CDR, recordings, originate, WebRTC settings, authentication, etc.).
- **[Callspire Softphone](https://github.com/Intteger157/Callspire-Softphone)** — Windows desktop client (optional reference).

## Requirements

- **Node.js 18+** (the BFF uses built-in `fetch`).

## Layout after clone

```text
Callspire-web-softphone/
├── README.md
├── softphone-web/          # SPA sources and package.json
│   └── dist/               # created by npm run build (do not commit)
└── softphone-bff/
    ├── package.json
    └── src/
        └── server.js
```

## Local development

### 1. Callspire PBX Gateway

**Callspire PBX Gateway** must be reachable (in examples below, `http://127.0.0.1:8005`). Login and API calls will fail without it.

### 2. Frontend

```bash
cd softphone-web
npm install
npm run dev
```

Dev server command and port depend on your frontend toolchain—see `softphone-web/package.json`.

### 3. Production build of the SPA

```bash
cd softphone-web
npm install
npm run build
```

This must produce **`softphone-web/dist`**, which the BFF serves.

### 4. BFF (watch mode)

From the repo root or from `softphone-bff`:

**Windows (cmd):**

```bat
set PORT=5179
set PBX_GATEWAY_BASE_URL=http://127.0.0.1:8005
set SESSION_SECRET=dev-secret-change-me
set PBX_GATEWAY_SERVICE_TOKEN=
set SESSION_SECURE=false
set TRUST_PROXY=false
cd softphone-bff
npm install
npm run dev
```

**Linux / macOS:**

```bash
export PORT=5179
export PBX_GATEWAY_BASE_URL=http://127.0.0.1:8005
export SESSION_SECRET=dev-secret-change-me
npm install --prefix softphone-bff
npm run dev --prefix softphone-bff
```

Open **`http://localhost:5179/softphone/`** (adjust host/port if `PORT` differs).

### BFF environment variables

| Variable | Purpose |
|----------|---------|
| `PORT` | HTTP port for Node (defaults in code often use `5179`). |
| `PBX_GATEWAY_BASE_URL` | Base URL of **Callspire PBX Gateway**. **Legacy:** `CDR_PROXY_BASE_URL` if the new variable is unset. |
| `PBX_GATEWAY_SERVICE_TOKEN` | Optional: sent as `X-Callspire-Service-Token` for protected login routes on the gateway. **Legacy:** `CDR_PROXY_SERVICE_TOKEN`. |
| `SESSION_SECRET` | Secret used to sign the session cookie; use a long random value in production. Changing it invalidates existing sessions. |
| `SESSION_NAME` | Cookie name (must match what the client expects). |
| `TRUST_PROXY` | Set `true` behind nginx so Express trusts `X-Forwarded-Proto` / `X-Forwarded-For`. |
| `SESSION_SECURE` | `true` or `auto` when serving over HTTPS behind a proxy—otherwise the session may not persist in the browser. |
| `WEBRTC_SIP_WS_URL`, `WEBRTC_SIP_HOST` | Fallback WebRTC SIP endpoints if not configured in the gateway admin UI. |
| `WEBRTC_TURN_URLS`, `WEBRTC_TURN_USERNAME`, `WEBRTC_TURN_PASSWORD` | Optional TURN credentials for the browser. |

### WebRTC

Prefer configuring **WSS (SIP over WebSocket)** and **SIP host** in the gateway admin UI (the BFF reads them via `GET /api/v1/webrtc/config`). If they are missing, the `WEBRTC_*` environment variables above are used.

## Production (overview)

1. Build the SPA: `cd softphone-web && npm ci && npm run build`.
2. Install BFF deps: `cd softphone-bff && npm ci`.
3. Run `node src/server.js` (or `npm start`) with **`SESSION_SECRET`**, **`PBX_GATEWAY_BASE_URL`**, and for HTTPS **`TRUST_PROXY=true`** and a correct **`SESSION_SECURE`**.

Behind nginx: proxy to Node and pass `Host`, `X-Forwarded-Proto`, `X-Forwarded-For`. Details and troubleshooting (e.g. `GET /api/me` returning 401 after login) are in **`softphone-bff/README.md`**.

## Browser-facing API (same origin)

The BFF proxies to the gateway. Typical routes:

- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/me`
- `GET /api/cdr`, `GET /api/my-callerids`, `POST /api/originate`
- `GET /api/webrtc/config` — WebRTC/SIP settings for in-browser calling (requires a session)

See **`softphone-bff/README.md`** or **`softphone-bff/src/server.js`** for the full list.

## Security

- Do not commit `.env`, gateway secrets, or SIP passwords. The gateway JWT is stored in an **httpOnly** session cookie via the BFF, not in client-side storage.
- Rotating `jwt_secret` on the gateway forces users to sign in again.

---

*Package names and scripts may vary—check each `package.json`.*
