# AADE MyData — Digital Delivery Note integration notes

Working notes for the upcoming integration between pack-delivery and
AADE's MyData Digital Delivery Note REST API (spec v2.0.1, January 2026
pre-official release). Authoritative source:
<https://www.aade.gr/sites/default/files/2026-01/myDATA%20API%20Documentation_DeliveryNote_v2.0.1_preofficial_0.pdf>

## 0. Headline findings

- **The driver is the Carrier** (Μεταφορέας). Only the Carrier may call
  `RegisterTransfer` and only the Carrier may submit `outcome=NONE`
  (FailedDelivery). Our app never acts as Recipient, so `RejectDeliveryNote`
  is out of scope for now.
- **AADE API is XML over HTTPS**, authenticated with two headers
  (`aade-user-id`, `ocp-apim-subscription-key`) that are tenant-scoped.
  They cannot ship to the browser — therefore **all AADE calls must go
  through a Soft1 CST**, not from the PWA directly.
- **Doc type branching is cosmetic for the API.** A Soft1 SALDOC with
  INVOICETYPE `9.3` (pure Δ.Α.), a `1.x` with `isDeliveryNote=true`
  (Τιμολόγιο-Δ.Α.), or an `11.x` with `isDeliveryNote=true`
  (Απόδειξη-Δ.Α.) all use the **same** AADE endpoints. Error code 805
  rejects only invoices with `isDeliveryNote=false`. We keep a doc-type
  chip in the UI for clarity, but the API calls don't branch.
- **MARK + qrUrl are the only stable identifiers.** Everything else keys
  off them.

## 1. Lifecycle states (Παρ. 7.1)

| Code | Name | Description |
|------|------|-------------|
| 1 | Registered | Δ.Α. issued, MARK assigned; transport not started. |
| 2 | Cancelled | Issuer cancelled before transport started. |
| 3 | InTransit | Carrier has called `RegisterTransfer`. |
| 4 | Rejected | Recipient called `RejectDeliveryNote`. |
| 5 | DeliveredByCarrier | Carrier reported delivery in a B2B flow — awaiting recipient sign-off. |
| 7 | FailedDelivery | Carrier submitted `outcome=NONE`. |
| 8 | Completed | Delivery concluded successfully (recipient confirmed in B2B, or Carrier reported in B2C). |

*Code 6 is reserved / unused in v2.0.1.*

## 2. Roles

| Role | Greek | Who, in our setup |
|------|-------|-------------------|
| Issuer | Εκδότης | The Soft1 tenant that emits the 9.3/1.x/11.x document. |
| Carrier | Μεταφορέας | **Our driver.** Can be ≥1 via transhipment. |
| Recipient | Λήπτης | Customer — outside this PWA's scope. |

## 3. Endpoints we care about

Production base: `https://mydatapi.aade.gr/myDATA`
Dev / sandbox base: `https://mydataapidev.aade.gr`

### 3.1 `POST /RegisterTransfer`

Carrier declares pickup. Also used for transhipment.

Request body (`Transport`):

| Field | Type | Req | Notes |
|-------|------|-----|-------|
| `qrUrl` | string | Y | Per-doc QR URL (or group QR URL). |
| `transportDetail` | TransportDetailType | Y | See §5.1. |

Response: `statusCode=Success` + `transferMark` (xs:long) on success.

Result: state → **InTransit**.

### 3.2 `POST /ConfirmDeliveryOutcome`

Declares the delivery outcome. Driver-initiated.

Request body (`ConfirmDeliveryOutcomeRequest`):

| Field | Type | Req | Notes |
|-------|------|-----|-------|
| `qrUrl` | string | Y | Per-doc QR URL (or group QR URL). |
| `outcome` | `FULL` \| `PARTIAL` \| `NONE` | Y | NONE is carrier-only (err 817/818). |
| `deliveredWithoutRecipient` | boolean | N | true if nobody was present. |
| `deliveredPackaging` | PackagingDetailType[] | N, **Y for PARTIAL** | err 814 if missing on PARTIAL. |

