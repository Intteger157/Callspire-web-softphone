# softphone-bff

Backend-for-frontend for the web softphone UI served at `/softphone`.

It:

- serves `../softphone-web/dist` on `/softphone`
- exposes same-origin JSON APIs under `/api/*`
- stores the **Callspire PBX Gateway** JWT in a **server-side session** (HTTP-only cookie)

## Requirements

- Node.js 18+ (uses built-in `fetch`)

## Install

```bash
cd softphone-bff
npm install
```

## Run (dev)

```bash
set PORT=5179
set PBX_GATEWAY_BASE_URL=http://127.0.0.1:8005
set SESSION_SECRET=change-me
set PBX_GATEWAY_SERVICE_TOKEN=   # optional (legacy: CDR_PROXY_* still works)
set SESSION_SECURE=false       # true if behind HTTPS
set TRUST_PROXY=false          # true if behind reverse proxy
npm run dev
```

## Run (prod)

1) Build the UI:

```bash
cd softphone-web
npm install
npm run build
```

2) Start the BFF:

```bash
cd ../softphone-bff
npm install
set PORT=5179
set PBX_GATEWAY_BASE_URL=http://127.0.0.1:8005
set SESSION_SECRET=change-me
node src/server.js
```

Open `http://localhost:5179/softphone/`.

### Behind nginx / HTTPS (e.g. `https://dev.web-callspire...`)

The browser uses **HTTPS** to nginx; nginx **proxies HTTP** to Node. Set:

| Env | Value | Why |
|-----|--------|-----|
| `TRUST_PROXY` | `true` | Express must honor `X-Forwarded-Proto: https` (single hop: `app.set('trust proxy', 1)`). |
| `SESSION_SECURE` | `true` | Session cookie must be **Secure** on HTTPS; otherwise behaviour is unreliable. |
| `SESSION_SECRET` | long random string | Signs the cookie; **do not change** in production without expecting all sessions to reset. |

Example proxy headers:

```nginx
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
```

Without **`TRUST_PROXY=true`** and a proper **`SESSION_SECURE`**, **`GET /api/me`** often returns **401** right after login because the session cookie does not stick.

## API exposed to the browser

- `POST /api/auth/login` `{ email, password }`
- `POST /api/auth/logout`
- `GET /api/me`
- `POST /api/me/change-password` `{ current_password, new_password }`
- `GET /api/my-callerids`
- `POST /api/originate` `{ destination, callerid }`
- `GET /api/cdr?limit=&offset=...`
- `GET /api/webrtc/config` — WebRTC/SIP settings for in-browser calling (requires session). Returns JSON: `wsUrl`, `sipHost`, `extension`, `iceServers` (STUN + optional TURN).

### WebRTC (browser audio with MikoPBX)

**Preferred:** configure **WebSocket SIP URL (WSS)** and **SIP host** in **Callspire Web Admin → Settings** (persisted in **Callspire PBX Gateway**). The BFF reads them from the gateway (`GET /api/v1/webrtc/config`).

**Fallback:** if either value is missing in the gateway database, use:

| Variable | Example | Notes |
|----------|---------|--------|
| `WEBRTC_SIP_WS_URL` | `wss://pbx.example.com:8089/ws` | Used when not set in Web Admin. |
| `WEBRTC_SIP_HOST` | `pbx.example.com` | Used when not set in Web Admin. |
| `WEBRTC_TURN_URLS` | *(optional)* | Comma-separated TURN URLs (often env-only). |
| `WEBRTC_TURN_USERNAME` | *(optional)* | TURN username |
| `WEBRTC_TURN_PASSWORD` | *(optional)* | TURN password |

Public PBX settings must match **MikoPBX → Web Phone / WebRTC**. If WSS and host are empty, the UI keeps “Browser call (WebRTC)” disabled until configured.

Users enter the **extension SIP password** in the browser; the BFF does **not** persist it.
