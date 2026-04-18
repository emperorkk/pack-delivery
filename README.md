# pack-delivery

Mobile-first PWA for driver-side package delivery against SoftOne (Soft1) ERP.

A single Cloudflare Worker hosts both the app and the Soft1 reverse proxy:

| URL                                                              | Serves                       |
| ---------------------------------------------------------------- | ---------------------------- |
| `https://pack-delivery.kkourentzes.workers.dev/`                 | The PWA (root + SPA routes)  |
| `https://pack-delivery.kkourentzes.workers.dev/api/<sn>/s1services...` | Reverse proxy to Soft1 |

Soft1 emits no CORS headers, so the browser cannot talk to `<sn>.oncloud.gr/s1services`
directly. The Worker forwards requests verbatim and adds permissive CORS
headers. Same-origin calls from the PWA itself are CORS-free.

## Layout

- `web/` — Vite + React + TypeScript PWA. Built to `web/dist`, served by the Worker.
- `worker/src/index.ts` — Worker entry. Routes `/api/*` to Soft1, falls through to static assets.
- `wrangler.toml` — single Worker config at the repo root (Cloudflare GitHub integration target).
- `directions-soft1-login.md` — reusable Soft1 login/authenticate reference.

## Deployment

The Cloudflare GitHub integration auto-builds on push:

1. `wrangler.toml`'s `[build].command` runs `cd web && npm ci && npm run build` to produce `web/dist`.
2. Wrangler bundles `worker/src/index.ts`.
3. Wrangler uploads the worker bundle plus the `web/dist` directory as assets.

Manual deploy:

```bash
cd web && npm install
npx wrangler deploy           # from repo root, picks up wrangler.toml
```

## Local development

```bash
cd web
npm install
npm run dev                   # Vite at http://localhost:5173
```

`/api/*` requests from the dev server are proxied to the deployed Worker
(`pack-delivery.kkourentzes.workers.dev`) so you can hit a real Soft1
tenant without running wrangler locally. To use a different proxy host,
copy `.env.example` to `.env.local` and set `VITE_SOFT1_PROXY`.

## Configuration

| Env var                  | Default                        | Purpose                                                |
| ------------------------ | ------------------------------ | ------------------------------------------------------ |
| `VITE_SOFT1_PROXY`       | `/api`                         | Where the PWA sends Soft1 requests.                     |
| `VITE_CST_DOWNLOAD_URL`  | `/aicmp.pack-delivery.CST`     | Shown in the "CST not installed" dialog.                |
| `ALLOWED_SERIALS` (Worker) | `""` (any)                   | Comma-separated allowlist of Soft1 serial numbers.      |
| `ALLOWED_ORIGINS` (Worker) | `"*"`                        | Comma-separated allowlist of cross-origin callers.      |

## Implementation map

| Area                     | Path                                |
| ------------------------ | ----------------------------------- |
| Soft1 HTTP client        | `web/src/soft1/client.ts`           |
| Session persistence      | `web/src/soft1/session.ts`          |
| Post-auth bootstrap      | `web/src/soft1/bootstrap.ts`        |
| Delivery list            | `web/src/orders/list.ts`            |
| Order detail             | `web/src/orders/detail.ts`          |
| Route optimizer          | `web/src/orders/optimize.ts`        |
| SOACTION engine          | `web/src/orders/soaction.ts`        |
| SOACTION offline replay  | `web/src/orders/soactionReplay.ts`  |
| Status modal             | `web/src/orders/statusModal.tsx`    |
| Barcode scanner          | `web/src/scanner/zxing.tsx`         |
| Barcode → FINDOC resolve | `web/src/scanner/resolve.ts`        |
| Geolocation service      | `web/src/geo/service.ts`            |
| Geo upload + audit       | `web/src/geo/transport.ts`          |
| Offline queue            | `web/src/offline/queue.ts`          |
| i18n (EL/EN + 8 stubs)   | `web/src/i18n/`                     |
| Themes (10 total)        | `web/src/themes/`                   |
| Settings                 | `web/src/pages/Settings.tsx`        |