Response: `statusCode=Success` + `deliveryOutcomeMark` on success.

Result:
- Carrier in B2B → **DeliveredByCarrier**
- Carrier in B2C → **Completed**
- Recipient anywhere → **Completed**
- `outcome=NONE` (carrier only) → **FailedDelivery**

### 3.3 `GET /GetDeliveryNoteStatus?mark={mark}`

Returns `DeliveryNoteStatusResponse`: `invoiceMark`, `status` (enum from §7.1),
`dispatchTimestamp`, `lifecycleHistory: DeliveryEventType[]`. Caller can be
issuer, recipient, or any carrier that participated. We will use this on
order-detail load to render current state + history.

### 3.4 `POST /GenerateGroupQRCode` and `GET /RequestGroupQRDetails` (phase 2)

Two+ QRs into one group QR (expires at a returned timestamp). Not needed
for the MVP but would let us treat a whole truck-load as one target for
RegisterTransfer / ConfirmDeliveryOutcome. Park for later.

### 3.5 `POST /RejectDeliveryNote`

Recipient-only → out of scope.

## 4. Auth headers

Every call must carry:

```
aade-user-id: <tenant AADE username>
ocp-apim-subscription-key: <tenant AADE subscription key>
```

The VAT is inferred from the registered account — no AFM field per call.
Credentials are **tenant-scoped**, stored in Soft1 — must never reach the
browser.

## 5. Schemas

### 5.1 `TransportDetailType`

| Field | Type | Req | Notes |
|-------|------|-----|-------|
| `vehicleNumber` | string | Y | Plate / vessel / flight / route code / "άνευ". |
| `transportType` | int | Y | Enum §7.4. |
| `timeStamp` | dateTime | N | When the pickup actually happened. |
| `carrierVatNumber` | string | Y | AFM of the carrier company. |
| `pNumber` | string | N | Trailer / semi-trailer plate "Ρ". |
| `location` | LocationType | N | Transhipment location. |
| `longitude` | decimal | Y | |
| `latitude` | decimal | Y | |

### 5.2 `OutcomeDetailsType` (response body of ConfirmDeliveryOutcome)

| Field | Type | Req | Notes |
|-------|------|-----|-------|
| `outcome` | DeliveryOutcomeType | Y | FULL / PARTIAL / NONE |
| `deliveredWithoutRecipient` | boolean | N | |
| `deliveredPackaging` | PackagingDetailType[] | N (Y on PARTIAL) | |

### 5.3 `PackagingDetailType`

| Field | Type | Req | Notes |
|-------|------|-----|-------|
| `packagingType` | int | Y | 1..6 per §7.3. |
| `quantity` | int | Y | > 0. |
| `otherPackagingTypeTitle` | string | N | Required for type 6 (Λοιπά). |

### 5.4 `DeliveryEventType` (history entry)

`eventType` ∈ `RegisterTransfer` / `ConfirmOutcome` / `Rejection`, plus
`eventTimestamp`, `actorVat`, optional `mark`, and one of `transportDetails` /
`outcomeDetails` / `rejectionDetails` (mutually exclusive).

### 5.5 `ResponseDoc` / `ResponseType` (submission response)

| Field | Type | Notes |
|-------|------|-------|
| `index` | int | position in batch |
| `statusCode` | string | `Success` / `ValidationError` / `TechnicalError` / `XMLSyntaxError` |
| `transferMark` | long | only on RegisterTransfer success |
| `rejectMark` | long | only on RejectDeliveryNote success |
| `deliveryOutcomeMark` | long | only on ConfirmDeliveryOutcome success |
| `errors` | ErrorType[] | on any error statusCode |

## 6. Enumerations

### 6.1 Outcome (`DeliveryOutcomeType`)

| Value | Meaning | Who can send |
|-------|---------|--------------|
| `FULL` | Full delivery | Carrier or Recipient |
| `PARTIAL` | Partial delivery (needs packaging breakdown) | Carrier or Recipient |
| `NONE` | Failed delivery | **Carrier only** (err 817/818) |

