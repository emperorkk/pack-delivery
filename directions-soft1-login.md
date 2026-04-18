# Soft1 Web Services — Login & Authentication Reference

A reusable reference for integrating browser/mobile apps with a SoftOne (Soft1) ERP tenant via its JSON Web Services. This document focuses on the session-establishment flow (login → authenticate → session) and the error / transport rules that apply to every subsequent call.

## 0. Transport basics
- **Protocol**: HTTPS, JSON over POST.
- **Base URL**: `https://<SERIAL_NUMBER>.oncloud.gr/s1services`
  - `<SERIAL_NUMBER>` is the 14-digit Soft1 installation serial (e.g. `01104398142024`).
  - Trailing slash is optional.
  - On-prem installations replace the host with the customer's Soft1 web host but keep the `/s1services` path.
- **Routing**: all core services go to the exact base URL. The called operation is selected by the `service` field in the JSON body, not by the path.
- **Encoding**: always send `"enc":"utf8"` so Greek / Unicode characters round-trip correctly in both directions.
- **Content-Type**: `application/json`.
- **CORS**: Soft1 does not emit `Access-Control-Allow-Origin` for arbitrary browser origins. A reverse proxy (e.g. Cloudflare Worker) is required for browser-based apps.
- **Geo-stamping (universal)** — every JSON body sent to `/s1services` (generic endpoint *and* every `/s1services/JS/…` CST path) carries two extra **root-level** fields:
  ```json
  "LONGITUDE": "",
  "LATITUDE":  ""
  ```
  Filled with the numeric values from the device's Geolocation API, serialised as strings (Soft1 convention). Empty strings (`""`) when no fix is available — notably before permission is granted, during the initial login / authenticate calls, or while GPS is acquiring.

## 1. Pre-flight availability check
Before any login attempt — as soon as the user has typed the Serial Number — hit:
```
GET https://<SERIAL_NUMBER>.oncloud.gr/s1services?info
```
A successful HTTP 200 with Soft1's info payload confirms the endpoint is alive. Use this to give precise feedback at the credentials screen ("Serial number endpoint unreachable") rather than waiting for a CORS/network failure on login.

## 2. Login

**Request**
```
POST https://<SERIAL_NUMBER>.oncloud.gr/s1services/
Content-Type: application/json

{
  "service":  "login",
  "appId":    "1199",
  "username": "aimodule",
  "password": "aimodule",
  "enc":      "utf8"
}
```

**Response (success)** returns a preliminary `clientID`, plus an `objs[]` array with one row per company/branch/module context the user can authenticate into. Soft1 Web Accounts with a single default context return `objs.length === 1`.

## 3. Authenticate

**Request**
```
POST https://<SERIAL_NUMBER>.oncloud.gr/s1services/
Content-Type: application/json

{
  "service":  "authenticate",
  "appId":    "1199",
  "clientID": "<preliminary clientID from login>",
  "COMPANY":  "1000",
  "BRANCH":   "1000",
  "MODULE":   "0",
  "REFID":    "264",
  "enc":      "utf8"
}
```

**Response (success)** returns a **promoted** `clientID` that replaces the preliminary one — only this promoted token is valid for `getData` / `setData` / CST calls.

## 4. Session persistence
After `authenticate` succeeds, persist to `localStorage` under key `soft1.session`:
```json
{
  "baseUrl": "https://01104398142024.oncloud.gr/s1services",
  "serialNumber": "01104398142024",
  "appId": "1199",
  "clientID": "<authenticated clientID>",
  "username": "aimodule",
  "companyinfo": "…",
  "companyImage": "01104398142024/FB62BBC4620252C0.jpg",
  "context": {
    "COMPANY": "1000", "COMPANYNAME": "…",
    "BRANCH": "1000",  "BRANCHNAME": "Εδρα",
    "MODULE": "0",     "REFID": "264"
  },
  "driverRefId": "264",
  "geoTableReady": true,
  "loggedInAt": "2026-04-18T08:50:00Z"
}
```

- `clientID` is reused indefinitely. Do **not** re-login on every session start.
- No server-side logout exists — clearing this object is enough.
- Never store the password.

## 5. Error envelope
Every Soft1 call — login, authenticate, getData, setData, CST — returns an error envelope on failure:
```json
{ "success": false, "errorcode": -2, "error": "Authenticate fails due to invalid credentials." }
```

- Always surface `error` verbatim.
- `errorcode < 0` ⇒ session invalid → purge `soft1.session` and force a re-login.
- `errorcode >= 0` ⇒ recoverable business-rule error → keep the user signed in.
- Full error-code list: https://www.softone.gr/ws

## 6. Reference flow (pseudocode)
```ts
async function signIn({ baseUrl, appId, username, password }) {
  const info = await fetch(`${baseUrl}?info`);
  if (!info.ok) throw new Error('Soft1 endpoint unreachable');

  const login = await postJson(baseUrl, {
    service: 'login', appId, username, password, enc: 'utf8',
  });
  if (!login.success) throw new Soft1Error(login.errorcode, login.error);

  const ctx = login.objs[0];
  const auth = await postJson(baseUrl, {
    service: 'authenticate', appId, clientID: login.clientID,
    COMPANY: ctx.COMPANY, BRANCH: ctx.BRANCH, MODULE: ctx.MODULE, REFID: ctx.REFID,
    enc: 'utf8',
  });
  if (!auth.success) throw new Soft1Error(auth.errorcode, auth.error);

  localStorage.setItem('soft1.session', JSON.stringify({
    baseUrl, appId, clientID: auth.clientID, username,
    companyinfo: auth.companyinfo, companyImage: auth.image,
    context: ctx, driverRefId: ctx.REFID,
    loggedInAt: new Date().toISOString(),
  }));

  return auth;
}
```

## 7. Login-screen inputs
| Field          | Example            | Used for                                                 |
|----------------|--------------------|----------------------------------------------------------|
| Serial Number  | `01104398142024`   | Builds base URL `https://<SN>.oncloud.gr/s1services`.     |
| App ID         | `1199`             | Passed on every request (`appId`).                        |
| Username       | `aimodule`         | Login body.                                               |
| Password       | `aimodule`         | Login body (never persisted).                             |
