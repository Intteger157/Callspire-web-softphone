# Callspire Web Softphone

**Repository:** [Intteger157/Callspire-web-softphone](https://github.com/Intteger157/Callspire-web-softphone)

Vue 3 + Vite + TypeScript + Pinia **browser softphone**. In production the gateway serves the built SPA at **`/softphone/`** on the same origin as the FastAPI API — **no Node.js BFF**.

## Related repositories

| Repository | Role |
|---|---|
| **[Callspire-PBX-Gateway](https://github.com/Intteger157/Callspire-PBX-Gateway)** | FastAPI gateway — auth, CDR, originate, WebRTC config, Kommo; mounts this SPA |
| **[Callspire.Gateway-for-MikoPBX](https://github.com/Intteger157/Callspire.Gateway-for-MikoPBX)** | Linux installer; ships a prebuilt copy of `dist/` for offline install |
| **[Callspire-softphone](https://github.com/Intteger157/Callspire-softphone)** | Windows WPF + macOS SwiftUI desktop clients (same gateway APIs) |

## Layout

```text
callspire-web-softphone/
├── README.md                 ← you are here
├── docs/nginx-example.conf   ← TLS reverse proxy example
├── scripts/build.sh          ← npm ci + build wrapper
├── scripts/build.ps1
└── softphone-web/            ← Vue SPA (see softphone-web/README.md)
    ├── .env.example          ← dev only: VITE_GATEWAY_URL
    ├── src/
    └── dist/                 ← build output (gitignored)
```

The legacy **`softphone-bff/`** Express server was **removed**. Dev uses Vite’s proxy; production uses **`gateway-web-softphone`** inside the PBX gateway.

## Requirements

- **Node.js 18+**
- Running **[Callspire PBX Gateway](https://github.com/Intteger157/Callspire-PBX-Gateway)** for login / WebRTC (typical dev port `8005` or installer default `8443`)

## Local development

```bash
cd softphone-web
npm install
cp .env.example .env          # optional: VITE_GATEWAY_URL=http://127.0.0.1:8443
npm run dev
```

Open **`http://localhost:5173/softphone/`** — Vite proxies `/api/*` to the gateway.

Full SPA docs: **`softphone-web/README.md`**.

## Production build

```bash
bash scripts/build.sh         # or .\scripts\build.ps1 on Windows
# equivalent: cd softphone-web && npm ci && npm run build
```

Output: **`softphone-web/dist/`**.

### Deploy to gateway

On the gateway host:

```bash
export SOFTPHONE_STATIC_DIR=/opt/callspire/web-softphone/dist
export SESSION_SECRET="$(openssl rand -hex 32)"
export SESSION_SECURE=true      # behind HTTPS
```

Gateway config template: **`config.example.yaml`** in [Callspire-PBX-Gateway](https://github.com/Intteger157/Callspire-PBX-Gateway) → copy to `config.yaml`.

Put **nginx** in front for TLS — see **`docs/nginx-example.conf`**.

### Refresh bundled dist in the stack installer

After UI changes, rebuild and copy into [Callspire.Gateway-for-MikoPBX](https://github.com/Intteger157/Callspire.Gateway-for-MikoPBX):

```bash
cd callspire-web-softphone/softphone-web
npm ci && npm run build
rsync -a dist/ /path/to/Callspire.Gateway-for-MikoPBX/web-softphone/dist/
```

## Security

- Do **not** commit `.env`, gateway `config.yaml`, or SIP passwords.
- Session JWT is stored in an **httpOnly** cookie by the gateway mount — not in `localStorage`.
- Use **`.env.example`** / gateway **`config.example.yaml`** with placeholder values only.

## Browser API (same origin in production)

Typical routes (proxied by gateway mount):

- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/me`
- `GET /api/cdr`, `GET /api/my-callerids`, `POST /api/originate`
- `GET /api/webrtc/config`

See **`softphone-web/README.md`** for WebRTC/TLS notes and env tables.
