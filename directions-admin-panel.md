# Admin panel — handoff prompt

Copy the block below into a fresh chat window to start the next iteration:
building a desktop-first dispatcher panel on top of the existing
`pack-delivery` stack.

---

You are picking up work on `pack-delivery`, a Soft1-ERP-integrated
delivery app.

## Repo

- GitHub: <https://github.com/emperorkk/pack-delivery>
- Active branch: `claude/barcode-scanner-erp-Yv99s` (also synced to `main`)
- Deployed at: <https://pack-delivery.kkourentzes.workers.dev/>

## Current state (already built)

A single Cloudflare Worker serves:

- A Vite + React + TypeScript + Tailwind **mobile-first PWA** at `/` —
  the driver-facing client (`web/`).
- A reverse proxy at `/api/<serial>/s1services...` that forwards to
  `https://<serial>.oncloud.gr/s1services`, normalises windows-1253 →
  UTF-8 Greek responses, and handles CORS for browsers (`worker/`).

The driver flow that is **live** today:

1. Login (`login` → `authenticate`) — session persisted in localStorage.
2. Delivery list via CST `getDeliveryListing` (`SERIES`, `UPDATESERIES`,
   `SOREDIR`, `ACTOR=driverRefId`).
3. Route optimize (greedy nearest-neighbour from a fresh GPS fix),
   manual drag reorder with dnd-kit, persisted in localStorage.
4. "Load new deliveries" — scan each barcode → `getData SALDOC
   KEY=<findoc>` → `setData SOACTION insert` with
   `SERIES=settings.series`, `ACTSTATUS=1 (LOADING)`,
   `COMMENTS="Φόρτωση Οχήματος"`,
   `LOCATEINFO="SOACTION:SOACTION,ACTSTATUS"`.
5. "Scan" a barcode to open an order → auto-opens the Change-status
   modal.