### 6.2 `PackagingType` (§7.3)

| Code | Greek | English |
|------|-------|---------|
| 1 | Παλέτα | Pallet |
| 2 | Κούτα | Box |
| 3 | Κιβώτιο | Crate |
| 4 | Βαρέλι | Barrel |
| 5 | Σάκος | Sack |
| 6 | Λοιπά | Other |

### 6.3 `transportType` (§7.4)

| Code | Greek | English |
|------|-------|---------|
| 1 | Φορτηγό Δημόσιας Χρήσης | Public-use truck (ΦΔΧ) |
| 2 | Φορτηγό Ιδιωτικής Χρήσης | Private-use truck (ΦΙΧ) |
| 3 | Πλοίο | Ship |
| 4 | Τρένο | Train |
| 5 | Αεροπλάνο | Aeroplane |
| 6 | Λοιπά Μεταφορικά Μέσα | Other (e.g. two-wheeler) |
| 7 | Άνευ | No vehicle |

### 6.4 Event types (history)

`RegisterTransfer`, `ConfirmOutcome`, `Rejection`.

## 7. Notable business errors we'll encounter

(From §6.2. Code shown is the `code` inside the `ErrorType`. All return HTTP 200.)

| Code | Meaning |
|------|---------|
| 100 | XML syntax validation error |
| 800 | Method not allowed in current state |
| 805 | Not a delivery note (isDeliveryNote=false) |
| 806 | QR not found |
| 807 | Invalid QR |
| 808 | No invoice found for this QR |
| 809 | Cannot confirm outcome — invoice cancelled |
| 810 | Cannot confirm outcome — delivery note rejected |
| 811 | Cannot confirm outcome — already completed |
| 812 | Cannot confirm outcome — already failed |
| 813 | Cannot confirm outcome — not yet dispatched (still Registered) |
| 814 | PARTIAL outcome needs `deliveredPackaging` |
| 815 | Invalid packagingType (must be 1..6) |
| 816 | Invalid quantity (must be > 0) |
| 817 | Only carrier can set NONE |
| 818 | Recipient cannot set NONE in B2B |
| 819 | Carrier already declared — only recipient can confirm now |
| 820 | Group QR not found / expired |
| 821 | Cannot RegisterTransfer — invoice cancelled |

## 8. Our implementation plan

### 8.1 Architecture

```
PWA ──► Soft1 CST (aicmp.pack-delivery.aade.*) ──► AADE MyData REST
         │
         └──► writes MARK / qrUrl / transferMark / deliveryOutcomeMark
              back to the SALDOC record before responding
```

Soft1 handles: credentials (tenant-stored user-id + subscription key),
sandbox/prod toggle, XML serialization to the AADE schema, XML → JSON
response parsing, and **persisting the returned marks back into SALDOC**.

### 8.2 CST methods we need Soft1 to expose

Under namespace `aicmp.pack-delivery.aade`:

- `getDeliveryStatus({MARK})` → wraps `GetDeliveryNoteStatus`; returns
  `{ status, statusCode, dispatchTimestamp, lifecycleHistory: [] }`.
- `registerTransfer({FINDOC, MARK? , qrUrl?, vehicleNumber, transportType,
  carrierVatNumber, pNumber?, lat, lon, timeStamp?})` → calls
  `RegisterTransfer`; returns `{ transferMark, statusCode, errors? }` and
  writes `transferMark` onto the SALDOC row.
- `confirmDeliveryOutcome({FINDOC, MARK?, qrUrl?, outcome, deliveredWithoutRecipient?,
  deliveredPackaging?: [{packagingType, quantity, otherPackagingTypeTitle?}]})`
  → returns `{ deliveryOutcomeMark, statusCode, errors? }` and writes
  `deliveryOutcomeMark` onto the SALDOC row.
- (`rejectDeliveryNote` — skip for the MVP, recipient-only.)

