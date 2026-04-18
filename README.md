# pack-delivery

Mobile-first PWA for driver-side package delivery against SoftOne (Soft1) ERP.

Two packages:

- `web/` — Vite + React + TypeScript PWA (the app drivers install on their phones)
- `worker/` — Cloudflare Worker that reverse-proxies Soft1 so the browser can talk to it (Soft1 does not emit CORS headers)

See [`directions-soft1-login.md`](./directions-soft1-login.md) for the Soft1 login/authenticate contract that both packages implement.

## Quick start

```bash
# Web app (dev server at http://localhost:5173)
cd web
npm install
npm run dev

# Worker (reverse proxy)
cd worker
npm install
npx wrangler dev
```

Configure the Soft1 serial number in `web/.env.local`:

```
VITE_SOFT1_PROXY=https://your-worker.workers.dev
VITE_CST_DOWNLOAD_URL=https://your-pages.pages.dev/aicmp.pack-delivery.CST
```

## Implementation map

| Area                     | Path                                |
| ------------------------ | ----------------------------------- |
| Soft1 HTTP client        | `web/src/soft1/client.ts`           |
| Session persistence      | `web/src/soft1/session.ts`          |
| Post-auth bootstrap      | `web/src/soft1/bootstrap.ts`        |
| Delivery list screen     | `web/src/orders/list.tsx`           |
| Order detail screen      | `web/src/orders/detail.tsx`         |
| Route optimizer          | `web/src/orders/optimize.ts`        |
| SOACTION engine          | `web/src/orders/soaction.ts`        |
| Status change modal      | `web/src/orders/statusModal.tsx`    |
| Barcode scanner          | `web/src/scanner/zxing.tsx`         |
| Barcode → FINDOC resolve | `web/src/scanner/resolve.ts`        |
| Geolocation service      | `web/src/geo/service.ts`            |
| Geo transport (CST)      | `web/src/geo/transport.ts`          |
| Offline queue            | `web/src/offline/queue.ts`          |
| i18n (EN/EL default)     | `web/src/i18n/`                     |
| Themes (10 total)        | `web/src/themes/`                   |
| Settings                 | `web/src/settings/screen.tsx`       |