6. Order detail (grouped-by-item lines with UoM, payment method, gross
   total) + "Open in Maps" (API-1 URL so navigation starts from the
   driver's current location; multi-stop uses `waypoints`).
7. Change status modal → `setData SOACTION update` for
   ACTSTATUS ∈ {2,3,4,5,6}, with mandatory COMMENTS for {4,5,6}.
8. Background geo ticker — `insertCCCKKLOLA CST` every 5 min,
   suppressed when stationary (< 10 m haversine since last push). Every
   outbound Soft1 call also stamps LATITUDE/LONGITUDE at root per the
   doc in `directions-soft1-login.md`.
9. Offline queue in IndexedDB (`pd.queue`) — replays SOACTION and geo
   pings on reconnect with KEY-patching for insert→update chains.
10. Settings: Loading series (default 3200), Update series (default
    3201), subsection (read-only), barcode field lookup via CST
    `FieldLookUp` (FINDOC always prepended), theme, 10 locales (EN /
    EL full, rest fall back to EN), share-location toggle.
11. In-app Help screen (`/help`) walks through every feature.
12. AADE MyData Delivery Note integration — **paused**, spec digest in
    `directions-aade-mydata-delivery.md` at repo root. Carrier-side
    flows (RegisterTransfer, ConfirmDeliveryOutcome with
    FULL/PARTIAL/NONE + packaging) are designed; we're waiting on the
    tenant to expose 4 CSTs under `aicmp.pack-delivery.aade.*` and to
    tell us which SALDOC fields hold MARK and qrUrl. Don't touch this
    feature unless asked.

## Key files

- `web/src/soft1/client.ts` — HTTP layer, universal LAT/LON stamp,
  `soft1Call` (session-bound) and `cstCall` (CST dispatcher).
- `web/src/orders/list.ts`, `detail.ts`, `soaction.ts`,
  `soactionReplay.ts`, `loadAction.ts`, `routeOrderStore.ts`.
- `web/src/geo/{currentFix,service,transport,replay}.ts`.
- `web/src/offline/queue.ts` (IndexedDB).
- `web/src/pages/{Login,Bootstrap,DeliveryList,OrderDetail,Scan,
  ScanLoad,Settings,Help}.tsx`.
- `web/src/themes/base.css` + `web/src/index.css` — 10 themes driven
  by CSS custom properties; UI has aurora background, gradient-border
  cards, glass header, gradient primary buttons.
- `worker/src/index.ts` — PWA serving + `/api/*` reverse proxy +
  windows-1253 → UTF-8 transcoding.
- `directions-soft1-login.md` — Soft1 login / authenticate / LAT-LON
  stamp contract.
- `directions-aade-mydata-delivery.md` — AADE integration spec digest
  (parked).

## Your task for this session: an Admin/Dispatcher Panel

A **desktop-first** companion to the driver PWA that lets a dispatcher
manage today's deliveries across all drivers. Same Soft1 tenant, same
Worker, same `/api/*` proxy. Same login flow but with an admin-role
Soft1 user (check which REFID / group grants dispatch rights — likely
a CST-based permission check or a username/role lookup).

### Must-have features (from the requester)

1. **List of today's deliveries across the whole fleet** — all ACTORs,
   not just the signed-in one.
2. **Assign a delivery to a driver** — from an unassigned pool or by
   moving between drivers. Under the hood this is most likely a
   SOACTION insert/update with the new ACTOR value.
3. **Auto-assign** — parcels are roughly the same size, so
   weight/volume balancing is a non-goal. Target something reasonable:
   - **Zone-based**: cluster stops by SHPZIP (or k-means on lat/lon
     given N drivers) so each driver owns a contiguous area.
   - **Greedy nearest-neighbour per driver** seeded from the driver's
     last known GPS fix, with round-robin assignment to keep load
     balanced.
   - Let the dispatcher pick the strategy or accept the default.
4. **Per-driver view of assigned deliveries.**
5. **Last location per driver** — read from the CCCKKLOLA geo table
   (the same table `insertCCCKKLOLA` writes to).
6. **Current delivery per driver** — the last delivery the driver
   tapped "Set as next" (SOACTION with ACTSTATUS=2 / IN_PROGRESS).
   SOACTION rows carry ACTOR + FINDOC + ACTSTATUS + timestamps.

### Features you should propose (and build if the user agrees)

- **Live map** of all drivers with last-fix markers, auto-refreshing
  every 60 s. Click a marker → driver's sidebar with today's stops.
- **Stop map per driver** — planned route polyline + current stop
  pinned.
- **Drag-and-drop reassignment** between driver lanes / the
  unassigned pool (dnd-kit again).
- **SLA alerts** — delivery created N hours ago still not InProgress?
  Highlight in red. Delivered-but-not-confirmed? Amber.
- **Today's timeline** — per driver, a gantt-ish strip of SOACTION
  events with ACTSTATUS colour-coded.
- **Driver roster** — active drivers today, with an enable/disable
  toggle that prevents auto-assign from touching a driver on leave.
- **Bulk ops** — select N deliveries and reassign / cancel / mark as
  returned in one action.
- **CSV / print dispatch sheet** per driver for morning hand-outs.
- **Replay-today map** — scrub a timeline and watch the fleet's last
  8 h of geo pings animate.
- **AADE state column** (once the MyData integration ships) — shows
  Registered / InTransit / DeliveredByCarrier / Completed / Failed.
- **Audit log** per delivery — every SOACTION + geo ping the ERP has
  for it, with actor + timestamp + comment.
- **Desktop-class layout** — persistent left nav, multi-column tables
  with virtualisation, keyboard shortcuts (`n` = next, `/` = search,
  `g` then `d` = go to drivers, etc.).

### Architectural decisions to get right

- **Route for admin UI**: probably a new route namespace inside the
  same PWA (e.g. `/admin/*`) gated by an admin role flag, OR a
  separate React entry under `web/src/admin/` shipped as a distinct
  bundle. Decide based on how the dispatcher signs in — same Soft1
  user type, or a dedicated admin account?
- **Data reach**: `getDeliveryListing` is scoped to a single ACTOR.
  You likely need either (a) a new CST like
  `getDeliveryListingForFleet(SERIES, UPDATESERIES, SOREDIR)` that
  returns all rows plus ACTOR, or (b) fetch per-driver in parallel
  and union. Prefer (a) — ask the requester to expose it.
- **Driver enumeration**: you need a CST like `getDrivers` returning
  `{REFID, NAME, lastFix: {lat, lon, ts}, activeToday: boolean}`.
  Ask for it.
- **Geo history for the map**: either a CST that returns the latest
  fix per ACTOR, or a CST that returns the last N points per ACTOR
  for the timeline replay. Ask.
- **Real-time updates**: Cloudflare Workers support Durable Objects +
  WebSockets; a simpler path is 30–60 s polling of the list/geo CSTs.
  Start with polling; upgrade if latency becomes an issue.
- **Assignment write**: reassigning a delivery means writing a new
  SOACTION with the target ACTOR, OR updating the most recent
  SOACTION's ACTOR field, OR a dedicated CST
  `reassignDelivery(FINDOC, actor)`. Clarify with the requester which
  is correct per Soft1 business rules.

### Open questions to ask the requester at the start of your session

1. **Role detection** — how do we decide a signed-in Soft1 user is a
   dispatcher? (Role flag? Specific MODULE in the auth context? A
   dedicated CST to query? Hard-coded REFID list for now?)
2. **Driver enumeration CST** — can the tenant expose
   `aicmp.pack-delivery.getDrivers`? What fields does it return?
3. **Fleet-wide listing CST** — expand `getDeliveryListing` to
   accept `ACTOR=*` or add `getDeliveryListingForFleet`?
4. **Geo history CST** — expose `getDriverLastFixes` (one row per
   ACTOR) and/or `getDriverGeoHistory(ACTOR, fromTs, toTs)` for the
   replay.
5. **Assignment mutation** — new ACTOR on SOACTION vs. a dedicated
   CST? What's the business rule for reassignment (is an existing
   IN_PROGRESS SOACTION left on the previous driver, or cancelled)?