### 8.3 PWA changes (follow-up branches, scoped after questions below are answered)

1. **Detail screen enrichment**
   - Read `MARK` + `qrUrl` from `getData` SALDOC response (TBD field names —
     see Q1 below).
   - Render the QR (add a tiny `qrcode` dep) + MARK text with a copy button.
   - On detail mount, call `getDeliveryStatus(MARK)` to show current AADE
     state + lifecycle timeline.
   - Add a doc-type chip ("Δ.Α." / "Δ.Α.-Τιμολόγιο" / "Δ.Α.-Απόδειξη")
     based on INVOICETYPE code.

2. **Loading flow (`/scan/load`)**
   - After the existing SOACTION insert, call `registerTransfer` with the
     truck's plate (from `SALDOC.MTRDOC.TRUCKSNO`), `transportType=2` by
     default (ΦΙΧ — private-use truck), carrier AFM (TBD — Q3), and the
     driver's live lat/lon.
   - On success show the returned `transferMark` beside the SOACTION key
     in the "Loaded" list.

3. **Confirm-outcome modal** (new, replaces the auto-pop status modal
   for `Completed` and `Return`):
   - Three buttons: **Ολοκληρώθηκε πλήρως** (FULL), **Ολοκληρώθηκε
     μερικώς** (PARTIAL), **Απέτυχε** (NONE).
   - Checkbox "Χωρίς τον παραλήπτη" (`deliveredWithoutRecipient`).
   - If PARTIAL: editable list of packaging rows — `packagingType` select
     (6 values) + `quantity` number; if type=6 (Λοιπά) show the
     `otherPackagingTypeTitle` text input.
   - Submit → `confirmDeliveryOutcome` CST call.
   - On success also posts the existing SOACTION update so both Soft1
     ACTSTATUS and AADE state stay in sync.

4. **Offline queue**
   - Two new kinds: `aade-register-transfer`, `aade-confirm-outcome`.
   - Key on MARK (stable). Replay identical XML.
   - Keep the existing SOACTION queue behaviour — they queue independently.

5. **AADE state badge on the list**
   - Optional cosmetic: fetch-and-cache the AADE state per FINDOC once and
     display it on the row (Registered / InTransit / Delivered / Completed).
   - Cheap win if the tenant already denormalises the MyData status into
     a SALDOC field — otherwise we'd hammer `GetDeliveryNoteStatus` per
     row, which we should not.

6. **i18n + Help**
   - Extend locale files with the new screens (outcome modal, packaging
     editor, error mapping for codes 805/809–818).
   - New Help section: "Συμβατότητα με myDATA / Παραδόσεις".

## 9. Open questions still blocking implementation

Carried from the in-chat plan — answer these before we start coding:

- **Q1.** Which Soft1 SALDOC field(s) hold `MARK` and `qrUrl` after the
  issuer has transmitted the document? Sample getData showed neither.
- **Q2.** Confirm the Soft1 CST namespace that'll wrap AADE (`aicmp.pack-
  delivery.aade.*`) and the four methods listed in §8.2.
- **Q3.** For RegisterTransfer:
  - `vehicleNumber` — OK to read `MTRDOC.TRUCKSNO`?
  - `carrierVatNumber` — is it the company's own AFM? Where do we read it
    (session.context.COMPANY-side AFM, or a dedicated CST)?
  - Default `transportType` — 2 (ΦΙΧ) or 1 (ΦΔΧ)?
  - Is there a place the fleet owner configures these defaults so the
    driver doesn't see them?

## 10. Reference links

- AADE MyData portal (public): <https://www.aade.gr/mydata>
- Sandbox base URL: `https://mydataapidev.aade.gr`
- Production base URL: `https://mydatapi.aade.gr/myDATA`
- Spec PDF (v2.0.1): <https://www.aade.gr/sites/default/files/2026-01/myDATA%20API%20Documentation_DeliveryNote_v2.0.1_preofficial_0.pdf>

## 11. Status

Pending. No code has been written for this feature yet. Resume from §9
(open questions).
