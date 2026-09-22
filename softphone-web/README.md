# Callspire Web Softphone (SPA)

Vue 3 + Vite + TypeScript + Pinia browser softphone client.
In **production** the SPA is served directly by **Callspire PBX Gateway** (Python/FastAPI) at `/softphone/`.
In **local development** Vite's built-in proxy forwards `/api/*` requests to the gateway, so a Node.js BFF is not needed.

---

## Quick start (development)

```bash
# 1. Install dependencies
npm install

# 2. Optional: point at your gateway if it runs on a different port
cp .env.example .env
# Edit VITE_GATEWAY_URL=http://127.0.0.1:8005

# 3. Start Vite dev server
npm run dev
```

Open **`http://localhost:5173/softphone/`** — Vite proxies every `/api/*` call to the gateway directly.

> **Gateway must be running first.** Login and WebRTC config calls hit the gateway via the proxy.

---

## Production build

```bash
npm run build
# or via the CI helper script:
#   bash ../scripts/build.sh     (Linux / macOS / WSL)
#   ..\scripts\build.ps1         (Windows PowerShell)
```

Output: `dist/` — `index.html` plus `assets/` with content-hashed JS/CSS bundles.

### Deploying to the gateway

Set the environment variable:

```
SOFTPHONE_STATIC_DIR=/path/to/softphone-web/dist
```

The gateway's `mount_web_softphone()` serves `dist/` at `/softphone/` automatically.
No nginx or Node.js is required to serve static files — only for TLS termination and reverse-proxying.

---

## Environment variables (`.env`)

| Variable | Default | Purpose |
|---|---|---|
| `VITE_GATEWAY_URL` | `http://127.0.0.1:8005` | Dev-only: gateway target for the `/api` proxy |

In production all API calls are same-origin — no env vars needed in the browser build.

---

## Project structure

```
src/
├── api/
│   ├── client.ts          # fetch wrapper (credentials: 'include', JSON)
│   └── types.ts           # TypeScript interfaces for all API responses
├── audio/
│   └── softphoneAudio.ts  # AudioContext, ringtones, setSinkId helper
├── components/
│   ├── AppShell.vue        # Top bar: user info, extension, logout, settings
│   ├── AudioPlayer.vue     # Inline recording player (play/pause, seek)
│   ├── CallerIdSelector.vue
│   ├── CallHistory.vue     # CDR table with direction icons, call-back button
│   ├── ChangePasswordModal.vue
│   ├── Dialpad.vue         # 3×4 keypad + keyboard input + DTMF
│   ├── InCallView.vue      # Active call controls (mute / hold / end / DTMF)
│   ├── IncomingCallToast.vue
│   ├── KommoStatus.vue     # Integration badge for AppShell topbar
│   └── SettingsModal.vue   # Mic / speaker selector, device test
├── router/
│   └── index.ts            # Vue Router + beforeEach auth guard
├── stores/
│   ├── auth.ts             # Session (login / logout / checkAuth / changePassword)
│   ├── callerids.ts        # Available outbound caller IDs
│   ├── calls.ts            # JsSIP RTCSession lifecycle, audio effects
│   ├── cdr.ts              # CDR fetch, auto-refresh after call end
│   ├── kommo.ts            # Kommo CRM status & session
│   ├── preferences.ts      # Mic / speaker preferences (load/save via API)
│   └── webrtc.ts           # JsSIP UA lifecycle, ICE / TURN config
├── types/
│   └── jssip.d.ts          # Type augmentation for UAConfiguration.pcConfig
└── views/
    ├── HomeView.vue         # Authenticated main screen
    └── LoginView.vue        # Login form
```

---

## Gateway environment variables (server-side)

These are set on the **Callspire PBX Gateway**, not in the Vite build:

| Variable | Purpose |
|---|---|
| `SOFTPHONE_STATIC_DIR` | Path to `softphone-web/dist` |
| `SESSION_SECRET` | Signs the session cookie (use a strong random value in production) |
| `SESSION_NAME` | Cookie name (default: `callspire_softphone_sid`) |
| `TRUST_PROXY` | `true` behind nginx so `X-Forwarded-Proto` sets `Secure` on the cookie |
| `PBX_GATEWAY_SERVICE_TOKEN` | Service token for protected internal gateway routes |
| `WEBRTC_SIP_WS_URL` | Fallback WSS URL if not configured in the gateway admin UI |
| `WEBRTC_SIP_HOST` | Fallback SIP domain if not configured in the gateway admin UI |
| `WEBRTC_TURN_URLS` | TURN server URIs (space-separated), e.g. `turn:turn.example.com:3478` |
| `WEBRTC_TURN_USERNAME` | TURN credentials — username |
| `WEBRTC_TURN_PASSWORD` | TURN credentials — password |

---

## MikoPBX / Asterisk WSS — TLS requirements

The browser opens a **direct** WSS connection to Asterisk (`wss://pbx.example.com:8089/ws`).
This connection is **not** proxied by nginx or the gateway.

**Requirements:**

1. **Valid TLS certificate on Asterisk.** Browsers block WSS to self-signed or untrusted certs.
   Use Let's Encrypt or a commercial CA.  Self-signed certs require the user to open
   `https://pbx.example.com:8089/` in a browser tab and manually accept the security exception.

2. **`Asterisk http.conf`**:
   ```
   [general]
   tlsenable=yes
   tlsbindaddr=0.0.0.0:8089
   tlscertfile=/etc/asterisk/keys/fullchain.pem
   tlsprivatekey=/etc/asterisk/keys/privkey.pem
   ```

3. **Firewall**: TCP 8089 reachable from the browser (or from the internet for remote workers).

4. **PJSIP auth object** for `<ext>-WS` (e.g. `1001-WS`):
   ```
   [1001-WS]
   type=auth
   auth_type=userpass
   username=1001-WS
   password=<strong-random>
   ```
   The gateway stores and returns the SIP password via `GET /api/webrtc/config` (never stored in the browser).

5. **TURN servers** (recommended for NAT traversal): set `WEBRTC_TURN_*` env vars on the gateway.

See `docs/nginx-example.conf` for a full reverse-proxy configuration.

---

## Browser compatibility

| Feature | Chrome | Firefox | Edge | Safari |
|---|---|---|---|---|
| WebRTC + JsSIP | ✅ | ✅ | ✅ | ✅ |
| `HTMLAudioElement.setSinkId` (speaker routing) | ✅ | ✅ | ✅ | ❌ |
| `AudioContext.setSinkId` | Chrome 110+ | ❌ | ❌ | ❌ |

Microphone/speaker selection degrades gracefully: the UI shows a compatibility note when `setSinkId` is unavailable.