6. **Auto-assign constraints** beyond zone — any per-driver preferred
   districts? Max deliveries per driver per day? Must-respect
   priority (VIP) field on SALDOC?
7. **Deployment** — serve admin from the same Worker at `/admin`, or
   separate `pack-delivery-admin.*.workers.dev`?

## Conventions to preserve

- All Soft1 writes include the universal LAT/LON stamp + `enc:"utf8"`
  (already centralised in `soft1Call` / `cstCall`).
- `setData SOACTION` writes include
  `LOCATEINFO:"SOACTION:SOACTION,ACTSTATUS"` at root.
- Greek responses from CST paths are transcoded to UTF-8 in the
  Worker — don't double-decode client-side.
- Themes are driven by CSS custom properties; any new UI must use
  `--surface`, `--surface-2`, `--accent`, etc. — never hard-code
  colours.
- The PWA is offline-first; admin likely does not need IndexedDB
  queueing but must tolerate spotty connectivity with a loading /
  retry UX.
- Branch discipline: commit to `claude/barcode-scanner-erp-Yv99s`,
  keep `main` fast-forwarded.
- When the spec says XML over HTTPS (AADE), that still goes via a
  Soft1 CST, not from the browser.

## How to pick up

Start by reading:

1. `README.md`, `directions-soft1-login.md`,
   `directions-aade-mydata-delivery.md` at repo root.
2. `web/src/orders/list.ts` + `soaction.ts` + `loadAction.ts`.
3. `web/src/geo/transport.ts` + `service.ts`.
4. `worker/src/index.ts`.

Then ask the user open questions 1–7 above before writing code.
Propose a thin vertical slice first — admin login + fleet-wide
delivery list + a single "assign to driver" flow — and iterate.
